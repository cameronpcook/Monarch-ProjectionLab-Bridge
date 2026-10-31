// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/budget-merge.js
// Budget merge groups (combining Monarch categories into one PL expense).
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── BUDGET MERGE GROUPS ──────────────────────────────────────
let editingBudgetMergeId = null;
// Persists collapse state across builder opens within the same popup session (keyed by group name).
const _collapsedBudgetGroups = new Set();
// Persists collapse state for budget mapping tab groups across re-renders (keyed by group name).
const _collapsedBudgetMappingGroups = new Set();

function renderBudgetMerges() {
  renderCombinedMergeList();
}

// Module-level so setupBudgetMergeBuilderDelegation can call it before builder opens.
function updateBudgetMergeTotal() {
  const list = byId('budgetMergeCatList');
  if (!list) return;
  // Determine effective override for each checked category based on the toggle state
  const isAllMode = byId('budgetMergeSourceAllToggle')?.checked !== false;
  let allModeOverride = null;
  if (isAllMode) {
    const mv = byId('budgetMergeSourceMode')?.value || '';
    allModeOverride = mv ? {
      mode: mv,
      lookback: Math.max(1, parseInt(byId('budgetMergeLookback')?.value, 10) || 3),
      aggregation: byId('budgetMergeAggSel')?.value || 'average',
    } : null;
  }
  // Update individual row balance displays and accumulate total
  const totalMonthly = [...list.querySelectorAll('input[type=checkbox]:not(.group-toggle-cb):not(.bgt-cg-toggle)')].reduce((sum, cb) => {
    const b = S.monarchBudgets.find(x => x.categoryId === cb.value);
    if (!b) return sum;
    const override = isAllMode ? allModeOverride : getEffectiveBudgetOverride(cb.value);
    const amt = resolveMonarchAmount(b, override);
    // Update the balance span for this row
    const balSpan = cb.closest('.checklist-item')?.querySelector('.checklist-item-bal');
    if (balSpan) balSpan.textContent = `${fmt(amt)}/mo`;
    return cb.checked ? sum + amt : sum;
  }, 0);

  // Determine frequency: existing expense → use its frequency; new expense → use selector
  const expSel = byId('budgetMergeExpenseSel');
  const expVal = expSel?.value || '';
  let freq = 'monthly';

  if (expVal && expVal !== '__CREATE_NEW__' && expVal !== '') {
    // Existing expense selected — find its frequency from plExpenses
    const expenseId = expVal.includes('::') ? expVal.split('::')[1] : expVal;
    const planId    = expVal.includes('::') ? expVal.split('::')[0] : null;
    const expDef    = planId
      ? S.plExpenses.find(e => e.planId === planId && e.expenseId === expenseId)
      : S.plExpenses.find(e => e.expenseId === expenseId);
    freq = expDef?.frequency || 'monthly';
  } else {
    // New expense or none — use type/freq selectors
    const expType   = byId('budgetMergeNewExpenseType')?.value || 'living-expenses';
    const freqSel   = byId('budgetMergeNewExpenseFreq');
    const fixedFreq = EXP_FIXED_FREQ[expType];
    freq = fixedFreq || freqSel?.value || 'monthly';
  }

  let displayAmt, freqSuffix;
  if (freq === 'once') {
    displayAmt = totalMonthly;
    freqSuffix = ' ⚠';
  } else {
    const opt  = PL_FREQ_OPTIONS.find(o => o.value === freq);
    displayAmt = opt ? opt.convert(totalMonthly) : totalMonthly;
    const shortFreq = { 'yearly-lump-sum':'yr', yearly:'yr', quarterly:'qtr', monthly:'mo', 'bi-weekly':'2wk', weekly:'wk', daily:'day' }[freq] || freq;
    freqSuffix = `/${shortFreq}`;
  }

  const txt = totalMonthly > 0 ? fmt(displayAmt) + freqSuffix : '';
  const el = byId('budgetMergeTotalDisplay');
  if (el) el.textContent = txt;
  const floating = byId('budgetMergeFloatingTotal');
  if (floating) floating.textContent = txt;
}

function openBudgetMergeBuilder(id = null) {
  editingBudgetMergeId = id;
  const group = id ? S.budgetMergeGroups.find(g => g.id === id) : null;
  byId('budgetMergeBuilderTitle').textContent = id ? 'Edit Budget Merge' : 'New Budget Merge';
  byId('budgetMergeName').value = group?.name || '';

  // Populate category checklist
  const thisGroupIds = new Set(group?.categoryIds || []);
  const otherMergedIds = new Set(
    S.budgetMergeGroups
      .filter(g => g.id !== id)
      .flatMap(g => g.categoryIds)
  );
  const list = byId('budgetMergeCatList');

  // Group by groupName for the checklist
  const cgOrder = [];
  const cgGrouped = {};
  for (const b of S.monarchBudgets) {
    const gn = b.groupName || 'Other';
    if (!cgGrouped[gn]) { cgGrouped[gn] = []; cgOrder.push(gn); }
    cgGrouped[gn].push(b);
  }

  list.innerHTML = cgOrder.map((groupName, gi) => {
    const groupItems = cgGrouped[groupName];
    const allDisabled = groupItems.every(b => otherMergedIds.has(b.categoryId));
    const allChecked  = groupItems.filter(b => !otherMergedIds.has(b.categoryId)).every(b => thisGroupIds.has(b.categoryId));
    const items = groupItems.map(b => {
      const disabled = otherMergedIds.has(b.categoryId);
      const checked  = thisGroupIds.has(b.categoryId);
      const catOvr   = S.budgetSourceOverrides[b.categoryId] || null;
      const ovrMode  = catOvr?.mode || '';
      const defaultLookback = ovrMode === 'actual' ? 3 : 1;
      const ovrLookback = catOvr?.lookback ?? defaultLookback;
      const ovrAgg   = catOvr?.aggregation || 'average';
      return `<div class="bgt-cat-item">
        <label class="checklist-item${disabled ? ' disabled' : ''}">
          <input type="checkbox" value="${esc(b.categoryId)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}/>
          <span class="checklist-item-name">${esc(b.categoryName)}</span>
          <span class="checklist-item-bal">${fmt(resolveMonarchAmount(b, catOvr))}/mo</span>
        </label>
        <div class="bgt-cat-source-override">
          <select class="bgt-mode-sel select-input" data-cid="${esc(b.categoryId)}">
            <option value="" ${!ovrMode ? 'selected' : ''}>Default</option>
            <option value="planned" ${ovrMode === 'planned' ? 'selected' : ''}>Planned</option>
            <option value="actual" ${ovrMode === 'actual' ? 'selected' : ''}>Actual</option>
          </select>
          <span class="bgt-actual-opts ${!ovrMode ? 'hidden' : ''}">
            <input class="bgt-lookback text-input" type="number" min="1" max="12"
                   value="${ovrLookback}" data-cid="${esc(b.categoryId)}"
                   style="width:40px;text-align:center;padding:2px 4px;font-size:11px"/>
            <span style="font-size:10px;color:var(--txt3)">mo</span>
            <select class="bgt-agg-sel select-input" data-cid="${esc(b.categoryId)}">
              <option value="average" ${ovrAgg === 'average' ? 'selected' : ''}>avg</option>
              <option value="median" ${ovrAgg === 'median' ? 'selected' : ''}>median</option>
            </select>
          </span>
        </div>
      </div>`;
    }).join('');
    const isCollapsed = _collapsedBudgetGroups.has(groupName);
    const cgOvr = S.budgetGroupSourceOverrides[groupName] || null;
    const cgActive = !!cgOvr;
    const cgMode = cgOvr?.mode || '';
    const cgDefaultLookback = cgMode === 'actual' ? 3 : 1;
    const cgLookback = cgOvr?.lookback ?? cgDefaultLookback;
    const cgAgg = cgOvr?.aggregation || 'average';
    const cgInlineControls = cgActive ? `
          <div class="bgt-cg-src-inline">
            <select class="bgt-cg-mode-sel select-input" data-groupname="${esc(groupName)}">
              <option value="" ${!cgMode ? 'selected' : ''}>Default</option>
              <option value="planned" ${cgMode === 'planned' ? 'selected' : ''}>Planned</option>
              <option value="actual" ${cgMode === 'actual' ? 'selected' : ''}>Actual</option>
            </select>
            <span class="bgt-actual-opts ${!cgMode ? 'hidden' : ''}">
              <input class="bgt-cg-lookback text-input" type="number" min="1" max="12"
                     value="${cgLookback}" data-groupname="${esc(groupName)}"
                     style="width:40px;text-align:center;padding:2px 4px;font-size:11px"/>
              <span style="font-size:10px;color:var(--txt3)">mo</span>
              <select class="bgt-cg-agg-sel select-input" data-groupname="${esc(groupName)}">
                <option value="average" ${cgAgg === 'average' ? 'selected' : ''}>avg</option>
                <option value="median" ${cgAgg === 'median' ? 'selected' : ''}>median</option>
              </select>
            </span>
          </div>` : '';
    return `<div class="checklist-group${isCollapsed ? ' collapsed' : ''}${cgActive ? ' bgt-cg-active' : ''}" data-group="${gi}" data-groupname="${esc(groupName)}">
      <div class="checklist-group-header">
        <label class="checklist-group-toggle" title="Select all / deselect all">
          <input type="checkbox" class="group-toggle-cb" data-group="${gi}" ${allChecked && !allDisabled ? 'checked' : ''} ${allDisabled ? 'disabled' : ''}/>
        </label>
        <span class="checklist-group-name">${esc(groupName)}</span>
        ${cgInlineControls}
        <label class="bgt-cg-src-toggle" title="Apply one source setting to this entire group">
          <input type="checkbox" class="bgt-cg-toggle" data-groupname="${esc(groupName)}" ${cgActive ? 'checked' : ''}/>
          <span>Group source</span>
        </label>
        <button type="button" class="group-collapse-btn" data-group="${gi}" title="Collapse / expand">${isCollapsed ? '▸' : '▾'}</button>
      </div>
      <div class="checklist-group-items">
      ${items}
      </div>
    </div>`;
  }).join('');

  // syncGroupToggles: keeps group-toggle checkboxes in sync with individual items
  function syncGroupToggles() {
    list.querySelectorAll('.checklist-group').forEach(group => {
      const toggle = group.querySelector('.group-toggle-cb');
      if (!toggle || toggle.disabled) return;
      const cbs = [...group.querySelectorAll('input[type=checkbox]:not(.group-toggle-cb):not(.bgt-cg-toggle):not(:disabled)')];
      toggle.checked = cbs.length > 0 && cbs.every(cb => cb.checked);
    });
  }

  // Populate source override controls
  // sourceModeAll === false means per-category was explicitly chosen; undefined/true = all mode
  const isAllMode = group?.sourceModeAll !== false;
  const existingSrcOverride = group?.sourceOverride || null;
  const allToggle = byId('budgetMergeSourceAllToggle');
  allToggle.checked = isAllMode;
  byId('budgetMergeSourceAllControls').classList.toggle('hidden', !isAllMode);
  byId('budgetMergeCatList').classList.toggle('budget-merge-cat--all-mode', isAllMode);
  const srcModeEl = byId('budgetMergeSourceMode');
  srcModeEl.value = existingSrcOverride?.mode || '';
  byId('budgetMergeActualOpts').classList.toggle('hidden', !srcModeEl.value);
  // Always reset to mode-appropriate defaults, then apply saved values if present
  const initMode = srcModeEl.value;
  byId('budgetMergeLookback').value = existingSrcOverride?.lookback ?? (initMode === 'actual' ? 3 : 1);
  byId('budgetMergeAggSel').value   = existingSrcOverride?.aggregation || 'average';

  // Delegation is handled by setupBudgetMergeBuilderDelegation() — called once at init
  updateBudgetMergeTotal();

  // Populate expense dropdown — reuse buildExpenseOptionHTML for consistent styling,
  // then mark the current expenseId as selected afterward
  const expSel = byId('budgetMergeExpenseSel');
  const currentExpenseId = group?.mappings?.[0]?.expenseId || '';
  const isCreatingNew = currentExpenseId === '__CREATE_NEW__';
  expSel.innerHTML = buildExpenseOptionHTML();
  // Mark the current selection
  if (isCreatingNew) {
    expSel.value = '__CREATE_NEW__';
  } else if (currentExpenseId) {
    // buildExpenseOptionHTML uses planId::expenseId keys; find the matching option by expenseId
    const matchingOpt = [...expSel.options].find(o => o.value.endsWith('::' + currentExpenseId));
    if (matchingOpt) matchingOpt.selected = true;
  }

  // Pre-fill new expense form if editing a create-new entry
  const newExpenseForm = byId('budgetMergeNewExpenseForm');
  if (isCreatingNew) {
    newExpenseForm.classList.remove('hidden');
    byId('budgetMergeNewExpenseName').value = group?.mappings?.[0]?.newExpenseName || '';
    const savedType = group?.mappings?.[0]?.newExpType || 'living-expenses';
    byId('budgetMergeNewExpenseType').value = savedType;
    const savedFreq = group?.mappings?.[0]?.newFrequency;
    if (savedFreq) byId('budgetMergeNewExpenseFreq').value = savedFreq;
    renderExpFreqControl(savedType, 'budgetMergeFreqRow', 'budgetMergeNewExpenseFreq', savedFreq);
  } else {
    newExpenseForm.classList.add('hidden');
    renderExpFreqControl('living-expenses', 'budgetMergeFreqRow', 'budgetMergeNewExpenseFreq', null);
  }

  // Type/freqRow/expSel/planList delegation handled by setupBudgetMergeBuilderDelegation()
  updateExpSelStyle(expSel);

  // Render plan checklist — also used by the delegated expSel listener via renderBudgetMergePlanList()
  function renderPlanList(expenseId) {
    const section = byId('budgetMergePlanSection');
    const planList = byId('budgetMergePlanList');
    if (!expenseId) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    const isNew = expenseId === '__CREATE_NEW__';
    const allPlanIds = [...new Set(S.plExpenses.map(e => e.planId))];
    const checkedPlanIds = new Set((group?.mappings || [])
      .filter(m => m.expenseId === expenseId)
      .map(m => m.planId));

    const allChecked = allPlanIds.length > 0 && allPlanIds.every(id => checkedPlanIds.has(id));

    const rows = allPlanIds.map(planId => {
      const planEntry = S.plExpenses.find(e => e.planId === planId);
      const planName = planEntry?.planName || planId.slice(0, 8);
      const existsInPlan = isNew ? false : S.plExpenses.some(e => e.planId === planId && e.expenseId === expenseId);
      const hint = (isNew || !existsInPlan) ? ' <span style="color:var(--amber);font-size:11px;font-weight:700">(new)</span>' : '';
      const checked = checkedPlanIds.has(planId);
      return `<label class="checklist-item">
        <input type="checkbox" class="bmg-plan-cb" value="${esc(planId)}" data-exists="${existsInPlan}" ${checked ? 'checked' : ''}/>
        <span class="checklist-item-name">${esc(planName)}${hint}</span>
      </label>`;
    }).join('');

    planList.innerHTML = `
      <div class="checklist-group-header" style="background:var(--bg2);border-bottom:1px solid var(--border)">
        <label class="checklist-group-toggle" title="Select all plans / deselect all">
          <input type="checkbox" id="planSelectAll" ${allChecked ? 'checked' : ''}/>
        </label>
        <span class="checklist-group-name" style="font-size:12px;color:var(--txt2)">All plans</span>
      </div>
      ${rows}`;

    // planList delegation handled by setupBudgetMergeBuilderDelegation()
  }

  // Expose renderPlanList so the delegated expSel handler can call it
  // by storing it on the builder element for retrieval
  byId('budgetMergeBuilder')._renderPlanList = renderPlanList;

  const initialVal = expSel.value;
  const initialExpId = isCreatingNew ? '__CREATE_NEW__' : (initialVal.includes('::') ? initialVal.split('::')[1] : initialVal);
  renderPlanList(initialExpId);

  byId('budgetMergeBuilder').classList.remove('hidden');
  byId('budgetMergeFloatingBar').classList.remove('hidden');
  byId('panel-merge').classList.add('builder-open');
}

function closeBudgetMergeBuilder() {
  byId('budgetMergeBuilder').classList.add('hidden');
  byId('panel-merge').classList.remove('builder-open');
  const el = byId('budgetMergeTotalDisplay');
  if (el) el.textContent = '';
  byId('budgetMergeFloatingBar').classList.add('hidden');
  byId('budgetMergeFloatingTotal').textContent = '';
  byId('budgetMergePlanList').innerHTML = '';
  byId('budgetMergePlanSection').classList.add('hidden');
  byId('budgetMergeNewExpenseForm').classList.add('hidden');
  byId('budgetMergeNewExpenseName').value = '';
  const freqEl = byId('budgetMergeNewExpenseFreq');
  if (freqEl) freqEl.value = 'monthly';
  editingBudgetMergeId = null;
}

async function saveBudgetMergeGroup() {
  const name = byId('budgetMergeName').value.trim();
  if (!name) { toast('Enter a name for this merge group', 'err'); return; }
  const checked = [...byId('budgetMergeCatList').querySelectorAll('input[type=checkbox]:checked:not(.group-toggle-cb):not(.bgt-cg-toggle)')];
  const categoryIds = checked.map(c => c.value);
  if (categoryIds.length < 2) { toast('Select at least 2 categories to merge', 'err'); return; }

  // Guard against cross-group duplicates — if another group claims any of these
  // categories, remove them from that group (this group takes ownership).
  const otherGroups = S.budgetMergeGroups.filter(g => g.id !== editingBudgetMergeId);
  const categoryIdSet = new Set(categoryIds);
  let stolen = 0;
  for (const g of otherGroups) {
    const before = g.categoryIds.length;
    g.categoryIds = g.categoryIds.filter(cid => !categoryIdSet.has(cid));
    stolen += before - g.categoryIds.length;
  }
  // Remove any groups left with fewer than 2 categories (no longer valid merges)
  S.budgetMergeGroups = S.budgetMergeGroups.filter(g =>
    g.id === editingBudgetMergeId || g.categoryIds.length >= 2
  );
  if (stolen > 0) {
    toast(`${stolen} categor${stolen > 1 ? 'ies' : 'y'} moved to this group from another`, 'ok');
  }

  // Declare existing first — needed for stable UUID reuse on create-new expense edits
  const existing = editingBudgetMergeId
    ? S.budgetMergeGroups.find(g => g.id === editingBudgetMergeId)
    : null;

  // Build mappings from expense + plan selections
  const rawExpVal = byId('budgetMergeExpenseSel').value;
  const expenseId = rawExpVal === '__CREATE_NEW__' ? '__CREATE_NEW__' : (rawExpVal.includes('::') ? rawExpVal.split('::')[1] : rawExpVal);
  const isNewExpense = expenseId === '__CREATE_NEW__';
  let mappings = [];
  if (expenseId) {
    if (isNewExpense) {
      const newName = byId('budgetMergeNewExpenseName').value.trim();
      if (!newName) { toast('Enter a name for the new expense', 'err'); return; }
      const { expType, frequency: newFreq, expTypeParams } = collectExpTypeParams('budgetMerge');
      const newExpenseId = existing?.mappings?.[0]?.expenseId === '__CREATE_NEW__'
        ? (existing.mappings[0].newExpenseId || crypto.randomUUID())
        : crypto.randomUUID();
      const planCbs = [...byId('budgetMergePlanList').querySelectorAll('.bmg-plan-cb:checked')];
      mappings = planCbs.map(cb => ({
        planId:           cb.value,
        expenseId:        '__CREATE_NEW__',
        newExpenseId,
        newExpenseName:   newName,
        newFrequency:     newFreq,
        newExpType:       expType,
        newExpTypeParams: expTypeParams,
        createIfMissing:  true,
      }));
    } else {
      const planCbs = [...byId('budgetMergePlanList').querySelectorAll('.bmg-plan-cb:checked')];
      mappings = planCbs.map(cb => ({
        planId: cb.value,
        expenseId,
        createIfMissing: cb.dataset.exists === 'false',
      }));
    }
  }

  const sourceModeAll = byId('budgetMergeSourceAllToggle').checked;
  let sourceOverride = null;
  if (sourceModeAll) {
    const srcModeVal = byId('budgetMergeSourceMode').value;
    sourceOverride = srcModeVal ? {
      mode:        srcModeVal,
      lookback:    srcModeVal === 'actual' ? (Math.max(1, parseInt(byId('budgetMergeLookback').value, 10) || 3)) : 3,
      aggregation: srcModeVal === 'actual' ? (byId('budgetMergeAggSel').value || 'average') : 'average',
    } : null;
  }

  const entry = {
    id:           existing?.id || crypto.randomUUID(),
    name,
    categoryIds,
    mappings,
    sourceModeAll,
    sourceOverride,
  };

  if (editingBudgetMergeId) {
    const idx = S.budgetMergeGroups.findIndex(g => g.id === editingBudgetMergeId);
    if (idx > -1) S.budgetMergeGroups[idx] = entry;
  } else {
    S.budgetMergeGroups.push(entry);
  }
  await save();
  closeBudgetMergeBuilder();
  renderBudgetMerges();
  renderBudgetMapping();
  toast('Budget merge group saved!', 'ok');
}
