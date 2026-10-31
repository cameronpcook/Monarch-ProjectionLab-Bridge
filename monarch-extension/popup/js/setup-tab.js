// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/setup-tab.js
// Setup tab: ProjectionLab key, Monarch sign-in (with saved-session reuse and 2FA).
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── SETUP tab ────────────────────────────────────────────────

function isCspError(msg) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return msg.startsWith('CSP_BLOCKED:')
    || m.includes('content security policy')
    || m.includes('unsafe-eval')
    || m.includes('evalerror');
}

function showCspWarning() {
  // Replace the PL section with a prominent warning that explains the situation
  const existingWarning = byId('cspWarning');
  if (existingWarning) return; // already shown

  const warning = document.createElement('div');
  warning.id = 'cspWarning';
  warning.className = 'csp-warning';
  warning.innerHTML = `
    <div class="csp-warning-icon">⚠</div>
    <div class="csp-warning-body">
      <div class="csp-warning-title">ProjectionLab API Access Blocked</div>
      <div class="csp-warning-msg">
        ProjectionLab appears to have added a Content Security Policy that prevents
        this extension from communicating with it. This is a compatibility issue that
        requires an extension update.
      </div>
      <div class="csp-warning-msg" style="margin-top:6px">
        Please <a href="https://github.com/cameronpcook/Monarch-ProjectionLab-Bridge/issues" target="_blank" style="color:var(--amber)">open a GitHub issue</a>
        or check for an updated version of this extension.
      </div>
    </div>
  `;

  // Insert after the PL API key section
  const plSection = byId('fetchPlAccounts')?.closest('.section');
  if (plSection) plSection.after(warning);
}

function setupSetup() {
  byId('toggleApiKey').addEventListener('click', () => {
    const f = byId('plApiKey');
    f.type = f.type === 'password' ? 'text' : 'password';
  });

  byId('fetchPlAccounts').addEventListener('click', async () => {
    const key = byId('plApiKey').value.trim();
    if (!key) { toast('Enter your PL API key first', 'err'); return; }
    // Save key before fetching so it's persisted even if fetch fails
    S.plApiKey = key;
    await save();
    setLoading('fetchPlAccounts', true);
    status('plFetchStatus', 'Connecting to ProjectionLab…', 'loading');
    try {
      const data = await msg('PL_EXPORT_DATA', { key: S.plApiKey });
      if (data?.error) throw new Error(data.error);
      S.plAccounts = extractPLAccounts(data);
      S.plExpenses = extractPLExpenses(data);
      await save();
      const counts = S.plAccounts.reduce((acc, a) => { acc[a.category]=(acc[a.category]||0)+1; return acc; }, {});
      const summary = Object.entries(counts).map(([k,v]) => `${v} ${k}`).join(', ');
      const planCount = new Set(S.plExpenses.map(e => e.planId)).size;
      status('plFetchStatus', `✓ ${planCount} plan${planCount !== 1 ? 's' : ''}, ${S.plAccounts.length} accounts: ${summary}`, 'ok');
      byId('plStatus').className = 'status-dot ready';
      detectStaleMappings();
      renderMapping();
    } catch (e) {
      if (isCspError(e.message)) {
        byId('plStatus').className = 'status-dot error';
        showCspWarning();
      }
      status('plFetchStatus', `✗ ${e.message}`, 'err');
    }
    finally { setLoading('fetchPlAccounts', false); }
  });

  byId('clearStaleMappings').addEventListener('click', async () => {
    const removed = clearStaleMappings();
    await save();
    byId('staleWarningRow').classList.add('hidden');
    renderMapping(); renderMerge(); renderBudgetMapping();
    toast(`Cleared ${removed} stale reference${removed !== 1 ? 's' : ''}`, 'ok');
  });

  // Monarch credentials
  byId('monarchEmail').addEventListener('change', async () => {
    const email = byId('monarchEmail').value.trim();
    if (email !== S.monarchEmail) S.monarchSessionToken = '';
    S.monarchEmail = email;
    await save();
  });
  byId('monarchPassword').addEventListener('change', async () => {
    S.monarchPassword = byId('monarchPassword').value;
    await save();
  });
  byId('toggleMonarchPassword').addEventListener('click', () => {
    const f = byId('monarchPassword');
    f.type = f.type === 'password' ? 'text' : 'password';
  });

  // Shared: load accounts + budgets after session is established
  async function loadMonarchData() {
    const data = await msg('FETCH_MONARCH_ACCOUNTS');
    if (data?.error) throw new Error(data.error);
    S.monarchAccounts = data.accounts;
    try {
      const budgetData = await msg('FETCH_MONARCH_BUDGETS');
      if (!budgetData?.error && Array.isArray(budgetData?.budgets)) {
        S.monarchBudgets = budgetData.budgets.map(b => {
          const rawMonths = b.monthlyAmounts || [];
          const latest = rawMonths[rawMonths.length - 1] || {};
          return { categoryId: b.categoryId, categoryName: b.categoryName, groupName: b.groupName || '', monthlyAmounts: rawMonths, monthlyAmount: latest.plannedCashFlowAmount ?? 0 };
        }).filter(b => b.monthlyAmount !== 0 || true);
        const validCategoryIds = new Set(S.monarchBudgets.map(b => b.categoryId));
        let budgetPruned = 0;
        for (const cid of Object.keys(S.budgetMappings)) {
          if (!validCategoryIds.has(cid)) { delete S.budgetMappings[cid]; budgetPruned++; }
        }
        S.budgetMergeGroups = S.budgetMergeGroups.filter(g => {
          const before = g.categoryIds.length;
          g.categoryIds = g.categoryIds.filter(cid => validCategoryIds.has(cid));
          budgetPruned += before - g.categoryIds.length;
          return g.categoryIds.length >= 1;
        });
        if (budgetPruned > 0) console.info(`[Monarch Bridge] Pruned ${budgetPruned} stale budget category reference(s)`);
      }
    } catch (_) { /* non-fatal */ }
    const currentIds = new Set(S.monarchAccounts.map(a => a.id));
    let pruned = 0;
    for (const id of Object.keys(S.pendingCreations)) { if (!currentIds.has(id)) { delete S.pendingCreations[id]; pruned++; } }
    for (const id of Object.keys(S.mappings)) { if (!currentIds.has(id)) { delete S.mappings[id]; pruned++; } }
    for (const g of S.mergeGroups) {
      const before = g.monarchIds.length;
      g.monarchIds = g.monarchIds.filter(id => currentIds.has(id));
      if (g.fieldMappings) g.fieldMappings = g.fieldMappings.filter(fm => currentIds.has(fm.monarchId));
      pruned += before - g.monarchIds.length;
    }
    await save();
    const pruneNote = pruned ? ` (${pruned} stale reference${pruned>1?'s':''} removed)` : '';
    const catNote = S.monarchBudgets.length ? `, ${S.monarchBudgets.length} budget categor${S.monarchBudgets.length===1?'y':'ies'}` : '';
    status('monarchFetchStatus', `✓ ${S.monarchAccounts.length} accounts${catNote} loaded${pruneNote}`, 'ok');
    byId('monarchStatus').className = 'status-dot ready';
    renderMapping();
    if (pruned) renderMerge();
  }

  byId('fetchMonarchAccounts').addEventListener('click', async () => {
    byId('mfaCodeRow').classList.add('hidden');
    setLoading('fetchMonarchAccounts', true);
    status('monarchFetchStatus', 'Connecting to Monarch…', 'loading');
    try {
      // Reuse the saved Monarch session; only log in again once it has expired.
      if (S.monarchSessionToken) {
        status('monarchFetchStatus', 'Loading data…', 'loading');
        try {
          await loadMonarchData();
          return;
        } catch (e) {
          if (!e.message?.includes('TOKEN_EXPIRED')) throw e;
          S.monarchSessionToken = '';
          await save();
        }
      }
      if (!S.monarchEmail || !S.monarchPassword) {
        status('monarchFetchStatus', S.monarchEmail
          ? '✗ Your Monarch session expired — enter your password above to sign in again'
          : '✗ Enter your Monarch email and password above', 'err');
        return;
      }
      const auth = await msg('MONARCH_INITIATE_LOGIN', { password: S.monarchPassword });
      if (auth?.error) throw new Error(auth.error);
      if (auth.requires_mfa) {
        status('monarchFetchStatus', 'Check your authenticator app and enter the 6-digit code below', 'pending');
        byId('mfaCodeRow').classList.remove('hidden');
        byId('monarchMfaCode').value = '';
        byId('monarchMfaCode').focus();
        return;
      }
      S.monarchSessionToken = auth.token;
      await save();
      status('monarchFetchStatus', 'Signed in — loading data…', 'loading');
      await loadMonarchData();
    } catch (e) {
      const expired = e.message?.includes('TOKEN_EXPIRED');
      if (expired) { S.monarchSessionToken = ''; await save(); }
      status('monarchFetchStatus', `✗ ${expired ? 'Session expired — click Load from Monarch to sign in again' : e.message}`, 'err');
      byId('monarchStatus').className = 'status-dot error';
    } finally { setLoading('fetchMonarchAccounts', false); }
  });

  byId('monarchMfaCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); byId('verifyMfaCode').click(); }
  });

  byId('verifyMfaCode').addEventListener('click', async () => {
    const code = byId('monarchMfaCode').value.replace(/\s/g, '');
    if (!code || code.length < 6) { status('mfaVerifyStatus', '✗ Enter the 6-digit code', 'err'); return; }
    setLoading('verifyMfaCode', true);
    status('mfaVerifyStatus', 'Verifying…', 'loading');
    try {
      const result = await msg('MONARCH_COMPLETE_MFA', { code, password: S.monarchPassword });
      if (result?.error) throw new Error(result.error);
      S.monarchSessionToken = result.token;
      await save();
      byId('mfaCodeRow').classList.add('hidden');
      status('mfaVerifyStatus', '', '');
      status('monarchFetchStatus', 'MFA verified — loading data…', 'loading');
      await loadMonarchData();
    } catch (e) {
      status('mfaVerifyStatus', `✗ ${e.message}`, 'err');
    } finally { setLoading('verifyMfaCode', false); }
  });

  // ── Donate button ────────────────────────
  byId('donateChip').addEventListener('click', () => {
    window.open('https://buy.stripe.com/7sY28s6SXcM176D0JSfbq00', '_blank');
  });

  byId('debugExportBtn').addEventListener('click', async () => {
    if (!S.plApiKey) { toast('Enter your PL API key first', 'err'); return; }
    if (!S.plAccounts.length) { toast('Fetch from PL first', 'err'); return; }
    setLoading('debugExportBtn', true);
    try {
      const data = await msg('PL_EXPORT_DATA', { key: S.plApiKey });
      if (data?.error) throw new Error(data.error);
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) { toast(e.message, 'err'); }
    finally { setLoading('debugExportBtn', false); }
  });
}
