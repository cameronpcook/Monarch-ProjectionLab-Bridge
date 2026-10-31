// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/mapping-tab.js
// Mapping → Accounts: account mapping list, inline PL account creation, auto-map, bulk create.
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── MAPPING tab ──────────────────────────────────────────────
function setupMapping() {
  byId('mappingSearch').addEventListener('input', renderMapping);
  byId('autoMapBtn').addEventListener('click', autoMap);

  async function doSave() {
    await save();
    const status = byId('mappingSaveStatus');
    if (status) { status.textContent = '✓ Saved'; setTimeout(() => { status.textContent = ''; }, 3500); }
    toast('Mappings saved!', 'ok');
  }

  byId('saveMappings').addEventListener('click', doSave);
  byId('floatingSaveBtn').addEventListener('click', doSave);
  byId('createAllBtn').addEventListener('click', openBulkCreatePanel);

  // Show floating save button when the header-row save button scrolls out of view
  const legend = document.querySelector('#sub-panel-accounts .mapping-legend');
  const floatBar = byId('floatingSaveBar');
  document.addEventListener('scroll', () => {
    if (!floatBar || !legend) return;
    floatBar.classList.toggle('hidden', legend.getBoundingClientRect().bottom > 0);
  }, { passive: true });
}

function buildPlOptionHTML(selectedId, showAssetSubtypes = true) {
  let html = '<option value="">— unmapped —</option>';
  html += `<option value="__CREATE_NEW__" class="create-opt">✦ Create new PL account…</option>`;

  if (!S.plAccounts.length) return html;

  const groups = {};
  for (const p of S.plAccounts) {
    if (!groups[p.category]) groups[p.category] = [];
    if (p.category === 'asset') {
      if (showAssetSubtypes) {
        // Mapping page: show Current Value + Loan Balance, skip Purchase Price
        if (p.writeField === 'initialValue') continue;
      } else {
        // Merge page: only the primary entry (no sub-entries at all)
        if (p.writeField !== 'amount') continue;
      }
    }
    groups[p.category].push(p);
  }
  for (const [cat, items] of Object.entries(groups)) {
    html += `<optgroup label="── ${CATEGORY_LABELS[cat] || cat} ──">`;
    for (const p of items) {
      const label = (showAssetSubtypes && p.subLabel) ? `${esc(p.name)} → ${p.subLabel}` : esc(p.name);
      html += `<option value="${esc(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${label}</option>`;
    }
    html += '</optgroup>';
  }
  return html;
}

function updateCreateAllBtn() {
  const mergedIds = new Set(S.mergeGroups.flatMap(g => g.monarchIds));
  const unmappedCount = visibleMonarchAccounts().filter(a =>
    !S.mappings[a.id] && !mergedIds.has(a.id) && !S.pendingCreations[a.id]
  ).length;
  const btn = byId('createAllBtn');
  btn.textContent = `✦ Create all unmapped (${unmappedCount})`;
  btn.disabled = !unmappedCount;
}

function renderMapping() {
  const q     = byId('mappingSearch').value.toLowerCase();
  const list  = byId('mappingList');
  const mergedIds = new Set(S.mergeGroups.flatMap(g => g.monarchIds));

  const filtered = visibleMonarchAccounts().filter(a =>
    !q || a.name.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No accounts — fetch from Setup tab</div>';
    return;
  }

  updateCreateAllBtn();

  list.innerHTML = filtered.map(a => {
    const isMerged  = mergedIds.has(a.id);
    const creation  = S.pendingCreations[a.id];
    const curMapping = S.mappings[a.id] || {};
    const plId      = curMapping.plId || '';
    const plAcct    = S.plAccounts.find(p => p.id === plId);
    const catColor  = plAcct ? (CATEGORY_COLORS[plAcct.category] || 'var(--txt2)') : 'var(--txt2)';

    // If this account has a pending creation, show the creation badge
    const creationBadge = creation
      ? `<span class="create-badge">${CATEGORY_LABELS[creation.plCategory] || creation.plCategory}</span>`
      : '';

    return `
      <div class="map-row ${isMerged ? 'merged' : ''} ${creation ? 'has-creation' : ''}"
           data-monarch-id="${a.id}">
        <div class="map-source">
          <div class="map-source-name">${esc(a.name)}${creationBadge}</div>
          <div class="map-source-bal">${fmt(a.balance)}${isMerged ? ' · <span style="color:var(--amber)">in merge</span>' : ''}
          </div>
        </div>
        <div class="map-arrow">→</div>
        <div class="map-dest">
          ${(() => {
            if (creation) {
              const wfLabels = {amount:'Current Value',balance:'Loan Balance',initialValue:'Purchase Price'};
              if (creation.failedAt) {
                // Failed creation — show error with Retry and Clear actions
                return `<div class="creation-error">
                  <span class="creation-error-label">✗ Failed: ${esc(creation.name)}</span>
                  <span class="creation-error-msg">${esc(creation.errorMsg || 'Unknown error')}</span>
                  <div class="creation-error-actions">
                    <button class="btn btn-sm btn-ghost creation-retry" data-mid="${a.id}">↺ Retry</button>
                    <button class="btn btn-sm btn-danger creation-clear" data-mid="${a.id}">✕ Clear</button>
                  </div>
                </div>`;
              }
              return `<div class="creation-summary" style="cursor:pointer" data-edit-mid="${a.id}" title="Click to edit">
                <span class="creation-label">New: ${esc(creation.name)} <span style="font-size:12px;color:var(--txt2)">&#9998; edit</span></span>
                <span class="creation-cat" style="color:${CATEGORY_COLORS[creation.plCategory]}">${CATEGORY_LABELS[creation.plCategory]}${creation.plType && creation.plType !== creation.plCategory ? ' &middot; '+esc(creation.plType) : ''}${creation.writeField ? ' &middot; '+(wfLabels[creation.writeField]||'') : ''}</span>
              </div>`;
            }
            if (isMerged) {
              const mergeGroup = S.mergeGroups.find(g => g.monarchIds.includes(a.id));
              const wfLabels = {amount:'Current Value',balance:'Loan Balance',initialValue:'Purchase Price'};
              let mergeLabel = 'in merge';
              if (mergeGroup && mergeGroup.pendingCreate) {
                const fm = mergeGroup.fieldMappings && mergeGroup.fieldMappings.find(f => f.monarchId === a.id);
                mergeLabel = 'New: ' + esc(mergeGroup.pendingCreate.name) + (fm ? ' \u2192 ' + (wfLabels[fm.writeField]||fm.writeField) : '');
              } else if (mergeGroup && mergeGroup.plId) {
                const plAcct = S.plAccounts.find(p => p.id === mergeGroup.plId);
                mergeLabel = plAcct ? esc(plAcct.name) : 'in merge';
              }
              return `<div style="font-size:11px;color:var(--amber);padding:4px 0;font-weight:600">${mergeLabel}</div>`;
            }
            return `<select class="select-input pl-acct-select"
                       style="font-size:11px;padding:4px 24px 4px 8px;border-left:2px solid ${catColor}"
                       data-monarch-id="${a.id}">
                 ${buildPlOptionHTML(plId)}
               </select>`;
          })()}
        </div>
        ${isMerged
          ? '<span class="map-info-icon" title="This account is managed from the Merge tab">ⓘ</span>'
          : `<button class="map-remove" data-monarch-id="${a.id}" title="Clear">✕</button>`
        }
      </div>
      <!-- inline creation form placeholder -->
      <div class="creation-form hidden" id="creation-form-${a.id}"></div>`;
  }).join('');

}

// One-time delegated listeners for mappingList — called from setupMapping()
function setupMappingListDelegation() {
  const list = byId('mappingList');

  // Clamp asset override value inputs to >= 0
  list.addEventListener('change', e => {
    const overrideInp = e.target.closest('.cf-override-val');
    if (overrideInp) {
      const v = parseFloat(overrideInp.value);
      overrideInp.value = (isFinite(v) && v >= 0) ? v : 0;
      return;
    }
  });

  list.addEventListener('change', e => {
    const sel = e.target.closest('.pl-acct-select');
    if (sel) {
      const mid = sel.dataset.monarchId;
      if (sel.value === '__CREATE_NEW__') {
        sel.value = '';
        showCreationForm(mid);
        return;
      }
      const plId = sel.value;
      if (plId) {
        const { realId, field } = resolvePlMapping(plId);
        S.mappings[mid] = { plId, plRealId: realId, plField: field };
      } else {
        delete S.mappings[mid];
      }
      const plAcct = S.plAccounts.find(p => p.id === plId);
      sel.style.borderLeft = `2px solid ${plAcct ? CATEGORY_COLORS[plAcct.category] : 'var(--txt2)'}`;
      updateCreateAllBtn();
    }

    // Payment status / write-field changes inside inline creation forms
    if (e.target.classList.contains('cf-payment-status')) {
      const formEl = e.target.closest('.creation-form');
      if (formEl) { syncAssetRowsForPayment(formEl, e.target.value); syncOverrideRows(formEl); }
    }
    if (e.target.classList.contains('cf-write-field')) {
      const formEl = e.target.closest('.creation-form');
      if (formEl) syncOverrideRows(formEl);
    }
  });

  list.addEventListener('click', async e => {
    // Edit creation summary → reopen form
    const summary = e.target.closest('.creation-summary[data-edit-mid]');
    if (summary) { showCreationForm(summary.dataset.editMid); return; }

    // Retry failed creation
    const retry = e.target.closest('.creation-retry');
    if (retry) {
      const mid = retry.dataset.mid;
      if (S.pendingCreations[mid]) {
        delete S.pendingCreations[mid].failedAt;
        delete S.pendingCreations[mid].errorMsg;
        await save(); renderMapping();
        toast('Creation re-armed — push to sync to retry', 'ok');
      }
      return;
    }

    // Clear failed creation
    const clear = e.target.closest('.creation-clear');
    if (clear) {
      delete S.pendingCreations[clear.dataset.mid];
      await save(); renderMapping();
      toast('Creation cleared', '');
      return;
    }

    // Remove mapping
    const remove = e.target.closest('.map-remove');
    if (remove) {
      delete S.mappings[remove.dataset.monarchId];
      delete S.pendingCreations[remove.dataset.monarchId];
      renderMapping();
      return;
    }

    // Save / cancel inline creation form buttons
    const cfSave = e.target.closest('.cf-save');
    if (cfSave) {
      const formEl = cfSave.closest('.creation-form');
      const monarchId = formEl?.id?.replace('creation-form-', '');
      if (monarchId && formEl) saveCreationForm(monarchId, formEl);
      return;
    }
    const cfCancel = e.target.closest('.cf-cancel');
    if (cfCancel) {
      const formEl = cfCancel.closest('.creation-form');
      if (formEl) { formEl.classList.add('hidden'); renderMapping(); }
      return;
    }
  });
}

// ── Inline creation form ──────────────────────────────────────
function showCreationForm(monarchId, closeOthers = true) {
  if (closeOthers) {
    document.querySelectorAll('.creation-form:not(.hidden)').forEach(f => f.classList.add('hidden'));
  }

  const a        = S.monarchAccounts.find(ac => ac.id === monarchId);
  if (!a) return;
  const inferred = inferCategory(a);
  const formEl   = byId(`creation-form-${monarchId}`);
  if (!formEl) return;

  formEl.innerHTML = buildCreationFormHTML(monarchId, a, inferred);
  formEl.classList.remove('hidden');

  // Wire up category → type sub-select visibility
  const catSel   = formEl.querySelector('.cf-category');
  const typeRow  = formEl.querySelector('.cf-type-row');
  const typeSel  = formEl.querySelector('.cf-type');
  const fieldRow = formEl.querySelector('.cf-field-row');

  // Category and type changes use direct listeners since they interact with
  // each other synchronously (category change must immediately update type options)
  catSel.addEventListener('change', () => {
    updateTypeOptions(catSel, typeRow, typeSel);
  });
  typeSel.addEventListener('change', () => {
    updateFieldRow(catSel.value, typeSel.value, fieldRow);
    syncOverrideRows(formEl);
  });

  // Set initial state
  updateTypeOptions(catSel, typeRow, typeSel, inferred.type);
  syncOverrideRows(formEl);
  // cf-payment-status, cf-write-field, cf-save, cf-cancel are handled by
  // the delegated listener on mappingList (setupMappingListDelegation)
}

function buildCreationFormHTML(monarchId, a, inferred) {
  const catOptions = PL_CATEGORIES.map(c =>
    `<option value="${c.value}" ${c.value === inferred.category ? 'selected' : ''}>${c.label}</option>`
  ).join('');
  const inferredWriteField = inferred.category === 'asset' ? (inferred.writeField || 'amount') : '';

  return `
    <div class="cf-inner">
      <div class="cf-row">
        <label class="cf-label">Name in ProjectionLab</label>
        <input class="text-input cf-name" value="${esc(a.name)}" style="font-size:12px;padding:5px 8px"/>
      </div>
      <div class="cf-row">
        <label class="cf-label">Category</label>
        <select class="select-input cf-category" style="font-size:12px;padding:5px 24px 5px 8px">
          ${catOptions}
        </select>
      </div>
      <div class="cf-row cf-type-row hidden">
        <label class="cf-label cf-type-label">Account Type</label>
        <select class="select-input cf-type" style="font-size:12px;padding:5px 24px 5px 8px"></select>
      </div>
      <!-- Asset-only rows — shown for all Real Assets -->
      <div class="cf-row cf-payment-row hidden">
        <label class="cf-label">Payment Status</label>
        <select class="select-input cf-payment-status" style="font-size:12px;padding:5px 24px 5px 8px">
          <option value="financed" selected>Financed</option>
          <option value="pay-in-full">Fully Owned</option>
        </select>
      </div>
      <div class="cf-row cf-field-row hidden">
        <label class="cf-label">This Monarch balance represents</label>
        <select class="select-input cf-write-field" style="font-size:12px;padding:5px 24px 5px 8px">
          ${ASSET_WRITE_FIELDS.map(f =>
            `<option value="${f.value}" ${f.value === inferredWriteField ? 'selected' : ''}>${f.label}</option>`
          ).join('')}
        </select>
      </div>
      <!-- Manual value overrides for unmapped asset fields (hidden until asset category selected) -->
      <div class="cf-asset-overrides hidden">
        <div class="cf-label" style="margin-top:4px;margin-bottom:4px">
          Unmapped field values <span style="font-size:12px;font-weight:400;color:var(--txt2)">set values not covered by the Monarch balance</span>
        </div>
        <div class="cf-override-row" data-field="amount">
          <span class="cf-override-label">Current Value</span>
          <input type="number" class="text-input cf-override-val" data-field="amount" placeholder="0" min="0" style="font-size:11px;padding:3px 6px"/>
        </div>
        <div class="cf-override-row cf-override-balance" data-field="balance">
          <span class="cf-override-label">Loan Balance</span>
          <input type="number" class="text-input cf-override-val" data-field="balance" placeholder="0" min="0" style="font-size:11px;padding:3px 6px"/>
        </div>
        <div class="cf-override-row" data-field="initialValue">
          <span class="cf-override-label">Purchase Price</span>
          <input type="number" class="text-input cf-override-val" data-field="initialValue" placeholder="0" min="0" style="font-size:11px;padding:3px 6px"/>
        </div>
      </div>
      <div class="cf-actions">
        <button class="btn btn-primary btn-sm cf-save">Confirm Create</button>
        <button class="btn btn-ghost btn-sm cf-cancel">Cancel</button>
      </div>
    </div>`;
}

// updateTypeOptions: fires when the CATEGORY select changes.
// Populates the type sub-select and hides/shows rows appropriately.
// Does NOT touch cf-field-row — that's handled by updateFieldRow.
// preselectedType: optional — when provided, that option is selected after populating.
// This is critical: without it, typeSel.value always defaults to the first option
// (real-estate), so the field row would always show for assets.
function updateTypeOptions(catSel, typeRow, typeSel, preselectedType) {
  const cat      = catSel.value;
  const formEl   = catSel.closest('.cf-inner');
  const fieldRow = formEl?.querySelector('.cf-field-row');

  if (cat === 'investment') {
    typeSel.innerHTML = INV_TYPES.map(t =>
      `<option value="${t.value}" ${preselectedType && t.value === preselectedType ? 'selected' : ''}>${t.label}</option>`
    ).join('');
    typeRow.classList.remove('hidden');
  } else if (cat === 'asset') {
    typeSel.innerHTML = ASSET_TYPES.map(t =>
      `<option value="${t.value}" ${preselectedType && t.value === preselectedType ? 'selected' : ''}>${t.label}</option>`
    ).join('');
    typeRow.classList.remove('hidden');
  } else if (cat === 'debt') {
    typeSel.innerHTML = DEBT_TYPES.map(t =>
      `<option value="${t.value}" ${preselectedType && t.value === preselectedType ? 'selected' : ''}>${t.label}</option>`
    ).join('');
    typeRow.classList.remove('hidden');
  } else {
    // savings — no sub-type
    typeRow.classList.add('hidden');
  }
  // Evaluate field row with the NOW-CORRECT typeSel.value (pre-selection already applied above)
  if (fieldRow) updateFieldRow(cat, typeSel.value, fieldRow);
}

// updateFieldRow — show asset rows for ALL real assets, hide for everything else.
// Also manages payment-status row, overrides section, and loan balance visibility.
function updateFieldRow(cat, plType, fieldRow) {
  const formEl       = fieldRow.closest('.cf-inner');
  const paymentRow   = formEl?.querySelector('.cf-payment-row');
  const overridesEl  = formEl?.querySelector('.cf-asset-overrides');
  const paymentSel   = formEl?.querySelector('.cf-payment-status');

  if (cat === 'asset') {
    fieldRow.classList.remove('hidden');
    if (paymentRow)  paymentRow.classList.remove('hidden');
    if (overridesEl) overridesEl.classList.remove('hidden');
    // Sync the write-field options and override rows to current payment status
    syncAssetRowsForPayment(formEl, paymentSel?.value || 'financed');
  } else {
    fieldRow.classList.add('hidden');
    if (paymentRow)  paymentRow.classList.add('hidden');
    if (overridesEl) overridesEl.classList.add('hidden');
  }
}

// Show/hide Loan Balance option and override row based on payment status.
function syncAssetRowsForPayment(formEl, paymentStatus) {
  const fullyOwned   = paymentStatus === 'pay-in-full';
  const writeFieldSel = formEl?.querySelector('.cf-write-field');
  const loanOverride = formEl?.querySelector('.cf-override-balance');

  // Remove or restore Loan Balance option in the write-field select
  if (writeFieldSel) {
    const curVal = writeFieldSel.value;
    writeFieldSel.innerHTML = ASSET_WRITE_FIELDS
      .filter(f => !(fullyOwned && f.value === 'balance'))
      .map(f => `<option value="${f.value}" ${f.value === curVal ? 'selected' : ''}>${f.label}</option>`)
      .join('');
    if (fullyOwned && curVal === 'balance') writeFieldSel.value = 'amount';
  }

  // Hide/show the Loan Balance manual override row
  if (loanOverride) {
    fullyOwned ? loanOverride.classList.add('hidden') : loanOverride.classList.remove('hidden');
  }
}

// Sync override rows: hide the row whose field is already covered by the write-field select.
function syncOverrideRows(formEl) {
  const writeFieldSel = formEl?.querySelector('.cf-write-field');
  const covered = writeFieldSel?.value;
  formEl?.querySelectorAll('.cf-override-row').forEach(row => {
    if (row.dataset.field === covered) {
      row.classList.add('hidden');
    } else {
      row.classList.remove('hidden');
    }
  });
  // Also keep loan balance hidden if fully owned
  const paymentSel = formEl?.querySelector('.cf-payment-status');
  const loanRow = formEl?.querySelector('.cf-override-balance');
  if (loanRow && paymentSel?.value === 'pay-in-full') {
    loanRow.classList.add('hidden');
  }
}

function saveCreationForm(monarchId, formEl) {
  const a        = S.monarchAccounts.find(ac => ac.id === monarchId);
  const name     = formEl.querySelector('.cf-name').value.trim();
  const cat      = formEl.querySelector('.cf-category').value;
  const typeRow  = formEl.querySelector('.cf-type-row');
  const fieldRow = formEl.querySelector('.cf-field-row');

  const plType = typeRow.classList.contains('hidden')
    ? (cat === 'savings' ? 'savings' : 'debt')
    : formEl.querySelector('.cf-type').value;

  // writeField and paymentStatus apply to ALL real assets
  const writeField = (cat === 'asset' && fieldRow && !fieldRow.classList.contains('hidden'))
    ? (formEl.querySelector('.cf-write-field')?.value || 'amount')
    : null;

  const paymentStatus = cat === 'asset'
    ? (formEl.querySelector('.cf-payment-status')?.value || 'financed')
    : null;

  // Collect manual override values for asset fields not covered by writeField
  const manualValues = {};
  if (cat === 'asset') {
    formEl.querySelectorAll('.cf-override-row:not(.hidden) .cf-override-val').forEach(inp => {
      const val = parseFloat(inp.value) || 0;
      manualValues[inp.dataset.field] = val;
    });
  }

  if (!name) { toast('Enter an account name', 'err'); return; }

  S.pendingCreations[monarchId] = {
    monarchId, name, balance: a?.balance ?? 0,
    plCategory: cat, plType,
    writeField,     // null for non-assets; 'amount'|'balance'|'initialValue' for assets
    paymentStatus,  // null for non-assets; 'financed'|'pay-in-full' for assets
    manualValues,   // {} for non-assets; override values for unmapped asset fields
  };
  delete S.mappings[monarchId];
  renderMapping();
  toast(`"${name}" queued for creation`, 'ok');
}

// ── Auto-map ──────────────────────────────────────────────────
function autoMap() {
  const primaryPL = S.plAccounts.filter(p => !p.subLabel || p.subLabel === 'Current Value');
  let matched = 0;

  function nameWords(name) {
    return new Set(name.toLowerCase().split(/[\s\-_.,()&]+/).filter(w => w.length >= 2));
  }
  function jaccard(a, b) {
    const wa = nameWords(a), wb = nameWords(b);
    if (!wa.size || !wb.size) return 0;
    let inter = 0;
    for (const w of wa) if (wb.has(w)) inter++;
    return inter / (wa.size + wb.size - inter);
  }

  const THRESHOLD = 0.5;

  // Track PL IDs already assigned (existing mappings + newly assigned this run)
  const assignedPlIds = new Set(
    Object.values(S.mappings).map(m => m.plRealId).filter(Boolean)
  );

  for (const ma of visibleMonarchAccounts()) {
    if (S.mappings[ma.id]) continue;

    let bestPL = null, bestScore = 0;
    for (const p of primaryPL) {
      // Skip PL accounts already claimed by another Monarch account
      if (assignedPlIds.has(p.id)) continue;
      const score = jaccard(ma.name, p.name);
      if (score > bestScore) { bestScore = score; bestPL = p; }
    }

    if (bestPL && bestScore >= THRESHOLD) {
      const { realId, field } = resolvePlMapping(bestPL.id);
      S.mappings[ma.id] = { plId: bestPL.id, plRealId: realId, plField: field };
      assignedPlIds.add(bestPL.id); // reserve for this run
      delete S.pendingCreations[ma.id];
      matched++;
    }
  }
  renderMapping();
  toast(`Auto-mapped ${matched} account${matched !== 1 ? 's' : ''}`, matched ? 'ok' : '');
}

// ── Bulk Create Panel ─────────────────────────────────────────
// Bulk create: iterate all visible unmapped accounts, infer category/type,
// and add them to pendingCreations exactly as the individual inline form does.
// This keeps the UX identical — each ends up as the same amber-badged creation row.
function openBulkCreatePanel() {
  const mergedIds = new Set(S.mergeGroups.flatMap(g => g.monarchIds));
  const unmapped  = visibleMonarchAccounts().filter(a =>
    !S.mappings[a.id] && !mergedIds.has(a.id) && !S.pendingCreations[a.id]
  );
  if (!unmapped.length) { toast('No unmapped accounts', ''); return; }

  let queued = 0;
  for (const a of unmapped) {
    const { category, type: plType } = inferCategory(a);
    S.pendingCreations[a.id] = {
      monarchId:  a.id,
      name:       a.name,
      balance:    a.balance ?? 0,
      plCategory: category,
      plType,
    };
    delete S.mappings[a.id];
    queued++;
  }

  renderMapping();
  // Open every inline form simultaneously so the user can review/override each inferred category.
  // closeOthers=false so they all stay open at once.
  for (const a of unmapped) {
    showCreationForm(a.id, false);
  }
  toast(`${queued} accounts queued — review categories below, then confirm each`, 'ok');
}
