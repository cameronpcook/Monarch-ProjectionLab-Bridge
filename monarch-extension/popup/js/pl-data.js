// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/pl-data.js
// Reading ProjectionLab exports, stale-mapping detection, and budget amount calculations.
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── PL Account Extractor ─────────────────────────────────────
// Returns a count of stale references and shows/hides the warning row.
function detectStaleMappings() {
  const validPlRealIds = new Set(S.plAccounts.map(a => a.id.replace(/__balance$|__initialValue$/, '')));
  const validExpenseKeys = new Set(S.plExpenses.map(e => e.planId + '::' + e.expenseId));

  let stale = 0;

  // Account mappings
  for (const [, m] of Object.entries(S.mappings)) {
    if (m?.plRealId && !validPlRealIds.has(m.plRealId)) stale++;
  }
  // Merge groups (non-pending)
  for (const g of S.mergeGroups) {
    if (g.plRealId && !g.pendingCreate && !validPlRealIds.has(g.plRealId)) stale++;
  }
  // Budget mappings
  for (const targets of Object.values(S.budgetMappings)) {
    for (const t of targets) {
      if (t.expenseId !== '__CREATE_NEW__' && !validExpenseKeys.has(t.planId + '::' + t.expenseId)) stale++;
    }
  }
  // Budget merge group mappings
  for (const g of S.budgetMergeGroups) {
    for (const t of g.mappings || []) {
      if (t.expenseId !== '__CREATE_NEW__' && !validExpenseKeys.has(t.planId + '::' + t.expenseId)) stale++;
    }
  }

  const row = byId('staleWarningRow');
  if (stale > 0) {
    byId('staleWarningText').textContent = `⚠ ${stale} stale mapping${stale !== 1 ? 's' : ''} detected`;
    row.classList.remove('hidden');
  } else {
    row.classList.add('hidden');
  }
  return stale;
}

// Removes all mappings pointing at PL IDs that no longer exist. Returns count removed.
function clearStaleMappings() {
  const validPlRealIds = new Set(S.plAccounts.map(a => a.id.replace(/__balance$|__initialValue$/, '')));
  const validExpenseKeys = new Set(S.plExpenses.map(e => e.planId + '::' + e.expenseId));
  let removed = 0;

  // Account mappings
  for (const monarchId of Object.keys(S.mappings)) {
    const m = S.mappings[monarchId];
    if (m?.plRealId && !validPlRealIds.has(m.plRealId)) {
      delete S.mappings[monarchId]; removed++;
    }
  }
  // Merge groups
  for (const g of S.mergeGroups) {
    if (g.plRealId && !g.pendingCreate && !validPlRealIds.has(g.plRealId)) {
      g.plId = null; g.plRealId = null; g.plField = null; removed++;
    }
  }
  // Budget mappings
  for (const [cid, targets] of Object.entries(S.budgetMappings)) {
    const before = targets.length;
    S.budgetMappings[cid] = targets.filter(t =>
      t.expenseId === '__CREATE_NEW__' || validExpenseKeys.has(t.planId + '::' + t.expenseId)
    );
    removed += before - S.budgetMappings[cid].length;
    if (!S.budgetMappings[cid].length) delete S.budgetMappings[cid];
  }
  // Budget merge group mappings
  for (const g of S.budgetMergeGroups) {
    const before = (g.mappings || []).length;
    g.mappings = (g.mappings || []).filter(t =>
      t.expenseId === '__CREATE_NEW__' || validExpenseKeys.has(t.planId + '::' + t.expenseId)
    );
    removed += before - g.mappings.length;
  }

  return removed;
}

function extractPLAccounts(exportData) {
  const today = exportData?.today ?? exportData?.currentFinances ?? exportData;
  if (!today) return [];
  const results = [];
  for (const a of (today.savingsAccounts    || [])) {
    if (!a.id || !a.name) continue;
    results.push({ id: String(a.id), name: a.name.trim(), category: 'savings',    writeField: 'balance', balance: a.balance ?? 0 });
  }
  for (const a of (today.investmentAccounts || [])) {
    if (!a.id || !a.name) continue;
    results.push({ id: String(a.id), name: a.name.trim(), category: 'investment', writeField: 'balance', balance: a.balance ?? 0 });
  }
  for (const a of (today.debts              || [])) {
    if (!a.id || !a.name) continue;
    results.push({ id: String(a.id), name: a.name.trim(), category: 'debt',       writeField: 'amount',  balance: a.amount  ?? 0 });
  }
  for (const a of (today.assets             || [])) {
    if (!a.id || !a.name) continue;
    const base = { id: String(a.id), name: a.name.trim(), category: 'asset', balance: a.amount ?? 0, amount: a.amount ?? 0, initialValue: a.initialValue ?? 0 };
    results.push({ ...base, writeField: 'amount',  subLabel: 'Current Value', displayBal: base.amount });
    results.push({ ...base, writeField: 'balance', subLabel: 'Loan Balance',  displayBal: base.balance, id: base.id+'__balance' });
  }
  return results.sort((a, b) => {
    const o = { savings:0, investment:1, debt:2, asset:3 };
    const co = (o[a.category]??9) - (o[b.category]??9);
    return co !== 0 ? co : a.name.localeCompare(b.name);
  });
}

// ── PL Plan Expense Extractor ────────────────────────────────
function extractPLExpenses(exportData) {
  const plans = exportData?.plans || [];
  const results = [];
  for (const plan of plans) {
    const events = plan.expenses?.events || [];
    for (const e of events) {
      if (!e.id || !e.name) continue;
      // Skip debt-linked events (they have debtId) — those are synced via account mapping
      if (e.debtId) continue;
      results.push({
        planId:         plan.id,
        planName:       plan.name || plan.id,
        expenseId:      e.id,
        expenseName:    e.name,
        amount:         e.amount ?? 0,
        frequency:      e.frequency || 'monthly',
        expType:        e.type || 'living-expenses',
        monthlyPayment: e.monthlyPayment ?? null, // debt type only
        key:            plan.id + '::' + e.id,
      });
    }
  }
  // Sort by plan name then expense name
  return results.sort((a, b) =>
    a.planName.localeCompare(b.planName) || a.expenseName.localeCompare(b.expenseName)
  );
}

// Compute the correct PL write field and sync amount for a budget→expense mapping.
// Different PL expense types store their "payment amount" differently:
//   debt:     monthlyPayment field (not amount, which is the balance)
//   once:     amount, but a monthly budget can't meaningfully map to a one-time expense
//   yearly:   amount, converted monthly→yearly
//   monthly:  amount, 1:1
function computeBudgetSync(expDef, monarchMonthlyAmount) {
  if (!expDef) return { writeField: 'amount', syncAmount: monarchMonthlyAmount, freqLabel: '/mo', warn: null };

  const freq    = expDef.frequency || 'monthly';
  const expType = expDef.expType   || 'living-expenses';

  // Debt: budget maps to monthlyPayment, not the balance (amount field)
  if (expType === 'debt') {
    return { writeField: 'monthlyPayment', syncAmount: monarchMonthlyAmount, freqLabel: '/mo', warn: null };
  }

  // One-time expenses: no meaningful periodic conversion — warn, write as-is
  if (freq === 'once') {
    return {
      writeField: 'amount', syncAmount: monarchMonthlyAmount, freqLabel: '',
      warn: 'One-time expense — Monarch monthly amount written as-is. Consider setting this manually in PL.',
    };
  }

  // Find the matching PL freq option and apply its conversion
  const opt = PL_FREQ_OPTIONS.find(o => o.value === freq);
  if (opt) {
    const syncAmount = opt.convert(monarchMonthlyAmount);
    const freqLabel  = `/${(freq === 'yearly' || freq === 'yearly-lump-sum') ? 'yr' : freq} (${opt.hint})`;
    return { writeField: 'amount', syncAmount, freqLabel, warn: null };
  }

  // Fallback: monthly 1:1
  return { writeField: 'amount', syncAmount: monarchMonthlyAmount, freqLabel: '/mo', warn: null };
}

// Resolve the monthly amount for a budget category.
// override: per-item {mode,lookback,aggregation} — if null/undefined, falls back to global settings.
// Planned mode: defaults to most-recent month; supports lookback + aggregation over plannedCashFlowAmount.
// Actual mode:  supports lookback + aggregation over actualAmount (abs value — outflows are negative).
const VALID_BUDGET_MODES = new Set(['', 'planned', 'actual']);
const VALID_AGGREGATIONS = new Set(['average', 'median']);

// Sanitize a single override object, returning null if it's not a valid object.
function sanitizeBudgetSourceOverride(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const mode = VALID_BUDGET_MODES.has(obj.mode) ? obj.mode : '';
  const rawLookback = Number(obj.lookback);
  const lookback = Number.isFinite(rawLookback) ? Math.max(1, Math.min(12, Math.round(rawLookback))) : (mode === 'actual' ? 3 : 1);
  const aggregation = VALID_AGGREGATIONS.has(obj.aggregation) ? obj.aggregation : 'average';
  return { mode, lookback, aggregation };
}

// Sanitize the full budgetSourceOverrides map loaded from storage.
function sanitizeBudgetSourceOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [cid, val] of Object.entries(raw)) {
    const sanitized = sanitizeBudgetSourceOverride(val);
    if (sanitized) out[cid] = sanitized;
  }
  return out;
}

function resolveMonarchAmount(b, override = null) {
  const src = override != null ? override : (S.settings.budgetSource || {});
  const mode = VALID_BUDGET_MODES.has(src.mode) ? (src.mode || 'planned') : 'planned';
  const months = b.monthlyAmounts || [];

  if (!months.length) return b.monthlyAmount ?? 0;

  if (mode === 'planned') {
    // Default: most-recent month only (lookback = 1). User can override.
    const rawLookback = Number(src.lookback);
    const lookback = Math.max(1, Math.min(Number.isFinite(rawLookback) ? rawLookback : 1, months.length));
    const recent = months.slice(-lookback);
    const values = recent.map(m => m.plannedCashFlowAmount ?? 0);
    if (!values.length) return b.monthlyAmount ?? 0;
    const agg = VALID_AGGREGATIONS.has(src.aggregation) ? src.aggregation : 'average';
    if (agg === 'median') {
      const sorted = [...values].sort((a, bv) => a - bv);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  // Actual mode: actualAmount is typically negative (cash outflow), take abs value
  const rawLookback = Number(src.lookback);
  const lookback = Math.max(1, Math.min(Number.isFinite(rawLookback) ? rawLookback : 3, months.length));
  const recent = months.slice(-lookback);
  const values = recent
    .map(m => (m.actualAmount != null ? Math.abs(m.actualAmount) : null))
    .filter(v => v !== null);

  if (!values.length) return b.monthlyAmount ?? 0;

  const agg = VALID_AGGREGATIONS.has(src.aggregation) ? src.aggregation : 'average';
  if (agg === 'median') {
    const sorted = [...values].sort((a, bv) => a - bv);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// Short human-readable label describing the resolved source.
// override: per-item override or null to use global settings.
function budgetSourceLabel(override = null) {
  const src = override != null ? override : (S.settings.budgetSource || {});
  const mode = src.mode || 'planned';
  const defaultLookback = mode === 'actual' ? 3 : 1;
  const lookback = src.lookback || defaultLookback;
  const agg = src.aggregation || 'average';
  const aggShort = { average: 'avg', median: 'med' }[agg] || agg;
  if (mode === 'planned') {
    return lookback === 1 ? 'planned (latest)' : `${aggShort} ${lookback}mo planned`;
  }
  return `${aggShort} ${lookback}mo actual`;
}

// Resolve the effective source override for one category within a merge group.
// Respects group.sourceModeAll: true/undefined = use group-level override; false = per-category.
function getGroupCategoryOverride(g, categoryId) {
  if (g.sourceModeAll === false) return S.budgetSourceOverrides[categoryId] || null;
  return g.sourceOverride || null;
}

// Resolve the effective source override for an individual budget category row.
// Priority: group-level override → per-category override → null (global default).
function getEffectiveBudgetOverride(categoryId) {
  const b = S.monarchBudgets.find(x => x.categoryId === categoryId);
  const groupName = b?.groupName || 'Other';
  return S.budgetGroupSourceOverrides[groupName] || S.budgetSourceOverrides[categoryId] || null;
}

function resolvePlMapping(plId) {
  if (plId.endsWith('__balance'))      return { realId: plId.replace('__balance',''),       field: 'balance' };
  if (plId.endsWith('__initialValue')) return { realId: plId.replace('__initialValue',''), field: 'initialValue' };
  const acct = S.plAccounts.find(a => a.id === plId);
  // Debts use 'amount'; everything else uses 'balance'. Never default to 'balance' for debts.
  const field = acct ? acct.writeField : 'balance';
  return { realId: plId, field };
}

// Re-resolve the correct write field for a saved mapping against current S.plAccounts.
// Corrects stale mappings that were saved with the wrong plField (e.g. 'balance' for a debt).
function correctPlField(plId, storedField) {
  if (plId.endsWith('__balance'))      return 'balance';
  if (plId.endsWith('__initialValue')) return 'initialValue';
  const acct = S.plAccounts.find(a => a.id === plId);
  if (acct) return acct.writeField;  // always trust live PL account data over stored value
  return storedField;                // fall back to stored if PL not loaded
}

// ── Visible accounts (respects showHidden setting) ────────────
function visibleMonarchAccounts() {
  if (S.settings.showHidden) return S.monarchAccounts;
  return S.monarchAccounts.filter(a => a.isHidden !== true);
}
