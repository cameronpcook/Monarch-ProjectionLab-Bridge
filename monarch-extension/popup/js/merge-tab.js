// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/merge-tab.js
// Merge tab: account merge groups and the merge builder.
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── MERGE tab ────────────────────────────────────────────────
let editingMergeId = null;

function setupMerge() {
  byId('addMergeGroup').addEventListener('click', () => openMergeBuilder());
  byId('addBudgetMergeGroup').addEventListener('click', () => openBudgetMergeBuilder());
  byId('saveBudgetMergeGroup').addEventListener('click', saveBudgetMergeGroup);
  byId('closeBudgetMergeBuilder').addEventListener('click', closeBudgetMergeBuilder);

  // Floating buttons wire to same actions
  byId('floatingAccountMergeBtn').addEventListener('click', () => openMergeBuilder());
  byId('floatingBudgetMergeBtn').addEventListener('click', () => openBudgetMergeBuilder());

  // Show floating buttons when merge-list scrolls — panel-merge has overflow:hidden
  // so IntersectionObserver can't see the legend leave the viewport
  byId('mergeGroupList').addEventListener('scroll', () => {
    const scrolled = byId('mergeGroupList').scrollTop > 10;
    byId('floatingAccountMergeBtn').classList.toggle('hidden', !scrolled);
    byId('floatingBudgetMergeBtn').classList.toggle('hidden', !scrolled);
  });
  byId('saveMergeGroup').addEventListener('click', saveMergeGroup);
  byId('floatingMergeSaveBtn').addEventListener('click', saveMergeGroup);
  byId('floatingBudgetMergeSaveBtn').addEventListener('click', saveBudgetMergeGroup);

  // Clamp manual-value override inputs (purchase price, current value, loan balance) to >= 0
  ['mergeValAmount', 'mergeValBalance', 'mergeValInitialValue'].forEach(id => {
    byId(id)?.addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      e.target.value = (isFinite(v) && v >= 0) ? v : 0;
    });
  });



  // Show floating save when account builder header scrolls out of view
  // Show floating save when account builder body has scrolled
  byId('mergeBuilderBody').addEventListener('scroll', () => {
    const scrolled = byId('mergeBuilderBody').scrollTop > 10;
    byId('mergeFloatingBar').classList.toggle('hidden', !scrolled);
  });
  byId('closeMergeBuilder').addEventListener('click', closeMergeBuilder);
  byId('mergeSourceList').addEventListener('change', updateMergePreview);

  // PL target select: show/hide creation sub-form
  byId('mergePlTarget').addEventListener('change', onMergePlTargetChange);

  // Category/type changes inside the merge create sub-form
  byId('mergeCreateCategory').addEventListener('change', onMergeCreateCategoryChange);
  byId('mergeCreateType').addEventListener('change', onMergeCreateTypeChange);
  byId('mergeCreatePaymentStatus').addEventListener('change', () => {
    refreshMergeSourceList(null); // re-render checklist with/without loan balance option
    updateMergeManualOverrides(); // re-evaluate which override rows show
  });
}

// Is the merge currently in "create new" + "multi-field asset" mode?
// True for ALL real asset types.
function mergeIsMultiField() {
  const val = byId('mergePlTarget').value;
  if (val === '__CREATE_NEW__') return byId('mergeCreateCategory').value === 'asset';
  // Existing PL asset — look up in plAccounts
  const acct = S.plAccounts.find(p => p.id === val);
  return acct?.category === 'asset';
}

// Returns true if the merge asset is "Fully Owned"
function mergeIsFullyOwned() {
  return byId('mergeCreatePaymentStatus')?.value === 'pay-in-full';
}

function onMergePlTargetChange() {
  const val = byId('mergePlTarget').value;
  const createForm = byId('mergeCreateForm');
  if (val === '__CREATE_NEW__') {
    createForm.classList.remove('hidden');
    onMergeCreateCategoryChange();
  } else {
    createForm.classList.add('hidden');
  }
  // If an existing asset is selected, update the hint to reflect field-mapping mode
  const hint = byId('mergeSourceHint');
  if (hint && mergeIsMultiField()) {
    hint.textContent = '— assign each to a field in the existing asset';
  }
  refreshMergeSourceList(null);
  updateMergePreview();
}

function onMergeCreateCategoryChange() {
  const cat     = byId('mergeCreateCategory').value;
  const typeRow = byId('mergeCreateTypeRow');
  const typeSel = byId('mergeCreateType');
  const paymentRow = byId('mergeCreatePaymentRow');
  if (cat === 'investment') {
    typeSel.innerHTML = INV_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
    typeRow.classList.remove('hidden');
    if (paymentRow) paymentRow.classList.add('hidden');
  } else if (cat === 'asset') {
    typeSel.innerHTML = ASSET_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
    typeRow.classList.remove('hidden');
    if (paymentRow) paymentRow.classList.remove('hidden');
  } else if (cat === 'debt') {
    typeSel.innerHTML = DEBT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
    typeRow.classList.remove('hidden');
    if (paymentRow) paymentRow.classList.add('hidden');
  } else {
    typeRow.classList.add('hidden');
    if (paymentRow) paymentRow.classList.add('hidden');
  }
  refreshMergeSourceList(null);
  updateMergeManualOverrides();
  updateMergePreview();
}

function onMergeCreateTypeChange() {
  refreshMergeSourceList(null);
  updateMergeManualOverrides();
  updateMergePreview();
}

// Refresh the checklist. existingFieldMappings allows pre-selecting field values when editing.
function refreshMergeSourceList(existingFieldMappings) {
  const multiField = mergeIsMultiField();
  const hint = byId('mergeSourceHint');
  hint.textContent = multiField
    ? '— assign each to a field in the new asset'
    : '— balances will be summed';

  const checkedIds = existingFieldMappings
    ? new Set(existingFieldMappings.map(fm => fm.monarchId))
    : new Set([...document.querySelectorAll('#mergeSourceList input[type=checkbox]:checked')].map(c => c.value));

  byId('mergeSourceList').innerHTML = visibleMonarchAccounts().map(a => {
    const isChecked = checkedIds.has(a.id);
    const existingField = existingFieldMappings?.find(fm => fm.monarchId === a.id)?.writeField || 'amount';
    if (multiField) {
      const fullyOwned = mergeIsFullyOwned();
      const fieldOpts  = ASSET_WRITE_FIELDS
        .filter(f => f.value !== 'initialValue')  // Purchase Price is manual override only
        .filter(f => !(fullyOwned && f.value === 'balance'))
        .map(f => `<option value="${f.value}" ${f.value === existingField ? 'selected' : ''}>${f.label}</option>`)
        .join('');
      return `
        <div class="check-item merge-field-row" data-monarch-id="${a.id}">
          <input type="checkbox" value="${a.id}" ${isChecked ? 'checked' : ''} class="merge-check"/>
          <span class="check-item-name">${esc(a.name)}</span>
          <span class="check-item-bal">${fmt(a.balance)}</span>
          <select class="select-input merge-field-sel ${isChecked ? '' : 'hidden'}"
                  data-monarch-id="${a.id}"
                  style="font-size:11px;padding:2px 20px 2px 6px;margin-left:auto;width:auto;max-width:120px">
            ${fieldOpts}
          </select>
        </div>`;
    } else {
      return `
        <label class="check-item">
          <input type="checkbox" value="${a.id}" ${isChecked ? 'checked' : ''}/>
          <span class="check-item-name">${esc(a.name)}</span>
          <span class="check-item-bal">${fmt(a.balance)}</span>
        </label>`;
    }
  }).join('');

  // Delegation handles all mergeSourceList interactions — see setupMergeSourceListDelegation()
  updateMergeManualOverrides();
}

// One-time delegated listeners for mergeSourceList — called from setupMerge()
function setupMergeSourceListDelegation() {
  const sourceList = byId('mergeSourceList');

  sourceList.addEventListener('change', e => {
    // Multi-field checkbox toggle: show/hide field selector
    const cb = e.target.closest('.merge-check');
    if (cb) {
      const row = cb.closest('.merge-field-row');
      const sel = row?.querySelector('.merge-field-sel');
      if (sel) sel.classList.toggle('hidden', !cb.checked);
      updateMergeManualOverrides();
      updateMergePreview();
      return;
    }
    // Field selector change
    if (e.target.classList.contains('merge-field-sel')) {
      updateMergeManualOverrides();
    }
    // Single-field checkbox: just update preview
    if (e.target.type === 'checkbox') {
      updateMergePreview();
    }
  });
}

// Show manual override inputs for any House asset fields not claimed by a Monarch account.
// Called any time the checklist or field assignments change.
function updateMergeManualOverrides() {
  const overridesEl = byId('mergeManualOverrides');
  if (!overridesEl) return;

  const isMultiField = mergeIsMultiField();
  if (!isMultiField) {
    overridesEl.classList.add('hidden');
    return;
  }

  overridesEl.classList.remove('hidden');

  // Collect which writeFields are currently covered by checked accounts
  const coveredFields = new Set();
  byId('mergeSourceList').querySelectorAll('.merge-field-row').forEach(row => {
    const cb  = row.querySelector('.merge-check');
    const sel = row.querySelector('.merge-field-sel');
    if (cb?.checked && sel) coveredFields.add(sel.value);
  });

  const fullyOwned = mergeIsFullyOwned();

  // Show override row only when: field not covered by a mapped account AND (not loan balance if fully owned)
  ['amount', 'balance', 'initialValue'].forEach(field => {
    const rowEl = byId('mergeOverride' + field.charAt(0).toUpperCase() + field.slice(1));
    if (rowEl) {
      const hide = coveredFields.has(field) || (field === 'balance' && fullyOwned);
      hide ? rowEl.classList.add('hidden') : rowEl.classList.remove('hidden');
    }
  });
}

function renderMerge() {
  renderCombinedMergeList();
}

function renderCombinedMergeList() {
  const list = byId('mergeGroupList');
  const hasAny = S.mergeGroups.length || S.budgetMergeGroups.length;
  if (!hasAny) {
    list.innerHTML = '<div class="empty-state" style="flex:none;padding:20px">No merge groups yet — use the buttons below to create one</div>';
    return;
  }
  const WRITE_FIELD_LABELS = { amount:'Current Value', balance:'Loan Balance', initialValue:'Purchase Price' };

  const accountCards = S.mergeGroups.map(g => {
    const isCreate = g.pendingCreate != null;
    let plName;
    if (isCreate) {
      plName = `<span style="color:var(--amber)">✦ New: ${esc(g.pendingCreate.name)}</span>
                <span style="font-size:12px;color:var(--txt2);margin-left:6px">${CATEGORY_LABELS[g.pendingCreate.plCategory] || ''} · ${g.pendingCreate.plType}</span>`;
    } else {
      const plAcct = S.plAccounts.find(p => p.id === g.plId);
      plName = plAcct ? (plAcct.subLabel ? `${esc(plAcct.name)} → ${plAcct.subLabel}` : esc(plAcct.name)) : (g.plId || '(PL account)');
    }
    let rowsHtml;
    if (g.fieldMappings) {
      rowsHtml = g.fieldMappings.map(fm => {
        const a = S.monarchAccounts.find(ac => ac.id === fm.monarchId);
        const fieldLabel = esc(WRITE_FIELD_LABELS[fm.writeField] || fm.writeField);
        return `<div class="merge-card-item merge-card-item--fields">
          <span class="merge-card-item-name">${a ? esc(a.name) : esc(fm.monarchId)}</span>
          <span class="merge-field-label">→ ${fieldLabel}</span>
          <span class="merge-card-item-bal">${a ? fmt(a.balance) : ''}</span>
        </div>`;
      }).join('');
    } else {
      rowsHtml = S.monarchAccounts.filter(a => g.monarchIds.includes(a.id))
        .map(a => `<div class="merge-card-item"><span class="merge-card-item-name">${esc(a.name)}</span><span class="merge-card-item-bal">${fmt(a.balance)}</span></div>`).join('');
    }
    return `<div class="merge-card merge-card--account" data-group-id="${g.id}">
      <div class="merge-card-header">
        <span class="merge-type-badge merge-type-badge--account">⇄ Account</span>
        <span class="merge-card-title">${plName}</span>
      </div>
      <div class="merge-card-body">${rowsHtml}</div>
      <div class="merge-card-actions">
        <button class="btn btn-sm btn-ghost edit-merge" data-id="${g.id}">Edit</button>
        <button class="btn btn-sm btn-danger remove-merge" data-id="${g.id}">Remove</button>
      </div>
    </div>`;
  });

  const budgetCards = S.budgetMergeGroups.map(g => {
    const cats = g.categoryIds.map(cid => {
      const b = S.monarchBudgets.find(x => x.categoryId === cid);
      return b ? { name: b.categoryName, amount: resolveMonarchAmount(b, getGroupCategoryOverride(g, cid)) } : { name: cid.slice(0,8), amount: 0 };
    });
    const total = cats.reduce((s, c) => s + c.amount, 0);
    const hasMappings = g.mappings?.length > 0;

    // Determine expense label for the card header
    let expenseLabel = '';
    if (hasMappings) {
      const firstMapping = g.mappings[0];
      if (firstMapping.expenseId === '__CREATE_NEW__') {
        expenseLabel = `<span style="color:var(--amber)">✦ New: ${esc(firstMapping.newExpenseName || 'expense')}</span>`;
      } else {
        const exp = S.plExpenses.find(e => e.expenseId === firstMapping.expenseId);
        expenseLabel = `<span style="color:var(--txt2);font-size:12px">${esc(exp?.expenseName || firstMapping.expenseId.slice(0,8))}</span>`;
      }
    }

    return `<div class="merge-card merge-card--budget" data-bmg-id="${g.id}">
      <div class="merge-card-header">
        <span class="merge-type-badge merge-type-badge--budget">💰 Budget</span>
        <span class="merge-card-title">${esc(g.name)}</span>
        ${expenseLabel ? `<span style="margin-left:auto">${expenseLabel}</span>` : `<span style="font-size:11px;color:var(--green);font-family:var(--font-mono);margin-left:auto">${fmt(total)}/mo</span>`}
      </div>
      <div class="merge-card-body">
        ${cats.map(c => `<div class="merge-card-item">
          <span class="merge-card-item-name">${esc(c.name)}</span>
          <span class="merge-card-item-bal">${fmt(c.amount)}/mo</span>
        </div>`).join('')}
      </div>
      <div class="merge-card-actions">
        <span style="font-size:12px;color:${hasMappings ? 'var(--green)' : 'var(--txt2)'}">
          ${hasMappings
            ? `✓ ${g.mappings.length} plan mapping${g.mappings.length>1?'s':''} · ${fmt(total)}/mo`
            : 'Map in Budgets tab'}
        </span>
        <button class="btn btn-sm btn-ghost edit-budget-merge" data-id="${g.id}">Edit</button>
        <button class="btn btn-sm btn-danger remove-budget-merge" data-id="${g.id}">Remove</button>
      </div>
    </div>`;
  });

  list.innerHTML = accountCards.join('') + budgetCards.join('');

}

// One-time delegated listeners for mergeGroupList — called from setupMerge()
function setupMergeGroupListDelegation() {
  const list = byId('mergeGroupList');

  list.addEventListener('click', async e => {
    const editMerge = e.target.closest('.edit-merge');
    if (editMerge) { openMergeBuilder(editMerge.dataset.id); return; }

    const removeMerge = e.target.closest('.remove-merge');
    if (removeMerge) {
      S.mergeGroups = S.mergeGroups.filter(g => g.id !== removeMerge.dataset.id);
      await save(); renderCombinedMergeList(); renderMapping();
      return;
    }

    const editBudget = e.target.closest('.edit-budget-merge');
    if (editBudget) { openBudgetMergeBuilder(editBudget.dataset.id); return; }

    const removeBudget = e.target.closest('.remove-budget-merge');
    if (removeBudget) {
      S.budgetMergeGroups = S.budgetMergeGroups.filter(g => g.id !== removeBudget.dataset.id);
      await save(); renderCombinedMergeList(); renderBudgetMapping();
      return;
    }
  });
}

function updateExpSelStyle(expSel) {
  if (!expSel) return;
  expSel.style.color = expSel.value === '__CREATE_NEW__' ? 'var(--amber)' : '';
  expSel.style.fontWeight = expSel.value === '__CREATE_NEW__' ? '600' : '';
}

// One-time delegated listeners for the budget merge builder — called from init.
// Handles: cat checklist, plan checklist, expense selector, type selector, freq row, source override.
function setupBudgetMergeBuilderDelegation() {
  // "Apply to all" toggle — shows/hides global controls, toggles per-row controls
  byId('budgetMergeSourceAllToggle').addEventListener('change', () => {
    const isAll = byId('budgetMergeSourceAllToggle').checked;
    byId('budgetMergeSourceAllControls').classList.toggle('hidden', !isAll);
    byId('budgetMergeCatList').classList.toggle('budget-merge-cat--all-mode', isAll);
    updateBudgetMergeTotal();
  });
  // Global source mode toggle
  byId('budgetMergeSourceMode').addEventListener('change', () => {
    const mv = byId('budgetMergeSourceMode').value;
    byId('budgetMergeActualOpts').classList.toggle('hidden', !mv);
    if (mv) {
      byId('budgetMergeLookback').value = mv === 'actual' ? 3 : 1;
      byId('budgetMergeAggSel').value   = 'average';
    }
    updateBudgetMergeTotal();
  });
  byId('budgetMergeLookback').addEventListener('change', () => {
    const el = byId('budgetMergeLookback');
    el.value = Math.max(1, Math.min(12, parseInt(el.value, 10) || 1));
    updateBudgetMergeTotal();
  });
  byId('budgetMergeAggSel').addEventListener('change', updateBudgetMergeTotal);

  // Category checklist — group toggles + individual checkboxes + per-row source controls
  const catList = byId('budgetMergeCatList');
  catList.addEventListener('change', async e => {
    // Per-row source mode
    const rowModeEl = e.target.closest('.bgt-mode-sel');
    if (rowModeEl) {
      const cid = rowModeEl.dataset.cid;
      const mode = rowModeEl.value;
      const row = rowModeEl.closest('.bgt-cat-item');
      if (row) row.querySelector('.bgt-actual-opts')?.classList.toggle('hidden', !mode);
      if (!mode) { delete S.budgetSourceOverrides[cid]; }
      else {
        const existing = S.budgetSourceOverrides[cid] || {};
        const defaultLb = mode === 'actual' ? 3 : 1;
        S.budgetSourceOverrides[cid] = { ...existing, mode, lookback: existing.lookback ?? defaultLb };
      }
      await save(); updateBudgetMergeTotal(); return;
    }
    // Per-row lookback
    const rowLookbackEl = e.target.closest('.bgt-lookback');
    if (rowLookbackEl) {
      const cid = rowLookbackEl.dataset.cid;
      const v = Math.max(1, Math.min(12, parseInt(rowLookbackEl.value, 10) || 3));
      rowLookbackEl.value = v;
      S.budgetSourceOverrides[cid] = { ...(S.budgetSourceOverrides[cid] || {}), lookback: v };
      await save(); updateBudgetMergeTotal(); return;
    }
    // Per-row aggregation
    const rowAggEl = e.target.closest('.bgt-agg-sel');
    if (rowAggEl) {
      const cid = rowAggEl.dataset.cid;
      S.budgetSourceOverrides[cid] = { ...(S.budgetSourceOverrides[cid] || {}), aggregation: rowAggEl.value };
      await save(); updateBudgetMergeTotal(); return;
    }

    // Group-level source toggle (merge builder checklist)
    const cgToggle = e.target.closest('.bgt-cg-toggle');
    if (cgToggle) {
      const gn = cgToggle.dataset.groupname;
      if (cgToggle.checked) {
        S.budgetGroupSourceOverrides[gn] = { mode: '', lookback: 1, aggregation: 'average' };
      } else {
        delete S.budgetGroupSourceOverrides[gn];
      }
      await save();
      const grpDiv = [...catList.querySelectorAll('.checklist-group')].find(el => el.dataset.groupname === gn);
      if (grpDiv) {
        grpDiv.classList.toggle('bgt-cg-active', cgToggle.checked);
        const header = grpDiv.querySelector('.checklist-group-header');
        const existingInline = header.querySelector('.bgt-cg-src-inline');
        if (cgToggle.checked && !existingInline) {
          const inlineDiv = document.createElement('div');
          inlineDiv.className = 'bgt-cg-src-inline';
          inlineDiv.innerHTML = `<select class="bgt-cg-mode-sel select-input" data-groupname="${esc(gn)}">
              <option value="" selected>Default</option>
              <option value="planned">Planned</option>
              <option value="actual">Actual</option>
            </select>
            <span class="bgt-actual-opts hidden">
              <input class="bgt-cg-lookback text-input" type="number" min="1" max="12"
                     value="1" data-groupname="${esc(gn)}"
                     style="width:40px;text-align:center;padding:2px 4px;font-size:11px"/>
              <span style="font-size:10px;color:var(--txt3)">mo</span>
              <select class="bgt-cg-agg-sel select-input" data-groupname="${esc(gn)}">
                <option value="average" selected>avg</option>
                <option value="median">median</option>
              </select>
            </span>`;
          header.querySelector('.bgt-cg-src-toggle').insertAdjacentElement('beforebegin', inlineDiv);
        } else if (!cgToggle.checked && existingInline) {
          existingInline.remove();
        }
      }
      updateBudgetMergeTotal(); return;
    }
    // Group-level source mode (merge builder checklist)
    const cgModeEl = e.target.closest('.bgt-cg-mode-sel');
    if (cgModeEl) {
      const gn   = cgModeEl.dataset.groupname;
      const mode = cgModeEl.value;
      const ctrlsDiv = cgModeEl.closest('.bgt-cg-src-inline');
      if (ctrlsDiv) ctrlsDiv.querySelector('.bgt-actual-opts')?.classList.toggle('hidden', !mode);
      if (!S.budgetGroupSourceOverrides[gn]) S.budgetGroupSourceOverrides[gn] = {};
      const defaultLookback = mode === 'actual' ? 3 : 1;
      S.budgetGroupSourceOverrides[gn] = { ...S.budgetGroupSourceOverrides[gn], mode, lookback: defaultLookback };
      const lb = ctrlsDiv?.querySelector('.bgt-cg-lookback');
      if (lb) lb.value = defaultLookback;
      await save(); updateBudgetMergeTotal(); return;
    }
    // Group-level lookback (merge builder checklist)
    const cgLookbackEl = e.target.closest('.bgt-cg-lookback');
    if (cgLookbackEl) {
      const gn = cgLookbackEl.dataset.groupname;
      const v  = Math.max(1, Math.min(12, parseInt(cgLookbackEl.value, 10) || 1));
      cgLookbackEl.value = v;
      if (!S.budgetGroupSourceOverrides[gn]) S.budgetGroupSourceOverrides[gn] = {};
      S.budgetGroupSourceOverrides[gn] = { ...S.budgetGroupSourceOverrides[gn], lookback: v };
      await save(); updateBudgetMergeTotal(); return;
    }
    // Group-level aggregation (merge builder checklist)
    const cgAggEl = e.target.closest('.bgt-cg-agg-sel');
    if (cgAggEl) {
      const gn = cgAggEl.dataset.groupname;
      if (!S.budgetGroupSourceOverrides[gn]) S.budgetGroupSourceOverrides[gn] = {};
      S.budgetGroupSourceOverrides[gn] = { ...S.budgetGroupSourceOverrides[gn], aggregation: cgAggEl.value };
      await save(); updateBudgetMergeTotal(); return;
    }

    const toggle = e.target.closest('.group-toggle-cb');
    if (toggle) {
      const gi    = toggle.dataset.group;
      const group = catList.querySelector(`.checklist-group[data-group="${gi}"]`);
      group?.querySelectorAll('input[type=checkbox]:not(.group-toggle-cb):not(.bgt-cg-toggle):not(:disabled)').forEach(cb => {
        cb.checked = toggle.checked;
      });
      updateBudgetMergeTotal();
      return;
    }
    if (e.target.type === 'checkbox') {
      updateBudgetMergeTotal();
      // Sync group toggle state
      catList.querySelectorAll('.checklist-group').forEach(grp => {
        const tog = grp.querySelector('.group-toggle-cb');
        if (!tog || tog.disabled) return;
        const cbs = [...grp.querySelectorAll('input[type=checkbox]:not(.group-toggle-cb):not(.bgt-cg-toggle):not(:disabled)')];
        tog.checked = cbs.length > 0 && cbs.every(c => c.checked);
      });
    }
  });

  // Collapse/expand group button — state persists across builder opens via _collapsedBudgetGroups
  catList.addEventListener('click', e => {
    const btn = e.target.closest('.group-collapse-btn');
    if (!btn) return;
    const gi = btn.dataset.group;
    const group = catList.querySelector(`.checklist-group[data-group="${gi}"]`);
    if (!group) return;
    const collapsed = group.classList.toggle('collapsed');
    btn.textContent = collapsed ? '▸' : '▾';
    const groupName = group.querySelector('.checklist-group-name')?.textContent;
    if (groupName) { collapsed ? _collapsedBudgetGroups.add(groupName) : _collapsedBudgetGroups.delete(groupName); }
  });

  // Plan checklist — select-all + individual plan checkboxes
  const planList = byId('budgetMergePlanList');
  planList.addEventListener('change', e => {
    if (e.target.id === 'planSelectAll') {
      planList.querySelectorAll('.bmg-plan-cb').forEach(cb => { cb.checked = e.target.checked; });
    } else if (e.target.classList.contains('bmg-plan-cb')) {
      const all       = [...planList.querySelectorAll('.bmg-plan-cb')];
      const selectAll = planList.querySelector('#planSelectAll');
      if (selectAll) selectAll.checked = all.every(c => c.checked);
    }
  });

  // Expense type selector
  byId('budgetMergeNewExpenseType').addEventListener('change', () => {
    renderExpFreqControl(byId('budgetMergeNewExpenseType').value, 'budgetMergeFreqRow', 'budgetMergeNewExpenseFreq', null);
    updateBudgetMergeTotal();
  });

  // Frequency selector (dynamically rendered into container — delegate on container)
  byId('budgetMergeFreqRow').addEventListener('change', () => updateBudgetMergeTotal());

  // Expense dropdown
  const expSel = byId('budgetMergeExpenseSel');
  expSel.addEventListener('change', () => {
    const val         = expSel.value;
    const isNew       = val === '__CREATE_NEW__';
    const newExpForm  = byId('budgetMergeNewExpenseForm');
    newExpForm.classList.toggle('hidden', !isNew);
    const expenseId   = isNew ? '__CREATE_NEW__' : val.split('::')[1];
    const fn = byId('budgetMergeBuilder')._renderPlanList;
    if (fn) fn(expenseId || val);
    updateExpSelStyle(expSel);
    updateBudgetMergeTotal(); // re-compute total using new expense's frequency
  });
  // Clear amber color while open so other options don't inherit it, restore on close.
  // Both mousedown (mouse users) and focus (keyboard users) must clear it.
  function clearExpSelAmber() { expSel.style.color = ''; expSel.style.fontWeight = ''; }
  expSel.addEventListener('mousedown', clearExpSelAmber);
  expSel.addEventListener('focus',     clearExpSelAmber);
  expSel.addEventListener('blur',      () => updateExpSelStyle(expSel));
}

function openMergeBuilder(id = null) {
  editingMergeId = id;
  const group = id ? S.mergeGroups.find(g => g.id === id) : null;
  byId('mergeBuilderTitle').textContent = id ? 'Edit Merge Group' : 'New Merge Group';

  const isCreate = group?.pendingCreate != null;

  // Populate PL target dropdown
  byId('mergePlTarget').innerHTML = buildPlOptionHTML(isCreate ? '__CREATE_NEW__' : (group?.plId || ''), false);
  // If editing a pending-create group, force the value to __CREATE_NEW__
  if (isCreate) byId('mergePlTarget').value = '__CREATE_NEW__';

  // Show/hide creation sub-form
  const createForm = byId('mergeCreateForm');
  if (isCreate) {
    createForm.classList.remove('hidden');
    // Pre-fill creation fields
    byId('mergeCreateName').value = group.pendingCreate.name || '';
    byId('mergeCreateCategory').value = group.pendingCreate.plCategory || 'asset';
    onMergeCreateCategoryChange(); // populates type options
    if (group.pendingCreate.plType) byId('mergeCreateType').value = group.pendingCreate.plType;
    // Restore manual values
    const mv = group.pendingCreate.manualValues || {};
    if (byId('mergeValAmount'))       byId('mergeValAmount').value       = mv.amount       || '';
    if (byId('mergeValBalance'))      byId('mergeValBalance').value      = mv.balance      || '';
    if (byId('mergeValInitialValue')) byId('mergeValInitialValue').value = mv.initialValue || '';
  } else {
    createForm.classList.add('hidden');
  }

  // Render source list (with pre-selected fieldMappings if editing)
  refreshMergeSourceList(group?.fieldMappings || null);

  // For regular groups, also check the right boxes
  if (!isCreate && group?.monarchIds) {
    group.monarchIds.forEach(mid => {
      const cb = byId('mergeSourceList').querySelector(`input[value="${mid}"]`);
      if (cb) cb.checked = true;
    });
  }

  byId('mergeBuilder').classList.remove('hidden');
  byId('panel-merge').classList.add('builder-open');
  updateMergePreview();
}

function closeMergeBuilder() {
  byId('mergeBuilder').classList.add('hidden');
  byId('panel-merge').classList.remove('builder-open');
  byId('mergeFloatingBar').classList.add('hidden');
  const ft = byId('mergeFloatingTotal');
  if (ft) ft.textContent = '';
  editingMergeId = null;
  byId('mergeSourceList').querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
  const hdr = byId('mergeTotalDisplay');
  if (hdr) hdr.textContent = '';
}

function updateMergePreview() {
  const checked = [...document.querySelectorAll('#mergeSourceList input[type=checkbox]:checked')].map(c => c.value);
  const total   = S.monarchAccounts.filter(a => checked.includes(a.id)).reduce((s, a) => s + (a.balance || 0), 0);
  const txt = checked.length ? fmt(total) : '';
  const hdr = byId('mergeTotalDisplay');
  if (hdr) hdr.textContent = txt;
  const floating = byId('mergeFloatingTotal');
  if (floating) floating.textContent = txt;
}

async function saveMergeGroup() {
  const plId       = byId('mergePlTarget').value;
  const isCreate   = plId === '__CREATE_NEW__';
  const monarchIds = [...document.querySelectorAll('#mergeSourceList input[type=checkbox]:checked')].map(c => c.value);

  if (!plId && !isCreate) { toast('Choose a PL account', 'err'); return; }
  if (!monarchIds.length)  { toast('Select at least one Monarch account', 'err'); return; }

  let entry;

  if (isCreate) {
    const name     = byId('mergeCreateName').value.trim();
    const cat      = byId('mergeCreateCategory').value;
    const typeRow  = byId('mergeCreateTypeRow');
    const plType   = typeRow.classList.contains('hidden') ? cat
                   : byId('mergeCreateType').value;
    if (!name) { toast('Enter a name for the new PL account', 'err'); return; }

    const isMultiField = mergeIsMultiField();
    let fieldMappings = null;

    if (isMultiField) {
      // Each checked account has its own field selector
      fieldMappings = monarchIds.map(mid => {
        const sel = document.querySelector(`#mergeSourceList .merge-field-sel[data-monarch-id="${mid}"]`);
        const acct = S.monarchAccounts.find(a => a.id === mid);
        return {
          monarchId:  mid,
          writeField: sel ? sel.value : 'amount',
          balance:    acct?.balance ?? 0,
        };
      });
    }

    const mergePaymentStatus = byId('mergeCreatePaymentStatus')?.value || 'financed';
    entry = {
      id: editingMergeId || `mg_${Date.now()}`,
      plId:          null,
      plRealId:      null,
      plField:       isMultiField ? null : 'amount',
      monarchIds,
      fieldMappings,
      pendingCreate: {
        name, plCategory: cat, plType,
        paymentStatus: mergePaymentStatus,
        manualValues: {
          amount:       parseFloat(byId('mergeValAmount')?.value       || '0') || 0,
          balance:      parseFloat(byId('mergeValBalance')?.value      || '0') || 0,
          initialValue: parseFloat(byId('mergeValInitialValue')?.value || '0') || 0,
        },
      },
    };
  } else {
    const { realId: plRealId } = resolvePlMapping(plId);
    const isMultiField = mergeIsMultiField();
    let fieldMappings = null;
    if (isMultiField) {
      fieldMappings = monarchIds.map(mid => {
        const sel = document.querySelector(`#mergeSourceList .merge-field-sel[data-monarch-id="${mid}"]`);
        const acct = S.monarchAccounts.find(a => a.id === mid);
        return {
          monarchId:  mid,
          writeField: sel ? sel.value : 'amount',
          balance:    acct?.balance ?? 0,
        };
      });
    }
    const plField = isMultiField ? null : resolvePlMapping(plId).field;
    entry = { id: editingMergeId || `mg_${Date.now()}`, plId, plRealId, plField, monarchIds, fieldMappings };
  }

  if (editingMergeId) {
    const idx = S.mergeGroups.findIndex(g => g.id === editingMergeId);
    if (idx > -1) S.mergeGroups[idx] = entry;
  } else { S.mergeGroups.push(entry); }

  await save();
  closeMergeBuilder();
  renderMerge();
  renderMapping();
  toast('Merge group saved!', 'ok');
}
