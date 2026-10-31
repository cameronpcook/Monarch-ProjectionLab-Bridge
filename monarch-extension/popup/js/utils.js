// ============================================================
// Monarch → ProjectionLab Bridge — popup/js/utils.js
// Small helpers used everywhere: messaging the background script, DOM shortcuts, formatting, toasts, dialogs.
// Popup scripts are plain (non-module) scripts loaded in order by
// popup.html and share one global scope.
// ============================================================

// ── Utilities ────────────────────────────────────────────────
// Sends a message to the service worker. Retries once if the SW was killed and needs to restart.
async function msg(type, extra = {}) {
  try {
    return await chrome.runtime.sendMessage({ type, ...extra });
  } catch (e) {
    if (e?.message?.includes('Could not establish connection')) {
      await new Promise(r => setTimeout(r, 150));
      return chrome.runtime.sendMessage({ type, ...extra });
    }
    throw e;
  }
}
function byId(id) { return document.getElementById(id); }
function syncedAgo(ts) {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs <  60)  return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}
function fmt(v) {
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD',
    minimumFractionDigits:0, maximumFractionDigits:2 }).format(v || 0);
}
function status(id, text, cls = '') {
  const el = byId(id); el.textContent = text; el.className = 'status-line ' + cls;
}
// Promise-based confirmation dialog that renders inside the extension window.
// Returns true if the user clicks OK, false if they cancel.
function showConfirm(title, body, okLabel = 'Continue') {
  return new Promise(resolve => {
    const modal  = byId('confirmModal');
    byId('confirmModalTitle').textContent = title;
    byId('confirmModalBody').textContent  = body;
    byId('confirmModalOk').textContent    = okLabel;
    modal.classList.remove('hidden');

    function finish(result) {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk()     { finish(true);  }
    function onCancel() { finish(false); }

    const okBtn     = byId('confirmModalOk');
    const cancelBtn = byId('confirmModalCancel');
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

function toast(text, cls = '') {
  const el = byId('toast');
  el.textContent = text; el.className = 'toast show ' + cls;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 2800);
}
function setLoading(id, on) {
  const el = byId(id);
  if (on) { el._orig = el.innerHTML; el.innerHTML = '<span class="spin"></span>'; el.disabled = true; }
  else    { el.innerHTML = el._orig || el.innerHTML; el.disabled = false; }
}
