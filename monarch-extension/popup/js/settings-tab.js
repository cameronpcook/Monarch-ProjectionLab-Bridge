// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/settings-tab.js
// Settings tab: display, sync reminder, login, 2FA, backup/restore, budget source.
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── SETTINGS tab ─────────────────────────────────────────────
function setupSettings() {
  const cbHidden = byId('settingShowHidden');
  cbHidden.checked = S.settings.showHidden;
  cbHidden.addEventListener('change', async () => {
    S.settings.showHidden = cbHidden.checked;
    await save();
    renderMapping();
    renderMerge();
  });

  const cbRemember = byId('settingRememberPassword');
  cbRemember.checked = S.settings.rememberPassword !== false;
  cbRemember.addEventListener('change', async () => {
    S.settings.rememberPassword = cbRemember.checked;
    await save();   // when off, this clears the saved password
    toast(cbRemember.checked ? 'Password will be remembered' : 'Saved password removed', 'ok');
  });

  const staleEl = byId('settingStaleDays');
  staleEl.value = S.settings.staleReminderDays ?? 7;
  staleEl.addEventListener('change', async () => {
    const n = Math.max(0, Math.min(365, parseInt(staleEl.value, 10) || 0));
    staleEl.value = n;
    S.settings.staleReminderDays = n;
    await save();
  });

  const cbNotes = byId('settingWriteNotes');
  cbNotes.checked = S.settings.writeNotes !== false; // default true
  cbNotes.addEventListener('change', async () => {
    S.settings.writeNotes = cbNotes.checked;
    await save();
    toast(cbNotes.checked ? 'Notes will be written on sync' : 'Notes disabled', 'ok');
  });

  // MFA settings
  const cbMfa        = byId('settingMfaEnabled');
  const mfaSecretEl  = byId('settingMfaSecret');
  const mfaSecretRow = byId('mfaSecretRow');
  const mfaRefreshBtn = byId('btnRefreshMonarchSession');

  cbMfa.checked     = S.settings.monarchMfaEnabled || false;
  mfaSecretEl.value = S.settings.monarchMfaSecret  || '';
  mfaSecretRow.classList.toggle('active', cbMfa.checked);
  mfaRefreshBtn.classList.toggle('active', cbMfa.checked);

  cbMfa.addEventListener('change', async () => {
    S.settings.monarchMfaEnabled = cbMfa.checked;
    await save();
    mfaSecretRow.classList.toggle('active', cbMfa.checked);
    mfaRefreshBtn.classList.toggle('active', cbMfa.checked);
    if (cbMfa.checked) mfaSecretEl.focus();
    toast(cbMfa.checked ? 'MFA enabled' : 'MFA disabled', 'ok');
  });

  byId('toggleMfaSecret').addEventListener('click', () => {
    mfaSecretEl.type = mfaSecretEl.type === 'password' ? 'text' : 'password';
  });

  mfaSecretEl.addEventListener('change', async () => {
    S.settings.monarchMfaSecret = mfaSecretEl.value.trim().toUpperCase();
    mfaSecretEl.value = S.settings.monarchMfaSecret;
    await save();
  });

  byId('btnRefreshMonarchSession').addEventListener('click', async () => {
    const statusEl = byId('statusMfaRefresh');
    statusEl.style.color = 'var(--txt3)';
    statusEl.textContent = 'Refreshing…';
    try {
      const r = await msg('MONARCH_REFRESH_SESSION', { password: S.monarchPassword });
      if (r?.error) throw new Error(r.error);
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = 'Session refreshed';
    } catch (e) {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = e.message || 'Refresh failed';
    }
  });

  // Budget value source settings
  const budgetModeEl    = byId('settingBudgetMode');
  const budgetLookbackEl = byId('settingBudgetLookback');
  const budgetAggEl     = byId('settingBudgetAggregation');
  const budgetActualOpts = byId('budgetActualOptions');

  const bs = S.settings.budgetSource || {};
  budgetModeEl.value     = bs.mode        || 'planned';
  const defaultSettingsLookback = (bs.mode || 'planned') === 'actual' ? 3 : 1;
  budgetLookbackEl.value = bs.lookback    || defaultSettingsLookback;
  budgetAggEl.value      = bs.aggregation || 'average';

  function syncBudgetSourceUI() {
    // Both planned and actual modes support lookback + aggregation, so always show
    budgetActualOpts.classList.remove('hidden');
  }
  syncBudgetSourceUI();

  budgetModeEl.addEventListener('change', async () => {
    const newMode = budgetModeEl.value;
    // Reset lookback to mode-appropriate default when switching modes
    const modeDefaultLookback = newMode === 'actual' ? 3 : 1;
    if (!S.settings.budgetSource?.lookback) budgetLookbackEl.value = modeDefaultLookback;
    S.settings.budgetSource = { ...(S.settings.budgetSource || {}), mode: newMode };
    syncBudgetSourceUI();
    await save();
    renderBudgetMapping(); renderBudgetMerges(); renderMerge();
    toast(newMode === 'planned' ? 'Using planned budget amounts' : 'Using actual spending amounts', 'ok');
  });

  budgetLookbackEl.addEventListener('change', async () => {
    const v = Math.max(1, Math.min(12, parseInt(budgetLookbackEl.value, 10) || 3));
    budgetLookbackEl.value = v;
    S.settings.budgetSource = { ...(S.settings.budgetSource || {}), lookback: v };
    await save();
    renderBudgetMapping(); renderBudgetMerges(); renderMerge();
  });

  budgetAggEl.addEventListener('change', async () => {
    S.settings.budgetSource = { ...(S.settings.budgetSource || {}), aggregation: budgetAggEl.value };
    await save();
    renderBudgetMapping(); renderBudgetMerges(); renderMerge();
  });

  // ── Backup & Restore ──────────────────────────────────────
  function getBackupPayload() {
    return {
      _version: 1,
      _exportedAt: new Date().toISOString(),
      mappings: S.mappings,
      pendingCreations: S.pendingCreations,
      mergeGroups: S.mergeGroups,
      budgetMappings: S.budgetMappings,
      budgetMergeGroups: S.budgetMergeGroups,
      budgetSourceOverrides: S.budgetSourceOverrides,
      budgetGroupSourceOverrides: S.budgetGroupSourceOverrides,
      // Credentials and the TOTP secret are deliberately left out of backup files
      settings: { ...S.settings, monarchMfaSecret: '' },
    };
  }

  function applyBackupPayload(data) {
    if (data.mappings !== undefined)                  S.mappings = data.mappings;
    if (data.pendingCreations !== undefined)           S.pendingCreations = data.pendingCreations;
    if (data.mergeGroups !== undefined)                S.mergeGroups = data.mergeGroups;
    if (data.budgetMappings !== undefined)             S.budgetMappings = data.budgetMappings;
    if (data.budgetMergeGroups !== undefined)          S.budgetMergeGroups = data.budgetMergeGroups;
    if (data.budgetSourceOverrides !== undefined)      S.budgetSourceOverrides = data.budgetSourceOverrides;
    if (data.budgetGroupSourceOverrides !== undefined) S.budgetGroupSourceOverrides = data.budgetGroupSourceOverrides;
    if (data.settings !== undefined) {
      S.settings = { ...S.settings, ...data.settings,
        monarchMfaSecret: data.settings.monarchMfaSecret || S.settings.monarchMfaSecret };
    }
  }

  // Export to file
  byId('btnExportBackup').addEventListener('click', () => {
    const payload = getBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monarch-bridge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup exported', 'ok');
  });

  // Import from file
  const importInput = byId('importBackupFile');
  byId('btnImportBackup').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data._version) { toast('Invalid backup file', 'err'); return; }
      applyBackupPayload(data);
      await save();
      renderAll();
      toast('Backup restored', 'ok');
    } catch (err) {
      toast('Failed to read backup file', 'err');
    }
    importInput.value = '';
  });

}
