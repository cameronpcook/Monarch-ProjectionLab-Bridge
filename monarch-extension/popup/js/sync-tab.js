// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/sync-tab.js
// Sync tab: building the preview and pushing changes to ProjectionLab.
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── SYNC tab ─────────────────────────────────────────────────
let syncPlan = [];

function setupSync() {
  byId('previewSyncBtn').addEventListener('click', buildSyncPlan);
  byId('runSyncBtn').addEventListener('click', runSync);
  byId('floatingPushBtn').addEventListener('click', runSync);

  // Mirror disabled state of runSyncBtn to floatingPushBtn
  const observer = new MutationObserver(() => {
    const disabled = byId('runSyncBtn').disabled;
    const btn = byId('floatingPushBtn');
    btn.disabled = disabled;
    // Hide the bar whenever the action button becomes disabled
    if (disabled) byId('floatingPushBar').classList.add('hidden');
  });
  observer.observe(byId('runSyncBtn'), { attributes: true, attributeFilter: ['disabled'] });

  // Show floating push bar when sync list has scrolled past the legend
  const syncPreviewEl = byId('syncPreviewList');
  const floatPushBar = byId('floatingPushBar');
  const floatPushBtn = byId('floatingPushBtn');
  syncPreviewEl.addEventListener('scroll', () => {
    const scrolled = syncPreviewEl.scrollTop > 10;
    floatPushBar.classList.toggle('hidden', !scrolled || floatPushBtn.disabled);
  }, { passive: true });
  // Also update MutationObserver to sync disabled AND hidden state
  // (handled below by updating the existing observer)
}

function buildSyncPlan() {
  // Save current mappings so Preview and Push always work from persisted state
  save().then(() => {
    const status = byId('mappingSaveStatus');
    if (status) { status.textContent = '✓ Saved'; setTimeout(() => { status.textContent = ''; }, 3500); }
  });
  syncPlan = [];
  const mergedIds = new Set(S.mergeGroups.flatMap(g => g.monarchIds));

  // 1. Pending creations — skip any that have a recorded failure (require user to retry)
  for (const [monarchId, creation] of Object.entries(S.pendingCreations)) {
    const ma = S.monarchAccounts.find(a => a.id === monarchId);
    if (!ma) continue;
    if (creation.failedAt) continue; // failed — user must retry or clear from Mapping tab
    syncPlan.push({
      type: 'create', monarchId, plCategory: creation.plCategory, plType: creation.plType,
      plLabel: `${creation.name} (new ${CATEGORY_LABELS[creation.plCategory]})`,
      monarchNames: [ma.name], writeAmount: creation.balance,
      name: creation.name, status: 'pending',
    });
  }

  // 2. Merge groups
  for (const g of S.mergeGroups) {
    if (g.pendingCreate) {
      // CREATE-MERGE: create a new PL asset and map each Monarch account to a specific field
      if (g.fieldMappings) {
        // Multi-field (e.g. House: current value + loan balance)
        const monarchNames = g.fieldMappings.map(fm => {
          const a = S.monarchAccounts.find(ac => ac.id === fm.monarchId);
          return a ? a.name : fm.monarchId;
        });
        syncPlan.push({
          type:          'create-merge-multi',
          mergeGroupId:  g.id,
          pendingCreate: g.pendingCreate,
          fieldMappings: g.fieldMappings,
          plLabel:       `${g.pendingCreate.name} (new ${CATEGORY_LABELS[g.pendingCreate.plCategory]})`,
          monarchNames,
          writeAmount:   g.fieldMappings.reduce((s, fm) => s + (fm.balance || 0), 0),
          status:        'pending',
        });
      } else {
        // Single-field create-merge (savings/investment/debt)
        const sources = S.monarchAccounts.filter(a => g.monarchIds.includes(a.id));
        const total   = sources.reduce((s, a) => s + (a.balance || 0), 0);
        syncPlan.push({
          type:          'create-merge-single',
          mergeGroupId:  g.id,
          pendingCreate: g.pendingCreate,
          monarchIds:    g.monarchIds,
          plLabel:       `${g.pendingCreate.name} (new ${CATEGORY_LABELS[g.pendingCreate.plCategory]})`,
          monarchNames:  sources.map(a => a.name),
          writeAmount:   total,
          status:        'pending',
        });
      }
    } else {
      // UPDATE existing PL account
      if (!g.plRealId) continue;

      // Existing asset with field-level mappings (multi-field merge into existing asset)
      if (g.fieldMappings && !g.plField) {
        const monarchNames = g.fieldMappings.map(fm => {
          const a = S.monarchAccounts.find(ac => ac.id === fm.monarchId);
          return a ? a.name : fm.monarchId;
        });
        const plAcct = S.plAccounts.find(p => p.id === g.plId);
        const plName = plAcct?.name || g.plRealId;
        syncPlan.push({
          type:          'merge-multi',
          mergeGroupId:  g.id,
          plRealId:      g.plRealId,
          fieldMappings: g.fieldMappings,
          plLabel:       plName,
          plCategory:    'asset',
          monarchNames,
          writeAmount:   g.fieldMappings.reduce((s, fm) => s + (fm.balance || 0), 0),
          status:        'pending',
        });
        continue;
      }

      // Single-field merge into existing account
      if (!g.plField) continue;

      const sources = S.monarchAccounts.filter(a => g.monarchIds.includes(a.id));
      const total   = sources.reduce((s, a) => s + (a.balance || 0), 0);
      const plAcct  = S.plAccounts.find(p => p.id === g.plId);
      const plLabel = plAcct ? (plAcct.subLabel ? `${plAcct.name} → ${plAcct.subLabel}` : plAcct.name) : g.plRealId;
      const mergeField = correctPlField(g.plRealId, g.plField);
      syncPlan.push({
        type: 'merge', plRealId: g.plRealId, plField: mergeField, plLabel,
        plCategory: plAcct?.category || null,
        monarchNames: sources.map(a => a.name), writeAmount: total, status: 'pending',
      });
    }
  }

  // 3. One-to-one mappings
  for (const [monarchId, mapping] of Object.entries(S.mappings)) {
    if (mergedIds.has(monarchId) || !mapping?.plId) continue;
    const ma     = S.monarchAccounts.find(a => a.id === monarchId);
    const plAcct = S.plAccounts.find(p => p.id === mapping.plId);
    if (!ma) continue;
    const plLabel = plAcct ? (plAcct.subLabel ? `${plAcct.name} → ${plAcct.subLabel}` : plAcct.name) : mapping.plRealId;
    const correctedField = correctPlField(mapping.plRealId, mapping.plField);
    syncPlan.push({
      type: 'single', plRealId: mapping.plRealId, plField: correctedField, plLabel,
      plCategory: plAcct?.category || null,
      monarchNames: [ma.name], writeAmount: ma.balance, status: 'pending',
    });
  }

  // 4a. Budget merge groups → plan expenses (summed amounts)
  for (const g of S.budgetMergeGroups) {
    if (!g.mappings?.length) continue;
    const totalMonthly = g.categoryIds.reduce((s, cid) => {
      const b = S.monarchBudgets.find(x => x.categoryId === cid);
      return s + (b ? resolveMonarchAmount(b, getGroupCategoryOverride(g, cid)) : 0);
    }, 0);
    for (const { planId, expenseId, createIfMissing, newExpenseId, newExpenseName, newFrequency, newExpType, newExpTypeParams } of g.mappings) {
      const isNewExp = expenseId === '__CREATE_NEW__';
      const exp = isNewExp ? null : S.plExpenses.find(e => e.planId === planId && e.expenseId === expenseId);
      const expDef = exp || (!isNewExp && S.plExpenses.find(e => e.expenseId === expenseId));
      const expName = isNewExp ? (newExpenseName || 'New Expense') : (expDef?.expenseName || expenseId.slice(0,8));
      if (!isNewExp && !expDef) continue;
      const { writeField, syncAmount, freqLabel, warn } = isNewExp
        ? computeBudgetSync({ frequency: newFrequency || 'monthly', expType: newExpType || 'living-expenses' }, totalMonthly)
        : computeBudgetSync(expDef, totalMonthly);
      const planName = exp?.planName || S.plExpenses.find(e => e.planId === planId)?.planName || planId.slice(0,8);
      syncPlan.push({
        type:           'budget',
        categoryId:     g.id,
        planId, expenseId,
        writeField,
        createIfMissing: createIfMissing || isNewExp,
        newExpenseId, newExpenseName, newFrequency, newExpType, newExpTypeParams,
        plLabel:        `${planName} → ${expName}${(createIfMissing || isNewExp) ? ' (new)' : ''}`,
        warnText:       warn || null,
        monarchNames:   [g.name],
        writeAmount:    syncAmount,
        displayAmount:  fmt(syncAmount) + freqLabel,
        status:         'pending',
      });
    }
  }

  // 4b. Individual budget mappings → plan expenses
  for (const [categoryId, targets] of Object.entries(S.budgetMappings)) {
    const budget = S.monarchBudgets.find(b => b.categoryId === categoryId);
    if (!budget) continue;
    for (const { planId, expenseId, createIfMissing, newExpenseId, newExpenseName, newFrequency, newExpType, newExpTypeParams } of targets) {
      const isNewExp = expenseId === '__CREATE_NEW__';
      const exp = isNewExp ? null : S.plExpenses.find(e => e.planId === planId && e.expenseId === expenseId);
      const expDef = exp || (!isNewExp && S.plExpenses.find(e => e.expenseId === expenseId));
      const expName = isNewExp ? (newExpenseName || 'New Expense') : (expDef?.expenseName || expenseId.slice(0,8));
      if (!isNewExp && !expDef) continue;
      const catOverride = getEffectiveBudgetOverride(categoryId);
      const { writeField, syncAmount, freqLabel, warn } = isNewExp
        ? computeBudgetSync({ frequency: newFrequency || 'monthly', expType: newExpType || 'living-expenses' }, resolveMonarchAmount(budget, catOverride))
        : computeBudgetSync(expDef, resolveMonarchAmount(budget, catOverride));
      const planName = exp?.planName || S.plExpenses.find(e => e.planId === planId)?.planName || planId;
      syncPlan.push({
        type:          'budget',
        categoryId,
        planId, expenseId,
        writeField,
        createIfMissing: createIfMissing || isNewExp,
        newExpenseId, newExpenseName, newFrequency, newExpType, newExpTypeParams,
        plLabel:       `${planName} → ${expName}${(createIfMissing || isNewExp) ? ' (new)' : ''}`,
        warnText:      warn || null,
        monarchNames:  [budget.categoryName],
        writeAmount:   syncAmount,
        displayAmount: fmt(syncAmount) + freqLabel,
        status:        'pending',
      });
    }
  }

  renderSync();
  byId('runSyncBtn').disabled = syncPlan.length === 0;
  if (!syncPlan.length) toast('Nothing to sync — create mappings first', 'err');
}

function renderSync() {
  const list = byId('syncPreviewList');
  if (!syncPlan.length) {
    list.innerHTML = '<div class="empty-state">Click "Refresh Preview" to load</div>';
    byId('runSyncBtn').disabled = true;
    return;
  }
  // Field label helper — 'balance' means "Loan Balance" for assets, just "Balance" for savings/investments
  function fieldLabel(plField, plCategory) {
    if (plField === 'amount')       return plCategory === 'debt' ? 'Debt Amount' : 'Current Value';
    if (plField === 'initialValue') return 'Purchase Price';
    if (plField === 'balance')      return plCategory === 'asset' ? 'Loan Balance' : 'Balance';
    return plField || '';
  }

  list.innerHTML = syncPlan.map((item, i) => {
    const statusColor = { pending:'var(--txt2)', pushing:'var(--amber)', done:'var(--green)', failed:'var(--red)' }[item.status];
    const isBudget = item.type === 'budget';
    const isCreate = item.type === 'create' || item.type === 'create-merge-single' || item.type === 'create-merge-multi';
    const typeLabel = isCreate
      ? `✦ New ${isBudget ? 'expense' : 'account'}`
      : item.type === 'merge-multi'
      ? '→ multi-field update'
      : isBudget
      ? '💰 Budget → Expense'
      : `→ ${fieldLabel(item.plField, item.plCategory)}`;
    const itemKind = isBudget ? 'budget' : 'account';
    return `
      <div class="sync-row ${item.status}" data-item-kind="${itemKind}" data-idx="${i}">
        <div class="sync-source">
          <div class="sync-source-name">${item.monarchNames.map(esc).join(' + ')}</div>
          <div class="sync-source-ids">${typeLabel}</div>
        </div>
        <div class="sync-arrow">→</div>
        <div class="sync-dest">
          <div class="sync-dest-name">${esc(item.plLabel)}${item.warnText ? ` <span class="sync-warn-icon" title="${esc(item.warnText)}" style="cursor:help;color:var(--amber);font-size:12px" aria-label="${esc(item.warnText)}">⚠</span>` : ''}</div>
          <div class="sync-dest-bal" style="color:${statusColor}">${
            item.status === 'done'    ? '✓ done' :
            item.status === 'failed'  ? '✗ ' + esc(item.error || 'error') :
            item.status === 'pushing' ? '⟳ pushing…' :
            item.type === 'budget' ? item.displayAmount :
            (item.type === 'create-merge-multi' || item.type === 'merge-multi')
              ? item.fieldMappings.map((fm, fi) => {
                  const FL = { amount:'Current Value', balance:'Loan Balance', initialValue:'Purchase Price' };
                  const acctName = item.monarchNames[fi] || '';
                  return '<span style="font-size:12px;display:block;color:var(--txt2)">'
                    + esc(acctName) + ' → ' + (FL[fm.writeField] || fm.writeField) + ': ' + fmt(fm.balance)
                    + '</span>';
                }).join('')
              : fmt(item.writeAmount)
          }</div>
        </div>
      </div>`;
  }).join('');
}

let _syncRunning = false;

async function runSync() {
  if (!S.plApiKey) { toast('No PL API key — check Setup tab', 'err'); return; }
  if (!syncPlan.length) { buildSyncPlan(); return; }
  if (_syncRunning) { toast('Sync already in progress', 'err'); return; }

  // Disable buttons synchronously before any await to prevent double-push
  _syncRunning = true;
  byId('runSyncBtn').disabled = true;
  byId('previewSyncBtn').disabled = true;

  // Step 1: batch ALL account creations into ONE export→modify→restore.
  // This prevents the snapshot-overwrite bug where multiple PL_CREATE_ACCOUNTS calls
  // each re-export PL state, causing earlier creations to be lost.
  const creations = syncPlan.filter(i => i.type === 'create');
  const createMergeItems = syncPlan.filter(i =>
    i.type === 'create-merge-single' || i.type === 'create-merge-multi'
  );
  const allCreationItems = [...creations, ...createMergeItems];

  let ok   = 0;
  let fail = 0;

  if (allCreationItems.length) {
    allCreationItems.forEach(i => { i.status = 'pushing'; });
    renderSync();

    // Build one flat array of account specs for the service worker.
    // Each entry carries a _ref back to its sync item so we can route returned IDs.
    const accountSpecs = [];

    for (const item of creations) {
      accountSpecs.push({
        _ref:         item,
        _type:        'simple',
        monarchId:    item.monarchId,
        name:         item.name,
        balance:      item.writeAmount,
        plCategory:   item.plCategory,
        plType:       item.plType,
        writeField:   item.writeField    || null,
        paymentStatus: item.paymentStatus || null,
        manualValues:  item.manualValues  || {},
        monarchNames:  S.settings.writeNotes !== false ? item.monarchNames : [],
      });
    }

    for (const item of createMergeItems) {
      const pc = item.pendingCreate;
      if (item.type === 'create-merge-multi') {
        const firstFm = item.fieldMappings[0];
        const mergeMonarchNames = item.fieldMappings.map(fm => {
          const ma = S.monarchAccounts.find(a => a.id === fm.monarchId);
          return ma ? ma.name : fm.monarchId;
        });
        accountSpecs.push({
          _ref:         item,
          _type:        'merge-multi',
          _fieldMappings: item.fieldMappings,
          monarchId:    firstFm.monarchId,
          name:         pc.name,
          balance:      firstFm.balance,
          plCategory:   pc.plCategory,
          plType:       pc.plType,
          writeField:   firstFm.writeField,
          paymentStatus: pc.paymentStatus || 'financed',
          manualValues:  pc.manualValues  || {},
          monarchNames:  mergeMonarchNames,
        });
      } else {
        // create-merge-single
        const sources = S.monarchAccounts.filter(a => item.monarchIds.includes(a.id));
        const total   = sources.reduce((s, a) => s + (a.balance || 0), 0);
        const writeField = (pc.plCategory === 'debt') ? 'amount' : 'balance';
        accountSpecs.push({
          _ref:         item,
          _type:        'merge-single',
          monarchId:    item.monarchIds[0],
          name:         pc.name,
          balance:      total,
          plCategory:   pc.plCategory,
          plType:       pc.plType,
          writeField,
          monarchNames:  sources.map(a => a.name),
        });
      }
    }

    // Strip internal _ref/_type/_fieldMappings before sending to service worker
    const accountsPayload = accountSpecs.map(({ _ref, _type, _fieldMappings, ...rest }) => rest);

    try {
      const res = await msg('PL_CREATE_ACCOUNTS', { key: S.plApiKey, accounts: accountsPayload });
      if (res?.error) throw new Error(res.error);

      // Route returned IDs back to their sync items and update state
      const followUpUpdates = []; // merge-multi additional field updates (safe, atomic)

      for (const created of (res.created || [])) {
        const spec = accountSpecs.find(s => s.monarchId === created.monarchId);
        if (!spec) continue;
        const item = spec._ref;

        if (spec._type === 'simple') {
          let plId = created.plId;
          const pending = S.pendingCreations[created.monarchId];
          if (created.plCategory === 'asset' && pending?.writeField && pending.writeField !== 'amount') {
            plId = created.plId + '__' + pending.writeField;
          }
          const { realId, field } = resolvePlMapping(plId);
          S.mappings[created.monarchId] = { plId, plRealId: realId, plField: field };
          delete S.pendingCreations[created.monarchId];
          item.status = 'done'; ok++;

        } else if (spec._type === 'merge-single') {
          const newId = created.plId;
          const wf = spec.writeField;
          for (const mid of item.monarchIds) {
            S.mappings[mid] = { plId: newId, plRealId: newId, plField: wf };
          }
          const gIdx = S.mergeGroups.findIndex(g => g.id === item.mergeGroupId);
          if (gIdx > -1) {
            S.mergeGroups[gIdx] = { ...S.mergeGroups[gIdx], plId: newId, plRealId: newId,
                                     plField: wf, pendingCreate: null };
          }
          item.status = 'done'; ok++;

        } else if (spec._type === 'merge-multi') {
          const newId = created.plId;
          const fieldMappings = spec._fieldMappings;

          // Map each Monarch account to its synthetic field ID
          for (const fm of fieldMappings) {
            const plId = fm.writeField === 'amount' ? newId : `${newId}__${fm.writeField}`;
            const { realId, field } = resolvePlMapping(plId);
            S.mappings[fm.monarchId] = { plId, plRealId: realId, plField: field };
          }

          // Queue follow-up updateAccount calls for additional fields (safe — atomic, no export/restore)
          for (const fm of fieldMappings.slice(1)) {
            followUpUpdates.push({ plId: newId, writeField: fm.writeField, balance: fm.balance });
          }

          const gIdx = S.mergeGroups.findIndex(g => g.id === item.mergeGroupId);
          if (gIdx > -1) {
            S.mergeGroups[gIdx] = {
              ...S.mergeGroups[gIdx],
              plId: newId, plRealId: newId,
              pendingCreate: null,
              monarchIds: [],
              fieldMappings: S.mergeGroups[gIdx].fieldMappings,
            };
          }
          item.status = 'done'; ok++;
        }
      }

      // Execute follow-up field updates for merge-multi accounts
      for (const upd of followUpUpdates) {
        await msg('PL_UPDATE_ACCOUNT', {
          plAccountId: upd.plId,
          data: { [upd.writeField]: upd.balance },
          key: S.plApiKey,
        });
      }

    } catch (e) {
      // On failure, mark all creation items failed and flag pendingCreations
      for (const item of creations) {
        item.status = 'failed'; item.error = e.message;
        if (S.pendingCreations[item.monarchId]) {
          S.pendingCreations[item.monarchId].failedAt = Date.now();
          S.pendingCreations[item.monarchId].errorMsg = e.message;
        }
      }
      for (const item of createMergeItems) {
        item.status = 'failed'; item.error = e.message;
      }
      fail += allCreationItems.length;
    }

    await save();
    renderSync();
  }

  // Step 2: updates
  // (ok/fail were already declared and seeded above)

  for (let i = 0; i < syncPlan.length; i++) {
    if (['create','create-merge-single','create-merge-multi','merge-multi','budget'].includes(syncPlan[i].type)) continue;
    syncPlan[i].status = 'pushing';
    renderSync();
    try {
      const res = await msg('PL_UPDATE_ACCOUNT', {
        plAccountId: syncPlan[i].plRealId,
        data: { [syncPlan[i].plField]: syncPlan[i].writeAmount },
        key: S.plApiKey,
      });
      if (res?.error) throw new Error(res.error);
      syncPlan[i].status = 'done'; ok++;
    } catch (e) {
      syncPlan[i].status = 'failed'; syncPlan[i].error = e.message; fail++;
    }
    renderSync();
  }

  // Step 2b: merge-multi — update each field of an existing asset
  for (const item of syncPlan.filter(i => i.type === 'merge-multi')) {
    item.status = 'pushing'; renderSync();
    try {
      for (const fm of item.fieldMappings) {
        // Get fresh balance from current Monarch accounts
        const ma = S.monarchAccounts.find(a => a.id === fm.monarchId);
        const bal = ma?.balance ?? fm.balance ?? 0;
        // Collected below — written in PL_SYNC_ALL
        item._fieldUpdates = item._fieldUpdates || [];
        item._fieldUpdates.push({ plAccountId: item.plRealId, data: { [fm.writeField]: bal } });
      }
      item.status = 'done'; ok++;
    } catch (e) {
      item.status = 'failed'; item.error = e.message; fail++;
    }
    renderSync();
  }

  // Step 2b: budget — warn about one-time expenses
  const budgetItems = syncPlan.filter(i => i.type === 'budget');
  if (budgetItems.length) {
    const onceItems = budgetItems.filter(i => i.warnText);
    if (onceItems.length) {
      const names = onceItems.map(i => i.plLabel).join('\n• ');
      const confirmed = await showConfirm(
        `⚠ One-time expense${onceItems.length > 1 ? 's' : ''} mapped`,
        `${onceItems.length} mapping${onceItems.length > 1 ? 's target' : ' targets'} a one-time expense:\n\n• ${names}\n\nThe Monarch monthly amount will be written as the total cost of the event, which is likely not what you want.`,
        'Continue anyway'
      );
      if (!confirmed) {
        onceItems.forEach(i => { i.status = 'pending'; });
        const safeBudgetItems = budgetItems.filter(i => !i.warnText);
        if (!safeBudgetItems.length) {
          byId('runSyncBtn').disabled = false;
          byId('previewSyncBtn').disabled = false;
          _syncRunning = false;
          renderSync();
          toast('One-time expense sync cancelled — map these manually in PL', 'err');
          return;
        }
        budgetItems.length = 0;
        safeBudgetItems.forEach(i => budgetItems.push(i));
      }
    }
  }

  // Steps 2+2b+3 combined: one PL_SYNC_ALL call — one export, at most two restores.
  // Collect: account field updates, merge-multi field updates, notes, and expense updates.
  const allAccountUpdates = [];

  // Single-field account updates (type: 'single', 'merge')
  for (const item of syncPlan) {
    if (!['single', 'merge'].includes(item.type)) continue;
    if (item.status !== 'done') continue; // already failed in step 1
    allAccountUpdates.push({ plAccountId: item.plRealId, data: { [item.plField]: item.writeAmount } });
  }

  // Merge-multi field updates collected above
  for (const item of syncPlan.filter(i => i.type === 'merge-multi')) {
    if (item.status !== 'done') continue;
    for (const upd of (item._fieldUpdates || [])) allAccountUpdates.push(upd);
  }

  // Notes map
  const notesMap = {};
  if (S.settings.writeNotes !== false) {
    for (const item of syncPlan) {
      if (item.status === 'done' && item.monarchNames?.length && item.plRealId) {
        notesMap[item.plRealId] = item.monarchNames.join(' + ');
      }
    }
  }

  // Expense updates
  const allExpenseUpdates = budgetItems.map(i => ({
    planId:           i.planId,
    expenseId:        i.expenseId,
    amount:           i.writeAmount,
    writeField:       i.writeField || 'amount',
    createIfMissing:  i.createIfMissing || false,
    newExpenseId:     i.newExpenseId,
    newExpenseName:   i.newExpenseName,
    newFrequency:     i.newFrequency,
    newExpType:       i.newExpType || 'living-expenses',
    newExpTypeParams: i.newExpTypeParams || {},
    monarchNames:     S.settings.writeNotes !== false ? (i.monarchNames || []) : [],
  }));

  const needsSyncAll = allAccountUpdates.length || Object.keys(notesMap).length || allExpenseUpdates.length;

  if (needsSyncAll) {
    // Mark all singles/merges/merge-multis as pushing for UI
    for (const item of syncPlan) {
      if (['single','merge','merge-multi'].includes(item.type) && item.status === 'done') {
        item.status = 'pushing';
      }
    }
    budgetItems.forEach(i => { i.status = 'pushing'; });
    renderSync();

    try {
      const res = await msg('PL_SYNC_ALL', {
        key: S.plApiKey,
        accountUpdates: allAccountUpdates,
        notesMap: Object.keys(notesMap).length ? notesMap : null,
        expenseUpdates: allExpenseUpdates.length ? allExpenseUpdates : null,
      });
      if (res?.error) throw new Error(res.error);
      S.lastSyncAt = Date.now();   // save() below persists it; the badge updates from storage

      // Mark all as done
      for (const item of syncPlan) {
        if (['single','merge','merge-multi'].includes(item.type) && item.status === 'pushing') {
          item.status = 'done'; ok++;
        }
      }

      // Budget promotion
      const syncedAt = Date.now();
      for (const item of budgetItems) {
        if (item.status !== 'pushing') continue;
        item.status = 'done'; ok++;

        if (item.expenseId === '__CREATE_NEW__' && item.newExpenseId) {
          const realExpenseId = item.newExpenseId;
          const newKey = item.planId + '::' + realExpenseId;
          if (!S.plExpenses.some(e => e.key === newKey)) {
            S.plExpenses.push({
              planId: item.planId,
              planName: S.plExpenses.find(e => e.planId === item.planId)?.planName || item.planId,
              expenseId: realExpenseId, expenseName: item.newExpenseName || 'New Expense',
              amount: item.writeAmount, frequency: item.newFrequency || 'monthly', key: newKey,
            });
          }
          for (const targets of Object.values(S.budgetMappings)) {
            for (const t of targets) {
              if (t.expenseId === '__CREATE_NEW__' && t.newExpenseId === realExpenseId && t.planId === item.planId) {
                t.expenseId = realExpenseId; t.createIfMissing = false;
                delete t.newExpenseId; delete t.newExpenseName; delete t.newFrequency;
              }
            }
          }
          for (const g of S.budgetMergeGroups) {
            for (const t of g.mappings || []) {
              if (t.expenseId === '__CREATE_NEW__' && t.newExpenseId === realExpenseId && t.planId === item.planId) {
                t.expenseId = realExpenseId; t.createIfMissing = false;
                delete t.newExpenseId; delete t.newExpenseName; delete t.newFrequency;
              }
            }
          }
        } else if (item.createIfMissing) {
          for (const targets of Object.values(S.budgetMappings)) {
            for (const t of targets) {
              if (t.planId === item.planId && t.expenseId === item.expenseId) t.createIfMissing = false;
            }
          }
          for (const g of S.budgetMergeGroups) {
            for (const t of g.mappings || []) {
              if (t.planId === item.planId && t.expenseId === item.expenseId) t.createIfMissing = false;
            }
          }
        }

        // Stamp lastSynced
        const realExpenseId = item.expenseId === '__CREATE_NEW__' ? item.newExpenseId : item.expenseId;
        for (const targets of Object.values(S.budgetMappings)) {
          for (const t of targets) {
            if (t.planId === item.planId && (t.expenseId === realExpenseId || t.expenseId === item.expenseId)) t.lastSynced = syncedAt;
          }
        }
        for (const g of S.budgetMergeGroups) {
          for (const t of g.mappings || []) {
            if (t.planId === item.planId && (t.expenseId === realExpenseId || t.expenseId === item.expenseId)) t.lastSynced = syncedAt;
          }
        }
      }

      // Use the exported data from PL_SYNC_ALL to update local PL state (no extra round trip)
      if (res.exported) {
        S.plAccounts = extractPLAccounts(res.exported);
        S.plExpenses = extractPLExpenses(res.exported);
      }

    } catch (e) {
      for (const item of syncPlan) {
        if (['single','merge','merge-multi'].includes(item.type) && item.status === 'pushing') {
          item.status = 'failed'; item.error = e.message; fail++;
        }
      }
      budgetItems.filter(i => i.status === 'pushing').forEach(i => { i.status = 'failed'; i.error = e.message; fail++; });
    }

    await save();
    renderSync();
  }

  const hadCreations = creations.length > 0 || createMergeItems.length > 0;
  const anyCreationDone = [...creations, ...createMergeItems].some(i => i.status === 'done');

  if (hadCreations && anyCreationDone) {
    // Lock Push button — must Refresh Preview before pushing again to avoid re-creating accounts.
    syncPlan = [];
    renderSync();
    byId('runSyncBtn').disabled = true;
    byId('previewSyncBtn').disabled = false;
    _syncRunning = false;
    const failMsg = fail ? ` — ${fail} creation${fail>1?'s':''} failed, check Mapping tab to retry` : '';
    toast(`Sync: ${ok} done${failMsg} — Refresh Preview to sync again`, fail ? 'err' : 'ok');
  } else {
    byId('runSyncBtn').disabled = false;
    byId('previewSyncBtn').disabled = false;
    _syncRunning = false;
    const budgetDone = budgetItems.filter(i => i.status === 'done').length;
    const budgetNote = budgetDone ? ` (${budgetDone} budget expense${budgetDone > 1 ? 's' : ''} updated)` : '';
    toast(`Sync: ${ok} done${budgetNote}${fail ? ', ' + fail + ' failed' : ''}`, fail ? 'err' : 'ok');
  }
}
