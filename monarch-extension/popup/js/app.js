// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/app.js
// Startup, storage load/save, tab switching, and renderAll. Loaded last.
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── Boot ─────────────────────────────────────────────────────
// Listen for warnings from the service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WARN_MULTI_TAB') {
    toast(`⚠ Multiple PL tabs open — using most recent: "${msg.tabTitle}"`, 'err');
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadFromStorage();
  setupTabs();
  setupSetup();
  setupMapping();
  setupMappingListDelegation();
  setupMerge();
  setupMergeSourceListDelegation();
  setupMergeGroupListDelegation();
  setupBudgetMergeBuilderDelegation();
  setupBudgetMapping();
  setupBudgetMappingListDelegation();
  setupSync();
  setupSettings();
  renderAll();
  checkPLStatus();
});

// ── Storage ──────────────────────────────────────────────────
async function loadFromStorage() {
  const d = await msg('STORAGE_GET', {
    keys: ['plApiKey','monarchEmail','monarchPassword','monarchSessionToken','lastSyncAt',
           'monarchAccounts','plAccounts',
           'mappings','pendingCreations','mergeGroups','settings',
           'monarchBudgets','plExpenses','budgetMappings','budgetMergeGroups',
           'budgetSourceOverrides','budgetGroupSourceOverrides'],
  });
  if (d.plApiKey)          S.plApiKey          = d.plApiKey;
  if (d.monarchEmail)           S.monarchEmail           = d.monarchEmail;
  if (d.monarchPassword)        S.monarchPassword        = d.monarchPassword;
  if (d.monarchSessionToken)    S.monarchSessionToken    = d.monarchSessionToken;
  if (d.lastSyncAt)             S.lastSyncAt             = d.lastSyncAt;
  if (d.monarchAccounts)   S.monarchAccounts   = d.monarchAccounts;
  if (d.plAccounts)        S.plAccounts        = d.plAccounts;
  if (d.mappings)          S.mappings          = d.mappings;
  if (d.pendingCreations)  S.pendingCreations  = d.pendingCreations;
  if (d.mergeGroups)       S.mergeGroups       = d.mergeGroups;
  if (d.settings)          S.settings          = { ...S.settings, ...d.settings };
  if (d.monarchBudgets)    S.monarchBudgets    = d.monarchBudgets;
  if (d.plExpenses)        S.plExpenses        = d.plExpenses;
  if (d.budgetMappings)    S.budgetMappings    = d.budgetMappings;
  if (d.budgetMergeGroups)     S.budgetMergeGroups     = d.budgetMergeGroups;
  if (d.budgetSourceOverrides)      S.budgetSourceOverrides      = sanitizeBudgetSourceOverrides(d.budgetSourceOverrides);
  if (d.budgetGroupSourceOverrides) S.budgetGroupSourceOverrides = sanitizeBudgetSourceOverrides(d.budgetGroupSourceOverrides);

  byId('plApiKey').value         = S.plApiKey;
  byId('monarchEmail').value     = S.monarchEmail;
  byId('monarchPassword').value  = S.monarchPassword;
  if (S.monarchSessionToken) {
    status('monarchFetchStatus', 'Signed in — click Load from Monarch to refresh data', 'ok');
  }
}

async function save() {
  await msg('STORAGE_SET', { data: {
    plApiKey: S.plApiKey, monarchEmail: S.monarchEmail,
    // Only persist the password when the user wants it remembered
    monarchPassword: S.settings.rememberPassword === false ? '' : S.monarchPassword,
    monarchSessionToken: S.monarchSessionToken, lastSyncAt: S.lastSyncAt,
    monarchAccounts: S.monarchAccounts, plAccounts: S.plAccounts,
    mappings: S.mappings, pendingCreations: S.pendingCreations,
    mergeGroups: S.mergeGroups, settings: S.settings,
    monarchBudgets: S.monarchBudgets, plExpenses: S.plExpenses,
    budgetMappings: S.budgetMappings,
    budgetMergeGroups: S.budgetMergeGroups,
    budgetSourceOverrides: S.budgetSourceOverrides,
    budgetGroupSourceOverrides: S.budgetGroupSourceOverrides,
  }});
}

// ── Tab system ───────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      byId(`panel-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'sync') renderSync();
    });
  });

  // Sub-tab wiring inside Mapping panel
  document.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      byId(`sub-panel-${btn.dataset.sub}`).classList.add('active');
      if (btn.dataset.sub === 'budgets') renderBudgetMapping();
    });
  });
}

// ── PL status indicator ──────────────────────────────────────
async function checkPLStatus() {
  const dot = byId('plStatus');
  try {
    const tabs = await chrome.tabs.query({ url: 'https://app.projectionlab.com/*' });
    dot.className = 'status-dot ' + (tabs.length ? 'ready' : 'error');
  } catch { dot.className = 'status-dot error'; }
}

// ── Render all ───────────────────────────────────────────────
function renderAll() {
  renderMapping();
  renderMerge();
  renderBudgetMerges();
  renderBudgetMapping();
}
