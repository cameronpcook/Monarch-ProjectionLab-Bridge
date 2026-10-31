// Tests for the popup UI (monarch-extension/popup/). Opens the real popup page
// in headless Chromium with a fake chrome.* API and a fake background script.
// Run: node --test tests/   (needs: npm install && npx playwright install chromium)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const POPUP_URL = pathToFileURL(path.join(__dirname, '..', 'monarch-extension', 'popup', 'popup.html')).href;
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

// Fake background script: answers the popup's messages from an in-page store.
function installFakes(initialStore) {
  const store = initialStore;
  window.__store = store; window.__msgs = []; window.__expired = false;
  window.chrome = {
    storage: { local: { get: async () => ({ ...store }), set: async o => Object.assign(store, o) } },
    runtime: {
      onMessage: { addListener() {} },
      sendMessage: async m => {
        window.__msgs.push(m);
        switch (m.type) {
          case 'STORAGE_SET': Object.assign(store, m.data); return { ok: true };
          case 'STORAGE_GET': return { ...store };
          case 'FETCH_MONARCH_ACCOUNTS':
            if (window.__expired && store.monarchSessionToken === 'OLD') return { error: 'TOKEN_EXPIRED: expired' };
            return { accounts: [
              { id: 'a1', name: 'Checking', displayName: 'Checking', balance: 1200, type: { name: 'depository', display: 'Cash' }, subtype: { name: 'checking', display: 'Checking' }, isAsset: true },
              { id: 'a2', name: 'Mortgage', displayName: 'Mortgage', balance: -250000, type: { name: 'loan', display: 'Loans' }, subtype: { name: 'mortgage', display: 'Mortgage' }, isAsset: false },
            ] };
          case 'FETCH_MONARCH_BUDGETS':
            return { budgets: [{ categoryId: 'c1', categoryName: 'Groceries', groupName: 'Food',
              monthlyAmounts: [{ month: '2026-10-01', plannedCashFlowAmount: 600, actualAmount: 550 }] }] };
          case 'MONARCH_INITIATE_LOGIN':
            if (!m.password) return { error: 'Enter your Monarch email and password first' };
            store.monarchSessionToken = 'NEW';
            return { ok: true, requires_mfa: false, token: 'NEW' };
          default: return {};
        }
      },
    },
    tabs: { query: async () => [] },
  };
}

async function openPopup(store) {
  const page = await browser.newPage({ viewport: { width: 780, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(installFakes, store);
  await page.goto(POPUP_URL);
  await page.waitForFunction(() => document.getElementById('monarchEmail')?.value !== undefined);
  await page.waitForTimeout(300);
  return { page, errors };
}
const messages = page => page.evaluate(() => window.__msgs.map(m => m.type).filter(t => !t.startsWith('STORAGE')));
const statusText = page => page.textContent('#monarchFetchStatus');
async function clickLoad(page) {
  await page.evaluate(() => { window.__msgs = []; });
  await page.click('#fetchMonarchAccounts');
  await page.waitForFunction(() => !/Connecting|Loading|Signed in —/.test(document.getElementById('monarchFetchStatus').textContent));
}

test('fills in saved credentials and shows the saved session', async () => {
  const { page, errors } = await openPopup({ plApiKey: 'pl_key_x', monarchEmail: 'me@example.com', monarchPassword: 'pw', monarchSessionToken: 'OLD' });
  assert.deepStrictEqual(await page.evaluate(() => [plApiKey.value, monarchEmail.value, monarchPassword.value]), ['pl_key_x', 'me@example.com', 'pw']);
  assert.match(await statusText(page), /Signed in/);
  assert.deepStrictEqual(errors, []);
  await page.close();
});

test('reuses the saved Monarch session instead of signing in again', async () => {
  const { page, errors } = await openPopup({ monarchEmail: 'me@example.com', monarchPassword: 'pw', monarchSessionToken: 'OLD' });
  await clickLoad(page);
  assert.deepStrictEqual(await messages(page), ['FETCH_MONARCH_ACCOUNTS', 'FETCH_MONARCH_BUDGETS']);
  assert.match(await statusText(page), /2 accounts/);
  assert.deepStrictEqual(errors, []);
  await page.close();
});

test('signs in again automatically when the saved session has expired', async () => {
  const { page, errors } = await openPopup({ monarchEmail: 'me@example.com', monarchPassword: 'pw', monarchSessionToken: 'OLD' });
  await page.evaluate(() => { window.__expired = true; });
  await clickLoad(page);
  assert.deepStrictEqual(await messages(page), ['FETCH_MONARCH_ACCOUNTS', 'MONARCH_INITIATE_LOGIN', 'FETCH_MONARCH_ACCOUNTS', 'FETCH_MONARCH_BUDGETS']);
  assert.strictEqual(await page.evaluate(() => window.__store.monarchSessionToken), 'NEW');
  assert.deepStrictEqual(errors, []);
  await page.close();
});

test('"Remember password" off: password is not saved, but sign-in still works', async () => {
  const { page, errors } = await openPopup({ monarchEmail: 'me@example.com', monarchPassword: 'pw' });
  await page.click('.tab[data-tab="settings"]');
  await page.click('#settingRememberPassword + .toggle-track');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.evaluate(() => window.__store.monarchPassword), '');
  assert.strictEqual(await page.evaluate(() => window.__store.settings.rememberPassword), false);

  // Reopen: the password field is empty; type it and sign in
  const store = await page.evaluate(() => window.__store);
  await page.close();
  const second = await openPopup(store);
  assert.strictEqual(await second.page.inputValue('#monarchPassword'), '');
  await clickLoad(second.page);
  assert.match(await statusText(second.page), /enter your password/i);
  await second.page.fill('#monarchPassword', 'pw');
  await second.page.dispatchEvent('#monarchPassword', 'change');
  await clickLoad(second.page);
  const login = await second.page.evaluate(() => window.__msgs.find(m => m.type === 'MONARCH_INITIATE_LOGIN'));
  assert.strictEqual(login.password, 'pw');
  assert.strictEqual(await second.page.evaluate(() => window.__store.monarchPassword), '');
  assert.deepStrictEqual([...errors, ...second.errors], []);
  await second.page.close();
});

test('sync reminder days setting is saved and clamped', async () => {
  const { page, errors } = await openPopup({});
  await page.click('.tab[data-tab="settings"]');
  assert.strictEqual(await page.inputValue('#settingStaleDays'), '7');
  await page.fill('#settingStaleDays', '500');
  await page.dispatchEvent('#settingStaleDays', 'change');
  assert.strictEqual(await page.evaluate(() => window.__store.settings.staleReminderDays), 365);
  await page.fill('#settingStaleDays', '0');
  await page.dispatchEvent('#settingStaleDays', 'change');
  assert.strictEqual(await page.evaluate(() => window.__store.settings.staleReminderDays), 0);
  assert.deepStrictEqual(errors, []);
  await page.close();
});

test('backup files leave out the 2FA secret', async () => {
  const { page, errors } = await openPopup({ settings: { monarchMfaEnabled: true, monarchMfaSecret: 'SECRETSECRET' } });
  await page.click('.tab[data-tab="settings"]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportBackup')]);
  const text = require('node:fs').readFileSync(await download.path(), 'utf8');
  assert.ok(!text.includes('SECRETSECRET'));
  assert.ok(JSON.parse(text)._version);
  assert.deepStrictEqual(errors, []);
  await page.close();
});

test('every tab renders without errors after loading Monarch data', async () => {
  const { page, errors } = await openPopup({ monarchEmail: 'me@example.com', monarchPassword: 'pw', monarchSessionToken: 'OLD' });
  await clickLoad(page);
  for (const tab of ['mapping', 'merge', 'sync', 'settings', 'setup']) {
    await page.click(`.tab[data-tab="${tab}"]`);
    await page.waitForTimeout(100);
    assert.ok(await page.isVisible(`#panel-${tab}`), `${tab} panel visible`);
  }
  await page.click('.tab[data-tab="mapping"]');
  for (const sub of await page.$$eval('.sub-tab', els => els.map(e => e.dataset.sub))) {
    await page.click(`.sub-tab[data-sub="${sub}"]`);
    await page.waitForTimeout(100);
  }
  // Removed features stay removed
  const leftovers = await page.evaluate(() => ['accountChip', 'monarchApiUrl', 'settingHostedMode', 'settingDirectMode', 'btnCloudSave']
    .filter(id => document.getElementById(id)));
  assert.deepStrictEqual(leftovers, []);
  assert.deepStrictEqual(errors, []);
  await page.close();
});
