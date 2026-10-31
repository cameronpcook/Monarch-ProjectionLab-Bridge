// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/state.js
// Shared state (S), ProjectionLab type constants, and Monarch → PL category inference.
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── State ────────────────────────────────────────────────────
const S = {
  monarchAccounts:  [],  // [{name, balance, id, isHidden, type, subtype, ...}]
  plAccounts:       [],  // [{id, name, category, writeField, balance, ...}]
  mappings:         {},  // monarchId → {plId, plRealId, plField}
  pendingCreations: {},  // monarchId → {name, balance, plCategory, plType, monarchId}
  mergeGroups:      [],  // [{id, plId, plRealId, plField, monarchIds}]
  monarchBudgets:   [],  // [{categoryId, categoryName, groupName, monthlyAmount}]
  plExpenses:       [],  // [{planId, planName, expenseId, expenseName, amount, frequency}]
  budgetMappings:   {},  // categoryId → [{planId, expenseId}]
  budgetMergeGroups:          [], // [{id, name, categoryIds, mappings:[{planId,expenseId,createIfMissing}], sourceOverride}]
  budgetSourceOverrides:      {}, // categoryId → {mode, lookback, aggregation}
  budgetGroupSourceOverrides: {}, // groupName  → {mode, lookback, aggregation}
  plApiKey:         '',
  monarchEmail:        '',
  monarchPassword:     '',
  monarchSessionToken: '',
  lastSyncAt:          0,   // ms timestamp of the last successful push to PL
  settings:         { showHidden: false, writeNotes: true, monarchMfaEnabled: false, monarchMfaSecret: '', rememberPassword: true, staleReminderDays: 7, budgetSource: { mode: 'planned', lookback: 3, aggregation: 'average' } },
};

// ── PL investment type options ────────────────────────────────
const INV_TYPES = [
  { value: 'taxable',   label: 'Taxable Brokerage' },
  { value: '401k',      label: '401(k)' },
  { value: 'roth-401k', label: 'Roth 401(k)' },
  { value: 'roth-ira',  label: 'Roth IRA' },
  { value: 'ira',       label: 'Traditional IRA' },
  { value: '403b',      label: '403(b)' },
  { value: 'hsa',       label: 'HSA' },
  { value: 'crypto',    label: 'Cryptocurrency' },
  { value: '529',       label: '529 Plan' },
];

const ASSET_TYPES = [
  { value: 'real-estate',         label: 'House' },
  { value: 'car',                 label: 'Car' },
  { value: 'rental-property',     label: 'Rental Property' },
  { value: 'land',                label: 'Land' },
  { value: 'building',            label: 'Building' },
  { value: 'commercial-property', label: 'Commercial Property' },
  { value: 'motorcycle',          label: 'Motorcycle' },
  { value: 'boat',                label: 'Boat' },
  { value: 'jewelry',             label: 'Jewelry' },
  { value: 'precious-metals',     label: 'Precious Metals' },
  { value: 'furniture',           label: 'Furniture' },
  { value: 'instrument',          label: 'Instrument' },
  { value: 'machinery',           label: 'Machinery' },
  { value: 'custom',              label: 'Custom Asset' },
];

const DEBT_TYPES = [
  { value: 'debt',             label: 'Debt (Generic)' },
  { value: 'student-loans',    label: 'Student Loans' },
  { value: 'medical-debt',     label: 'Medical Debt' },
  { value: 'credit-card-debt', label: 'Credit Card Debt' },
];

// Asset write-field options — what the Monarch balance represents inside the PL asset record
const ASSET_WRITE_FIELDS = [
  { value: 'amount',       label: 'Current Value' },
  { value: 'balance',      label: 'Loan Balance' },
  { value: 'initialValue', label: 'Purchase Price' },
];

const PL_CATEGORIES = [
  { value: 'savings',    label: 'Savings / Cash' },
  { value: 'investment', label: 'Investment' },
  { value: 'asset',      label: 'Real Asset' },
  { value: 'debt',       label: 'Unsecured Debt' },
];

const CATEGORY_COLORS = {
  savings: 'var(--blue)', investment: 'var(--green)',
  debt: 'var(--red)',     asset: 'var(--amber)',
};
const CATEGORY_LABELS = {
  savings: 'Savings', investment: 'Investment', debt: 'Debt', asset: 'Real Asset',
};

// ── Category inference from Monarch account data ─────────────
function inferCategory(a) {
  const typeName    = a.type?.name    || '';
  const subtypeName = a.subtype?.name || '';
  const nameLower   = (a.name || '').toLowerCase();

  // ── Real Estate ──────────────────────────────────────────────
  // real_estate/primary_home, real_estate/rental, real_estate/* → real-estate asset
  if (typeName === 'real_estate') {
    return { category: 'asset', type: 'real-estate', writeField: 'amount' };
  }

  // ── Valuables ────────────────────────────────────────────────
  // valuables/art, /jewelry, /collectibles, /furniture, /other
  if (typeName === 'valuables') {
    const valuablesMap = {
      'art':          'custom',
      'jewelry':      'jewelry',
      'collectibles': 'custom',
      'furniture':    'furniture',
      'other':        'custom',
    };
    return { category: 'asset', type: valuablesMap[subtypeName] || 'custom', writeField: 'amount' };
  }

  // ── Investments (Brokerage) ───────────────────────────────────
  // All brokerage subtypes seen in real data:
  //   brokerage (taxable), stock_plan (RSU/ESPP), cryptocurrency,
  //   st_401k, st_403b, health_savings_account, roth (Roth IRA),
  //   non_taxable_brokerage_account (needs name disambiguation),
  //   ira (Traditional IRA)
  if (typeName === 'brokerage') {
    const brokerageMap = {
      'brokerage':          'taxable',
      'stock_plan':         'taxable',    // RSUs, ESPPs — taxable brokerage in PL
      'cryptocurrency':     'crypto',
      'st_401k':            '401k',
      'st_403b':            '403b',
      'health_savings_account': 'hsa',
      'roth':               'roth-ira',
      'ira':                'ira',
    };
    if (brokerageMap[subtypeName]) {
      return { category: 'investment', type: brokerageMap[subtypeName] };
    }
    // non_taxable_brokerage_account: disambiguate by account name
    if (subtypeName === 'non_taxable_brokerage_account') {
      if (nameLower.includes('roth'))  return { category: 'investment', type: 'roth-401k' };
      if (nameLower.includes('401k')) return { category: 'investment', type: '401k' };
      return { category: 'investment', type: '401k' }; // safest default
    }
    // Any other brokerage subtype defaults to taxable
    return { category: 'investment', type: 'taxable' };
  }

  // ── Cash / Depository ────────────────────────────────────────
  // depository/checking, /savings, /cash_management → all Savings in PL
  if (typeName === 'depository') {
    return { category: 'savings', type: 'savings' };
  }

  // ── Credit Cards ─────────────────────────────────────────────
  // credit/credit_card, credit/student_loan
  if (typeName === 'credit') {
    if (subtypeName === 'student_loan') return { category: 'debt', type: 'student-loans' };
    return { category: 'debt', type: 'credit-card-debt' };
  }

  // ── Loans ────────────────────────────────────────────────────
  // loan/mortgage → generic debt (user will typically model as asset+loan in PL)
  // loan/student, loan/medical, loan/* → appropriate debt types
  if (typeName === 'loan') {
    if (subtypeName === 'mortgage')  return { category: 'asset', type: 'real-estate', writeField: 'balance' };
    if (subtypeName === 'student')   return { category: 'debt', type: 'student-loans' };
    if (subtypeName === 'medical')   return { category: 'debt', type: 'medical-debt' };
    return { category: 'debt', type: 'debt' };
  }

  // ── Fallback: use Monarch's isAsset flag as the tiebreaker ───
  // Better than blindly defaulting to savings for unknown types
  if (a.isAsset === true)  return { category: 'asset',   type: 'custom',  writeField: 'amount' };
  if (a.isAsset === false) return { category: 'debt',    type: 'debt' };
  return { category: 'savings', type: 'savings' };
}
