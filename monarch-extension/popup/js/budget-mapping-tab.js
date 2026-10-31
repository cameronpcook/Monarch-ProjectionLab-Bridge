// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/budget-mapping-tab.js
// Mapping → Budgets: category-to-expense mapping and expense type helpers.
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── BUDGET MAPPING tab ───────────────────────────────────────
function setupBudgetMapping() {
  // Search filter
  byId('budgetSearch').addEventListener('input', renderBudgetMapping);

  // Save button
  async function doSaveBudget() {
    await save();
    const status = byId('budgetSaveStatus');
    if (status) { status.textContent = '✓ Saved'; setTimeout(() => { status.textContent = ''; }, 3500); }
    toast('Budget mappings saved!', 'ok');
  }
  byId('saveBudgetMappings').addEventListener('click', doSaveBudget);
  byId('floatingBudgetSaveBtn').addEventListener('click', doSaveBudget);

  // ── Create-new expense inline form ───────────────────────────
  let _newExpenseContext = null; // {cid, bmgId} — which category/merge is pending

  function showNewExpenseForm(context) {
    _newExpenseContext = context;
    byId('budgetMapNewExpenseName').value = '';
    byId('budgetMapNewExpenseType').value = 'living-expenses';
    renderExpFreqControl('living-expenses', 'budgetMapFreqRow', 'budgetMapNewExpenseFreq', null);
    byId('budgetMapNewExpenseContext').textContent =
      context.cid
        ? `For: ${S.monarchBudgets.find(b => b.categoryId === context.cid)?.categoryName || context.cid}`
        : `For merge group: ${S.budgetMergeGroups.find(g => g.id === context.bmgId)?.name || ''}`;

    // Populate plan checklist
    const planList = byId('budgetMapNewExpensePlanList');
    const allPlanIds = [...new Set(S.plExpenses.map(e => e.planId))];
    planList.innerHTML = allPlanIds.map(planId => {
      const planName = S.plExpenses.find(e => e.planId === planId)?.planName || planId.slice(0, 8);
      return `<label class="checklist-item">
        <input type="checkbox" class="new-exp-plan-cb" value="${esc(planId)}" checked/>
        <span class="checklist-item-name">${esc(planName)}</span>
      </label>`;
    }).join('');

    byId('budgetMapNewExpenseForm').classList.remove('hidden');
    byId('budgetMapNewExpenseName').focus();
    renderExpFreqControl(byId('budgetMapNewExpenseType').value, 'budgetMapFreqRow', 'budgetMapNewExpenseFreq', null);
  }

  byId('budgetMapNewExpenseType').addEventListener('change', () => {
    renderExpFreqControl(byId('budgetMapNewExpenseType').value, 'budgetMapFreqRow', 'budgetMapNewExpenseFreq', null);
  });

  function hideNewExpenseForm() {
    byId('budgetMapNewExpenseForm').classList.add('hidden');
    _newExpenseContext = null;
    renderBudgetMapping();
  }

  byId('budgetMapCancelNewExpense').addEventListener('click', hideNewExpenseForm);

  byId('budgetMapConfirmNewExpense').addEventListener('click', async () => {
    if (!_newExpenseContext) return;
    const name = byId('budgetMapNewExpenseName').value.trim();
    if (!name) { toast('Enter a name for the new expense', 'err'); return; }

    const { expType, frequency, expTypeParams } = collectExpTypeParams('budgetMap');

    const planCbs = [...byId('budgetMapNewExpensePlanList').querySelectorAll('.new-exp-plan-cb:checked')];
    if (!planCbs.length) { toast('Select at least one plan', 'err'); return; }

    const newExpenseId = crypto.randomUUID();
    const { cid, bmgId } = _newExpenseContext;

    const mapping = (planId) => ({
      planId, expenseId: '__CREATE_NEW__',
      newExpenseId, newExpenseName: name,
      newFrequency: frequency,
      newExpType: expType,
      newExpTypeParams: expTypeParams,
      createIfMissing: true,
    });

    if (cid) {
      if (!S.budgetMappings[cid]) S.budgetMappings[cid] = [];
      planCbs.forEach(cb => S.budgetMappings[cid].push(mapping(cb.value)));
    } else if (bmgId) {
      const g = S.budgetMergeGroups.find(x => x.id === bmgId);
      if (g) {
        if (!g.mappings) g.mappings = [];
        planCbs.forEach(cb => g.mappings.push(mapping(cb.value)));
      }
    }

    await save();
    hideNewExpenseForm();
    toast(`New expense "${name}" will be created on next sync`, 'ok');
  });

  // Delegate __CREATE_NEW__ selection to show the form
  // This is called from renderBudgetMapping's change listeners via a custom event
  document.addEventListener('budget-expense-create-new', e => {
    showNewExpenseForm(e.detail);
  });

  // Show floating save when legend scrolls out of view
  const legendEl = document.querySelector('#sub-panel-budgets .mapping-legend');
  const floatBar2 = byId('floatingBudgetSaveBar');
  document.addEventListener('scroll', () => {
    if (!floatBar2 || !legendEl) return;
    floatBar2.classList.toggle('hidden', legendEl.getBoundingClientRect().bottom > 0);
  }, { passive: true });
}

// ── Expense type form helpers ─────────────────────────────────

// Types with fixed, non-user-selectable frequency
// Types with fixed, non-user-selectable frequency
const EXP_FIXED_FREQ = {
  'debt':    'monthly',
  'wedding': 'once',
  'other':   'once',
};

// Suggested default frequency per type (used to pre-select the selector)
const EXP_DEFAULT_FREQ = {
  'living-expenses':   'monthly',
  'health-care':       'yearly-lump-sum',
  'charity':           'yearly-lump-sum',
  'dependent-support': 'monthly',
};

// All PL frequency options with display label and Monarch monthly → PL period conversion
const PL_FREQ_OPTIONS = [
  { value: 'yearly-lump-sum', label: 'Once Per Year', hint: '×12',     convert: m => Math.round(m * 12) },
  { value: 'yearly',          label: 'Yearly',          hint: '×12',     convert: m => Math.round(m * 12) },
  { value: 'quarterly',      label: 'Quarterly',      hint: '×3',      convert: m => Math.round(m * 3) },
  { value: 'monthly',        label: 'Monthly',        hint: '×1',      convert: m => m },
  { value: 'bi-weekly',      label: 'Bi-Weekly',      hint: '×12÷26',  convert: m => Math.round(m * 12 / 26 * 100) / 100 },
  { value: 'weekly',         label: 'Weekly',         hint: '×12÷52',  convert: m => Math.round(m * 12 / 52 * 100) / 100 },
  { value: 'daily',          label: 'Daily',          hint: '×12÷365', convert: m => Math.round(m * 12 / 365 * 100) / 100 },
];

// Render the correct frequency control into a container div.
// Fixed types get a read-only chip; variable types get the full frequency selector.
// containerId: id of the <div> to render into
// selId: id to give the <select>
// currentValue: previously saved frequency (used when editing)
function renderExpFreqControl(expType, containerId, selId, currentValue) {
  const container = byId(containerId);
  if (!container) return;
  const fixed = EXP_FIXED_FREQ[expType];
  if (fixed) {
    const label = fixed === 'once' ? 'One-time' : fixed.charAt(0).toUpperCase() + fixed.slice(1);
    container.innerHTML = `<span style="font-size:12px;color:var(--txt2);padding:3px 0;display:block">${label} <span style="color:var(--txt3);font-size:11px">(fixed)</span></span>`;
  } else {
    const def = currentValue || EXP_DEFAULT_FREQ[expType] || 'monthly';
    const opts = PL_FREQ_OPTIONS.map(o =>
      `<option value="${o.value}" ${o.value === def ? 'selected' : ''}>${o.label} — Monarch/mo ${o.hint}</option>`
    ).join('');
    container.innerHTML = `<select id="${selId}" class="select-input" style="font-size:12px;padding:5px 24px 5px 8px">${opts}</select>`;
  }
}

// Collect type + frequency from a simplified form. prefix: 'budgetMap' or 'budgetMerge'
function collectExpTypeParams(prefix) {
  const expType   = byId(`${prefix}NewExpenseType`)?.value || 'living-expenses';
  const fixed     = EXP_FIXED_FREQ[expType];
  const frequency = fixed || byId(`${prefix}NewExpenseFreq`)?.value || EXP_DEFAULT_FREQ[expType] || 'monthly';
  return { expType, frequency, expTypeParams: {} };
}

function buildExpenseOptionHTML(excludeKeys = new Set()) {
  let html = '<option value="">— select expense —</option>';
  html += '<option value="__CREATE_NEW__" class="create-opt">✦ Create new expense…</option>';
  if (!S.plExpenses.length) return html;
  const byPlan = {};
  for (const e of S.plExpenses) {
    if (!byPlan[e.planId]) byPlan[e.planId] = { name: e.planName, items: [] };
    byPlan[e.planId].items.push(e);
  }
  for (const { name, items } of Object.values(byPlan)) {
    const available = items.filter(e => !excludeKeys.has(e.planId + '::' + e.expenseId));
    if (!available.length) continue;
    html += `<optgroup label="${esc(name)}">`;
    for (const e of available) {
      const key = e.planId + '::' + e.expenseId;
      const freqLabel = e.frequency === 'monthly' ? '/mo' : (e.frequency === 'yearly' || e.frequency === 'yearly-lump-sum') ? '/yr' : `/${e.frequency}`;
      html += `<option value="${esc(key)}">${esc(e.expenseName)} (${fmt(e.amount)}${freqLabel})</option>`;
    }
    html += '</optgroup>';
  }
  return html;
}

// Renders the budget merge group rows for the budget mapping tab
function renderBudgetMergeRows(globalMappedKeys, q = '') {
  if (!S.budgetMergeGroups.length) return '';

  const allPlanIds = [...new Set(S.plExpenses.map(e => e.planId))];
  const allPlans = allPlanIds.map(id => {
    const e = S.plExpenses.find(x => x.planId === id);
    return { planId: id, planName: e?.planName || id };
  });

  return S.budgetMergeGroups.filter(g =>
    !q || g.name.toLowerCase().includes(q) ||
    g.categoryIds.some(cid => {
      const b = S.monarchBudgets.find(x => x.categoryId === cid);
      return b?.categoryName.toLowerCase().includes(q);
    })
  ).map(g => {
    const cats = g.categoryIds.map(cid => S.monarchBudgets.find(b => b.categoryId === cid)).filter(Boolean);
    const totalMonthly = cats.reduce((s, c) => s + resolveMonarchAmount(c, getGroupCategoryOverride(g, c.categoryId)), 0);
    const targets = g.mappings || [];
    const mappedKeys = new Set(targets.map(t => t.planId + '::' + t.expenseId));

    const mappedPlansByExpense = {};
    targets.forEach(t => {
      if (!mappedPlansByExpense[t.expenseId]) mappedPlansByExpense[t.expenseId] = new Set();
      mappedPlansByExpense[t.expenseId].add(t.planId);
    });

    const targetsHtml = targets.map((t, ti) => {
      const isCreateNew = t.expenseId === '__CREATE_NEW__';
      const exp = isCreateNew ? null : S.plExpenses.find(e => e.planId === t.planId && e.expenseId === t.expenseId);
      const expDef = exp || (!isCreateNew && S.plExpenses.find(e => e.expenseId === t.expenseId));
      const planName = exp?.planName
        || S.plExpenses.find(e => e.planId === t.planId)?.planName
        || (isCreateNew ? 'New expense' : 'Unknown plan');
      const expName = isCreateNew
        ? (t.newExpenseName || 'New expense')
        : (expDef?.expenseName || t.expenseName || 'Unknown expense');
      const syncExpDef = isCreateNew
        ? { frequency: t.newFrequency || 'monthly', expType: t.newExpType || 'living-expenses' }
        : expDef;
      const { syncAmount, freqLabel, warn: syncWarn } = computeBudgetSync(syncExpDef, totalMonthly);
      const badge = isCreateNew
        ? ' <span style="color:var(--amber);font-size:11px;font-weight:700">new</span>'
        : t.createIfMissing
        ? ' <span style="color:var(--amber);font-size:11px">new</span>'
        : '';

      let applyHtml = '';
      if (ti === 0) {
        const alreadyMapped = mappedPlansByExpense[t.expenseId] || new Set();
        const remainingPlans = allPlans.filter(p => !alreadyMapped.has(p.planId));
        if (remainingPlans.length) {
          const opts = `<option value="__ALL__">⚡ All remaining plans</option>
            ${remainingPlans.map(p => {
              const existsInPlan = S.plExpenses.some(x => x.planId === p.planId && x.expenseId === t.expenseId);
              return `<option value="${esc(p.planId)}">${esc(p.planName)}${existsInPlan ? '' : ' (new)'}</option>`;
            }).join('')}`;
          applyHtml = `<select class="budget-plan-apply" data-bmg-id="${esc(g.id)}" data-expense-id="${esc(t.expenseId)}" multiple size="${Math.min(remainingPlans.length + 1, 4)}">
            ${opts}
          </select>`;
        }
      }

      return `<div class="budget-target-row" data-bmg-id="${esc(g.id)}" data-ti="${ti}">
        <span class="budget-target-label">
          <span class="budget-target-plan">${esc(planName)}</span>
          <span class="budget-target-expense">→ ${esc(expName)}${badge} <span class="budget-target-freq">${fmt(syncAmount)}${freqLabel}</span>${syncWarn ? '<span class="sync-warn-icon" title="' + esc(syncWarn) + '" style="cursor:help;color:var(--amber);font-size:11px;margin-left:3px">⚠</span>' : ''}${t.lastSynced ? `<span class="sync-check-badge" title="Last synced ${syncedAgo(t.lastSynced)}">✓</span>` : ''}</span>
        </span>
        ${applyHtml}
        <button class="btn btn-sm btn-ghost budget-remove-target" data-bmg-id="${esc(g.id)}" data-ti="${ti}" title="Remove">✕</button>
      </div>`;
    }).join('');

    const showDropdown = targets.length === 0;

    return `<div class="budget-row budget-row--merge">
      <div class="budget-row-header">
        <span class="budget-source-name">🔀 ${esc(g.name)}</span>
        <span class="budget-source-amount">${fmt(totalMonthly)}<span style="color:var(--txt3);font-size:10px;margin-left:3px">${g.sourceModeAll === false ? 'per-cat' : budgetSourceLabel(g.sourceOverride || null)}</span></span>
      </div>
      <div style="font-size:12px;color:var(--txt2);padding:0 0 4px 0">${cats.map(c => esc(c.categoryName)).join(' + ')}</div>
      ${targets.length ? `<div class="budget-targets">${targetsHtml}</div>` : ''}
      ${showDropdown ? `<div class="budget-add-row">
        <select class="budget-expense-sel" data-bmg-id="${esc(g.id)}">
          ${buildExpenseOptionHTML(globalMappedKeys)}
        </select>
      </div>` : ''}
    </div>`;
  }).join('');
}

function renderBudgetMapping() {
  const list = byId('budgetMappingList');
  if (!S.monarchBudgets.length) {
    list.innerHTML = '<div class="empty-state">Fetch Monarch accounts in Setup to load budget categories</div>';
    return;
  }
  if (!S.plExpenses.length) {
    list.innerHTML = '<div class="empty-state">Load PL Accounts in Setup to load plan expenses</div>';
    return;
  }

  // Build global mapped keys covering both individual mappings AND merge group mappings
  const globalMappedKeys = new Set([
    ...Object.values(S.budgetMappings).flat(),
    ...S.budgetMergeGroups.flatMap(g => g.mappings || []),
  ].map(t => t.planId + '::' + t.expenseId));

  // Render budget merge groups first, then individual categories
  const q = (byId('budgetSearch')?.value || '').toLowerCase();
  const mergeRowsHtml = renderBudgetMergeRows(globalMappedKeys, q);

  // Filter out categories already in a merge group, then apply search
  const mergedCategoryIds = new Set(S.budgetMergeGroups.flatMap(g => g.categoryIds));

  const filteredBudgets = S.monarchBudgets
    .filter(b => !mergedCategoryIds.has(b.categoryId))
    .filter(b => !q || b.categoryName.toLowerCase().includes(q) || b.groupName.toLowerCase().includes(q));

  // Group by groupName, preserving order of first appearance
  const groupOrder = [];
  const grouped = {};
  for (const b of filteredBudgets) {
    const gn = b.groupName || 'Other';
    if (!grouped[gn]) { grouped[gn] = []; groupOrder.push(gn); }
    grouped[gn].push(b);
  }

  // All available plans (used inside the map below)
  const allPlanIds = [...new Set(S.plExpenses.map(e => e.planId))];
  const allPlans = allPlanIds.map(id => {
    const e = S.plExpenses.find(x => x.planId === id);
    return { planId: id, planName: e?.planName || id };
  });

  const individualRowsHtml = groupOrder.map(groupName => {
    const rows = grouped[groupName].map(b => {
    const targets = S.budgetMappings[b.categoryId] || [];
    const mappedKeys = new Set(targets.map(t => t.planId + '::' + t.expenseId));
    const mappedPlansByExpense = {};
    targets.forEach(t => {
      if (!mappedPlansByExpense[t.expenseId]) mappedPlansByExpense[t.expenseId] = new Set();
      mappedPlansByExpense[t.expenseId].add(t.planId);
    });

    const catOverride = getEffectiveBudgetOverride(b.categoryId);
    const resolvedAmount = resolveMonarchAmount(b, catOverride);
    const srcLabel = budgetSourceLabel(catOverride);
    const overrideMode = catOverride?.mode || '';
    const defaultLookback = overrideMode === 'actual' ? 3 : 1;
    const overrideLookback = catOverride?.lookback ?? defaultLookback;
    const overrideAgg = catOverride?.aggregation || 'average';

    const targetsHtml = targets.map((t, ti) => {
      const isCreateNew = t.expenseId === '__CREATE_NEW__';
      const exp = isCreateNew ? null : S.plExpenses.find(e => e.planId === t.planId && e.expenseId === t.expenseId);
      const expDef = exp || (!isCreateNew && S.plExpenses.find(e => e.expenseId === t.expenseId));
      const planName = exp?.planName || S.plExpenses.find(e => e.planId === t.planId)?.planName || 'Unknown plan';
      const expName = isCreateNew
        ? (t.newExpenseName || 'New expense')
        : (expDef?.expenseName || t.expenseName || 'Unknown expense');
      const syncExpDef = isCreateNew
        ? { frequency: t.newFrequency || 'monthly', expType: t.newExpType || 'living-expenses' }
        : expDef;
      const { syncAmount, freqLabel, warn: syncWarn } = computeBudgetSync(syncExpDef, resolvedAmount);
      const badge = isCreateNew
        ? ' <span style="color:var(--amber);font-size:11px;font-weight:700">new</span>'
        : t.createIfMissing
        ? ' <span style="color:var(--amber);font-size:11px">new</span>'
        : '';
      let applyHtml = '';
      if (ti === 0) {
        const alreadyMapped = mappedPlansByExpense[t.expenseId] || new Set();
        const remainingPlans = allPlans.filter(p => !alreadyMapped.has(p.planId));
        if (remainingPlans.length) {
          const opts = `<option value="__ALL__">⚡ All remaining plans</option>
            ${remainingPlans.map(p => {
              const existsInPlan = S.plExpenses.some(x => x.planId === p.planId && x.expenseId === t.expenseId);
              return `<option value="${esc(p.planId)}">${esc(p.planName)}${existsInPlan ? '' : ' (new)'}</option>`;
            }).join('')}`;
          applyHtml = `<select class="budget-plan-apply" data-cid="${esc(b.categoryId)}" data-expense-id="${esc(t.expenseId)}" multiple size="${Math.min(remainingPlans.length + 1, 4)}">
            ${opts}
          </select>`;
        }
      }
      return `<div class="budget-target-row" data-cid="${esc(b.categoryId)}" data-ti="${ti}">
        <span class="budget-target-label">
          <span class="budget-target-plan">${esc(planName)}</span>
          <span class="budget-target-expense">→ ${esc(expName)}${badge} <span class="budget-target-freq">${fmt(syncAmount)}${freqLabel}</span>${syncWarn ? '<span class="sync-warn-icon" title="' + esc(syncWarn) + '" style="cursor:help;color:var(--amber);font-size:11px;margin-left:3px">⚠</span>' : ''}${t.lastSynced ? `<span class="sync-check-badge" title="Last synced ${syncedAgo(t.lastSynced)}">✓</span>` : ''}</span>
        </span>
        ${applyHtml}
        <button class="btn btn-sm btn-ghost budget-remove-target" data-cid="${esc(b.categoryId)}" data-ti="${ti}" title="Remove">✕</button>
      </div>`;
    }).join('');

    const actualOptsHidden = !overrideMode ? 'hidden' : '';
    const sourceControlsHtml = `<div class="budget-source-override">
      <span class="budget-override-label">Source:</span>
      <select class="bgt-mode-sel select-input" data-cid="${esc(b.categoryId)}">
        <option value="" ${!overrideMode ? 'selected' : ''}>Default</option>
        <option value="planned" ${overrideMode === 'planned' ? 'selected' : ''}>Planned</option>
        <option value="actual" ${overrideMode === 'actual' ? 'selected' : ''}>Actual</option>
      </select>
      <span class="bgt-actual-opts ${actualOptsHidden}">
        <input class="bgt-lookback text-input" type="number" min="1" max="12"
               value="${overrideLookback}" data-cid="${esc(b.categoryId)}"
               style="width:40px;text-align:center;padding:2px 4px;font-size:11px"/>
        <span style="font-size:10px;color:var(--txt3)">mo</span>
        <select class="bgt-agg-sel select-input" data-cid="${esc(b.categoryId)}">
          <option value="average" ${overrideAgg === 'average' ? 'selected' : ''}>avg</option>
          <option value="median" ${overrideAgg === 'median' ? 'selected' : ''}>median</option>
        </select>
      </span>
    </div>`;

    return `<div class="budget-row">
      <div class="budget-row-header">
        <span class="budget-source-name">${esc(b.categoryName)}</span>
        <span class="budget-source-amount">${fmt(resolvedAmount)}<span style="color:var(--txt3);font-size:10px;margin-left:3px">${srcLabel}</span></span>
      </div>
      ${sourceControlsHtml}
      ${targets.length ? `<div class="budget-targets">${targetsHtml}</div>` : ''}
      ${!targets.length ? `<div class="budget-add-row">
        <select class="budget-expense-sel" data-cid="${esc(b.categoryId)}">
          ${buildExpenseOptionHTML(globalMappedKeys)}
        </select>
      </div>` : ''}
    </div>`;
    }).join('');

    const grpOvr     = S.budgetGroupSourceOverrides[groupName] || null;
    const grpActive  = !!grpOvr;
    const grpMode    = grpOvr?.mode || '';
    const grpDefaultLookback = grpMode === 'actual' ? 3 : 1;
    const grpLookback = grpOvr?.lookback ?? grpDefaultLookback;
    const grpAgg     = grpOvr?.aggregation || 'average';
    const grpActualOptsHidden = !grpMode ? 'hidden' : '';
    const grpInlineControls = grpActive ? `
        <div class="budget-group-src-inline">
          <select class="bgt-group-mode-sel select-input" data-group="${esc(groupName)}">
            <option value="" ${!grpMode ? 'selected' : ''}>Default</option>
            <option value="planned" ${grpMode === 'planned' ? 'selected' : ''}>Planned</option>
            <option value="actual" ${grpMode === 'actual' ? 'selected' : ''}>Actual</option>
          </select>
          <span class="bgt-actual-opts ${grpActualOptsHidden}">
            <input class="bgt-group-lookback text-input" type="number" min="1" max="12"
                   value="${grpLookback}" data-group="${esc(groupName)}"
                   style="width:40px;text-align:center;padding:2px 4px;font-size:11px"/>
            <span style="font-size:10px;color:var(--txt3)">mo</span>
            <select class="bgt-group-agg-sel select-input" data-group="${esc(groupName)}">
              <option value="average" ${grpAgg === 'average' ? 'selected' : ''}>avg</option>
              <option value="median" ${grpAgg === 'median' ? 'selected' : ''}>median</option>
            </select>
          </span>
        </div>` : '';
    const isMappingGroupCollapsed = _collapsedBudgetMappingGroups.has(groupName);
    return `<div class="budget-group${grpActive ? ' budget-group--override' : ''}${isMappingGroupCollapsed ? ' collapsed' : ''}" data-group="${esc(groupName)}">
      <div class="budget-group-header">
        <span class="budget-group-name">${esc(groupName)}</span>
        ${grpInlineControls}
        <label class="budget-group-src-toggle" title="Apply one source setting to this entire group">
          <input type="checkbox" class="bgt-group-toggle" data-group="${esc(groupName)}" ${grpActive ? 'checked' : ''}/>
          <span>Group source</span>
        </label>
        <button type="button" class="budget-group-collapse-btn" data-group="${esc(groupName)}" title="Collapse / expand">${isMappingGroupCollapsed ? '▸' : '▾'}</button>
      </div>
      <div class="budget-group-body">
        ${rows}
      </div>
    </div>`;
  }).join('');

  list.innerHTML = mergeRowsHtml + individualRowsHtml;

}

// One-time delegated listeners for budgetMappingList — called from setupBudgetMapping()
function setupBudgetMappingListDelegation() {
  const list = byId('budgetMappingList');

  list.addEventListener('change', async e => {
    // Group-level source toggle
    const groupToggle = e.target.closest('.bgt-group-toggle');
    if (groupToggle) {
      const gn = groupToggle.dataset.group;
      if (groupToggle.checked) {
        S.budgetGroupSourceOverrides[gn] = { mode: '', lookback: 1, aggregation: 'average' };
      } else {
        delete S.budgetGroupSourceOverrides[gn];
      }
      await save(); renderBudgetMapping(); return;
    }

    // Group-level source mode
    const grpModeEl = e.target.closest('.bgt-group-mode-sel');
    if (grpModeEl) {
      const gn   = grpModeEl.dataset.group;
      const mode = grpModeEl.value;
      const row  = grpModeEl.closest('.budget-group-src-inline');
      if (row) row.querySelector('.bgt-actual-opts')?.classList.toggle('hidden', !mode);
      if (!S.budgetGroupSourceOverrides[gn]) S.budgetGroupSourceOverrides[gn] = {};
      const defaultLookback = mode === 'actual' ? 3 : 1;
      S.budgetGroupSourceOverrides[gn] = { ...S.budgetGroupSourceOverrides[gn], mode, lookback: defaultLookback };
      await save(); renderBudgetMapping(); return;
    }

    // Group-level lookback
    const grpLookbackEl = e.target.closest('.bgt-group-lookback');
    if (grpLookbackEl) {
      const gn = grpLookbackEl.dataset.group;
      const v  = Math.max(1, Math.min(12, parseInt(grpLookbackEl.value, 10) || 1));
      grpLookbackEl.value = v;
      if (!S.budgetGroupSourceOverrides[gn]) S.budgetGroupSourceOverrides[gn] = {};
      S.budgetGroupSourceOverrides[gn] = { ...S.budgetGroupSourceOverrides[gn], lookback: v };
      await save(); renderBudgetMapping(); return;
    }

    // Group-level aggregation
    const grpAggEl = e.target.closest('.bgt-group-agg-sel');
    if (grpAggEl) {
      const gn = grpAggEl.dataset.group;
      if (!S.budgetGroupSourceOverrides[gn]) S.budgetGroupSourceOverrides[gn] = {};
      S.budgetGroupSourceOverrides[gn] = { ...S.budgetGroupSourceOverrides[gn], aggregation: grpAggEl.value };
      await save(); renderBudgetMapping(); return;
    }

    // Per-category source mode override
    const modeEl = e.target.closest('.bgt-mode-sel');
    if (modeEl) {
      const cid = modeEl.dataset.cid;
      const mode = modeEl.value;
      // Toggle actual options visibility immediately in the DOM before re-render
      const row = modeEl.closest('.budget-row');
      if (row) row.querySelector('.bgt-actual-opts')?.classList.toggle('hidden', !mode);
      if (!mode) {
        delete S.budgetSourceOverrides[cid];
      } else {
        const existing = S.budgetSourceOverrides[cid] || {};
        const defaultLb = mode === 'actual' ? 3 : 1;
        S.budgetSourceOverrides[cid] = { ...existing, mode, lookback: existing.lookback ?? defaultLb };
      }
      await save();
      renderBudgetMapping();
      return;
    }

    // Per-category lookback override
    const lookbackEl = e.target.closest('.bgt-lookback');
    if (lookbackEl) {
      const cid = lookbackEl.dataset.cid;
      const v = Math.max(1, Math.min(12, parseInt(lookbackEl.value, 10) || 3));
      lookbackEl.value = v;
      S.budgetSourceOverrides[cid] = { ...(S.budgetSourceOverrides[cid] || {}), lookback: v };
      await save();
      renderBudgetMapping();
      return;
    }

    // Per-category aggregation override
    const aggEl = e.target.closest('.bgt-agg-sel');
    if (aggEl) {
      const cid = aggEl.dataset.cid;
      S.budgetSourceOverrides[cid] = { ...(S.budgetSourceOverrides[cid] || {}), aggregation: aggEl.value };
      await save();
      renderBudgetMapping();
      return;
    }

    // Expense selector — commits immediately on single selection
    const expSel = e.target.closest('.budget-expense-sel');
    if (expSel) {
      const key   = expSel.value;
      if (!key) return;
      const bmgId = expSel.dataset.bmgId;
      const cid   = expSel.dataset.cid;
      if (key === '__CREATE_NEW__') {
        expSel.value = '';
        document.dispatchEvent(new CustomEvent('budget-expense-create-new', { detail: { cid: cid || null, bmgId: bmgId || null } }));
        return;
      }
      const [planId, expenseId] = key.split('::');
      if (bmgId) {
        const g = S.budgetMergeGroups.find(x => x.id === bmgId);
        if (!g) return;
        if (!g.mappings) g.mappings = [];
        if (g.mappings.some(t => t.planId === planId && t.expenseId === expenseId)) return;
        g.mappings.push({ planId, expenseId });
      } else {
        if (!S.budgetMappings[cid]) S.budgetMappings[cid] = [];
        if (S.budgetMappings[cid].some(t => t.planId === planId && t.expenseId === expenseId)) return;
        S.budgetMappings[cid].push({ planId, expenseId });
      }
      await save();
      const status = byId('budgetSaveStatus');
      if (status) { status.textContent = '✓ Saved'; setTimeout(() => { status.textContent = ''; }, 3500); }
      renderBudgetMapping();
      return;
    }

    // Apply-to-plans multi-select
    const planApply = e.target.closest('.budget-plan-apply');
    if (planApply) {
      const expenseId = planApply.dataset.expenseId;
      const bmgId     = planApply.dataset.bmgId;
      const cid       = planApply.dataset.cid;
      let targetArr;
      if (bmgId) {
        const g = S.budgetMergeGroups.find(x => x.id === bmgId);
        if (!g) return;
        if (!g.mappings) g.mappings = [];
        targetArr = g.mappings;
      } else {
        if (!S.budgetMappings[cid]) S.budgetMappings[cid] = [];
        targetArr = S.budgetMappings[cid];
      }
      const allPlanIds    = [...new Set(S.plExpenses.map(e => e.planId))];
      const alreadyMapped = new Set(targetArr.filter(t => t.expenseId === expenseId).map(t => t.planId));
      const selectedPlanIds = [];
      for (const opt of planApply.selectedOptions) {
        if (opt.value === '__ALL__') {
          allPlanIds.filter(pid => !alreadyMapped.has(pid)).forEach(pid => selectedPlanIds.push(pid));
        } else if (opt.value) {
          selectedPlanIds.push(opt.value);
        }
      }
      let added = false;
      for (const planId of selectedPlanIds) {
        if (targetArr.some(t => t.planId === planId && t.expenseId === expenseId)) continue;
        const existsInPlan = S.plExpenses.some(e => e.planId === planId && e.expenseId === expenseId);
        targetArr.push({ planId, expenseId, createIfMissing: !existsInPlan });
        added = true;
      }
      if (added) {
        await save();
        const status = byId('budgetSaveStatus');
        if (status) { status.textContent = '✓ Saved'; setTimeout(() => { status.textContent = ''; }, 3500); }
        renderBudgetMapping();
      }
      return;
    }
  });

  list.addEventListener('click', async e => {
    const collapseBtn = e.target.closest('.budget-group-collapse-btn');
    if (collapseBtn) {
      const gn = collapseBtn.dataset.group;
      const grpDiv = list.querySelector(`.budget-group[data-group="${CSS.escape(gn)}"]`);
      if (!grpDiv) return;
      const collapsed = grpDiv.classList.toggle('collapsed');
      collapseBtn.textContent = collapsed ? '▸' : '▾';
      collapsed ? _collapsedBudgetMappingGroups.add(gn) : _collapsedBudgetMappingGroups.delete(gn);
      return;
    }

    const removeBtn = e.target.closest('.budget-remove-target');
    if (removeBtn) {
      const ti    = parseInt(removeBtn.dataset.ti, 10);
      const bmgId = removeBtn.dataset.bmgId;
      const cid   = removeBtn.dataset.cid;
      if (bmgId) {
        const g = S.budgetMergeGroups.find(x => x.id === bmgId);
        if (g?.mappings) g.mappings.splice(ti, 1);
      } else if (S.budgetMappings[cid]) {
        S.budgetMappings[cid].splice(ti, 1);
        if (!S.budgetMappings[cid].length) delete S.budgetMappings[cid];
      }
      await save();
      renderBudgetMapping();
    }
  });
}
