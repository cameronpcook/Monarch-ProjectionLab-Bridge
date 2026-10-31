// Tests for monarch-extension/background/service-worker.js.
// Runs the real service worker in a sandbox with fake chrome.* APIs and a fake
// Monarch server, so no network access or credentials are needed.
// Run: node --test tests/
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SW_PATH = path.join(__dirname, '..', 'monarch-extension', 'background', 'service-worker.js');
const J = x => JSON.parse(JSON.stringify(x)); // normalize objects from the sandbox

function loadServiceWorker(initialStore = {}) {
  const store = { monarchEmail: 'me@example.com', monarchPassword: 'pw', settings: {}, ...initialStore };
  const calls = [];
  const badge = { text: '', title: '' };
  const listeners = {};
  const fake = { mfaRequired: false, expired: false };
  const on = name => ({ addListener: f => { listeners[name] = f; } });
  const chrome = {
    storage: {
      local: {
        get: async k => { const o = {}; (Array.isArray(k) ? k : [k]).forEach(x => { if (x in store) o[x] = store[x]; }); return o; },
        set: async o => { Object.assign(store, o); },
        clear: async () => { for (const k of Object.keys(store)) delete store[k]; },
      },
      onChanged: on('storageChanged'),
    },
    runtime: { onMessage: on('message'), onInstalled: on('installed'), onStartup: on('startup'), sendMessage: async () => {} },
    alarms: { create: () => {}, onAlarm: on('alarm') },
    action: {
      setBadgeText: async ({ text }) => { badge.text = text; },
      setBadgeBackgroundColor: async () => {},
      setTitle: async ({ title }) => { badge.title = title; },
    },
    tabs: {}, scripting: {},
  };
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  async function fetch(url, opts) {
    calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null, headers: opts?.headers });
    if (url === 'https://api.monarch.com/auth/login/') {
      const b = JSON.parse(opts.body);
      if (b.password !== 'pw') return reply(401, { detail: 'Bad credentials' });
      if (fake.mfaRequired && !b.totp) return reply(403, { detail: 'MFA required' });
      if (b.totp === '000000') return reply(400, { detail: 'Invalid code' });
      return reply(200, { token: b.totp ? 'TOK_MFA' : 'TOK' });
    }
    if (url === 'https://api.monarch.com/graphql') {
      if (fake.expired) return reply(401, {});
      const { operationName } = JSON.parse(opts.body);
      if (operationName === 'GetAccounts') return reply(200, { data: { accountTypeSummaries: [
        { accounts: [{ id: '1', displayName: 'Checking', displayBalance: 100 }] },
        { accounts: [{ id: '2', name: 'Mortgage', currentBalance: -5 }] }] } });
      if (operationName === 'GetCategories') return reply(200, { data: { categories: [
        { id: 'c1', name: 'Groceries', group: { name: 'Food', type: 'expense' } },
        { id: 'c2', name: 'Paycheck', group: { name: 'Income', type: 'income' } }] } });
      if (operationName === 'GetJointPlanningData') return reply(200, { data: { budgetData: { monthlyAmountsByCategory: [
        { category: { id: 'c1' }, monthlyAmounts: [{ month: '2026-10-01', plannedCashFlowAmount: 500, actualAmount: 450 }] },
        { category: { id: 'c2' }, monthlyAmounts: [] }] } } });
    }
    throw new Error('unexpected fetch ' + url);
  }
  vm.runInNewContext(fs.readFileSync(SW_PATH, 'utf8'),
    { chrome, fetch, console, setTimeout, clearTimeout, AbortController, URL, crypto, TextEncoder });
  const send = m => new Promise(r => listeners.message(m, {}, r));
  return { store, calls, badge, listeners, fake, send };
}

test('signs in and saves the session token', async () => {
  const sw = loadServiceWorker();
  const r = await sw.send({ type: 'MONARCH_INITIATE_LOGIN' });
  assert.deepStrictEqual(J(r), { ok: true, requires_mfa: false, token: 'TOK' });
  assert.strictEqual(sw.store.monarchSessionToken, 'TOK');
});

test('uses the password from the popup when none is saved', async () => {
  const sw = loadServiceWorker({ monarchPassword: '' });
  const missing = await sw.send({ type: 'MONARCH_INITIATE_LOGIN' });
  assert.match(missing.error, /Enter your Monarch email and password/);
  const r = await sw.send({ type: 'MONARCH_INITIATE_LOGIN', password: 'pw' });
  assert.strictEqual(r.token, 'TOK');
  assert.strictEqual(sw.store.monarchPassword, '', 'password must not be written to storage');
});

test('reports a wrong password', async () => {
  const sw = loadServiceWorker({ monarchPassword: 'nope' });
  const r = await sw.send({ type: 'MONARCH_INITIATE_LOGIN' });
  assert.strictEqual(r.error, 'Bad credentials');
});

test('asks for a 2FA code, then completes sign-in with it', async () => {
  const sw = loadServiceWorker();
  sw.fake.mfaRequired = true;
  const r = await sw.send({ type: 'MONARCH_INITIATE_LOGIN' });
  assert.strictEqual(r.requires_mfa, true);
  const bad = await sw.send({ type: 'MONARCH_COMPLETE_MFA', code: '000000' });
  assert.strictEqual(bad.error, 'Invalid code');
  const ok = await sw.send({ type: 'MONARCH_COMPLETE_MFA', code: '123456' });
  assert.strictEqual(ok.token, 'TOK_MFA');
  assert.strictEqual(sw.store.monarchSessionToken, 'TOK_MFA');
});

test('generates the 2FA code itself when a TOTP secret is saved', async () => {
  const sw = loadServiceWorker({ settings: { monarchMfaEnabled: true, monarchMfaSecret: 'JBSWY3DPEHPK3PXP' } });
  sw.fake.mfaRequired = true;
  const r = await sw.send({ type: 'MONARCH_INITIATE_LOGIN' });
  assert.deepStrictEqual([r.requires_mfa, r.token], [false, 'TOK_MFA']);
  assert.match(sw.calls.at(-1).body.totp, /^\d{6}$/);
  const refresh = await sw.send({ type: 'MONARCH_REFRESH_SESSION' });
  assert.strictEqual(refresh.ok, true);
});

test('loads accounts and expense budgets in the shape the popup expects', async () => {
  const sw = loadServiceWorker({ monarchSessionToken: 'TOK' });
  const acc = await sw.send({ type: 'FETCH_MONARCH_ACCOUNTS' });
  assert.deepStrictEqual(J(acc.accounts.map(a => [a.id, a.name, a.balance])), [['1', 'Checking', 100], ['2', 'Mortgage', -5]]);
  assert.strictEqual(sw.calls[0].headers.Authorization, 'Token TOK');
  const bud = await sw.send({ type: 'FETCH_MONARCH_BUDGETS' });
  assert.deepStrictEqual(J(bud.budgets), [{ categoryId: 'c1', categoryName: 'Groceries', groupName: 'Food',
    monthlyAmounts: [{ month: '2026-10-01', plannedCashFlowAmount: 500, actualAmount: 450 }] }]);
});

test('reports an expired session as TOKEN_EXPIRED', async () => {
  const sw = loadServiceWorker({ monarchSessionToken: 'OLD' });
  sw.fake.expired = true;
  const r = await sw.send({ type: 'FETCH_MONARCH_ACCOUNTS' });
  assert.match(r.error, /^TOKEN_EXPIRED/);
});

test('only ever contacts Monarch, and removed message types are gone', async () => {
  const sw = loadServiceWorker({ monarchSessionToken: 'TOK' });
  await sw.send({ type: 'MONARCH_INITIATE_LOGIN' });
  await sw.send({ type: 'FETCH_MONARCH_ACCOUNTS' });
  await sw.send({ type: 'FETCH_MONARCH_BUDGETS' });
  for (const t of ['FIREBASE_SIGN_IN', 'FIREBASE_SAVE_BACKUP']) {
    assert.match((await sw.send({ type: t })).error, /Unknown message type/);
  }
  assert.ok(sw.calls.every(c => c.url.startsWith('https://api.monarch.com/')));
});

test('sync reminder badge appears after the configured number of days', async () => {
  const day = 24 * 3600 * 1000;
  const sw = loadServiceWorker({ lastSyncAt: Date.now() - 9 * day, settings: { staleReminderDays: 7 } });
  sw.listeners.installed();
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(sw.badge.text, '9d');
  assert.match(sw.badge.title, /last synced 9 days ago/);

  // A fresh sync clears it (the popup writes lastSyncAt; storage change triggers an update)
  sw.store.lastSyncAt = Date.now();
  sw.listeners.storageChanged({ lastSyncAt: {} }, 'local');
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(sw.badge.text, '');

  // 0 days turns it off; never-synced shows nothing
  sw.store.lastSyncAt = Date.now() - 30 * day;
  sw.store.settings = { staleReminderDays: 0 };
  sw.listeners.alarm({ name: 'stale-badge' });
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(sw.badge.text, '');
  const fresh = loadServiceWorker({ settings: { staleReminderDays: 7 } });
  fresh.listeners.startup();
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(fresh.badge.text, '');
});
