import { triggerHaptic, showToast, escapeHtml } from './utils.js';
import {
  ROSTER_TEMPLATE, validateRosterData, saveRoster, resetToDefault, getMeta, getRoster, getStart,
  recomputeToday, findHandoverName,
} from './roster.js';
import {
  setToken, getToken, getLastSync, persistCurrentRoster, fetchMonthRoster, loadHistory,
} from './storage.js';
import {
  listStoreRosters, fetchStoreRoster, loadRosterFromStore, uploadCurrentRoster,
  deleteStoreRoster, coversDate, checkAndCacheRosters, getLocalRosterCache,
  loadRosterCachedOrStore, removeLocalRoster,
} from './rosters.js';
import { renderSwapModal, clearSwaps, swapCount, getSwaps, setSwaps, applySwapsToDays } from './swaps.js';
import { openAlertModal, saveAlertSettings, sendTestNotification, scheduleDutyAlerts } from './alerts.js';
import { printRoster, PRINT_STYLES } from './print.js';
import { renderScrollView, renderMonthView, setRealTodayIndex, setCurrentIndex, getRealTodayIndex, notesDB, closeNoteModal as closeNoteModalFromRendering, mrinalDutyAt, replaceNotes } from './rendering.js';

export function openSettingsModal() {
  triggerHaptic(20);
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  buildSettingsContent();
  modal.classList.add('show');
}

export function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('show');
}

/* ---- PRINT STYLE CHOOSER ---- */
export function openPrintModal() {
  triggerHaptic(20);
  const modal = document.getElementById('print-modal');
  if (!modal) return;
  const body = document.getElementById('print-style-body');
  if (body) {
    body.innerHTML = `
      <div class="print-style-hint">Choose a layout for the ${escapeHtml(getMeta().month)} print — each renders as crisp A4 landscape pages.</div>
      <div class="settings-list">
        ${PRINT_STYLES.map((s) => `
          <div class="settings-item" data-style="${s.id}">
            <div class="settings-item-icon">${s.icon}</div>
            <div style="flex:1;">
              <div class="settings-item-label">${s.label}</div>
            </div>
            <span style="color:var(--text-muted);">›</span>
          </div>`).join('')}
      </div>`;
    body.querySelectorAll('.settings-item[data-style]').forEach((item) => {
      item.addEventListener('click', () => {
        closePrintModal();
        printRoster(getRealTodayIndex(), item.dataset.style);
      });
    });
  }
  modal.classList.add('show');
}

export function closePrintModal() {
  const m = document.getElementById('print-modal');
  if (m) m.classList.remove('show');
}

function buildSettingsContent() {
  const body = document.getElementById('settings-body');
  if (!body) return;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const swaps = swapCount();
  const lastSync = getLastSync();
  const meta = getMeta();
  const tokenConfigured = !!getToken();

  body.innerHTML = `
    <div class="settings-list">

      <div class="settings-section-title">Appearance</div>
      <div class="settings-item" data-action="theme">
        <div class="settings-item-icon">${dark ? '☀️' : '🌙'}</div>
        <div style="flex:1;">
          <div class="settings-item-label">Dark Mode</div>
          <div class="settings-item-sub">Toggle light / dark theme</div>
        </div>
        <label class="switch" onclick="event.stopPropagation();">
          <input type="checkbox" id="settings-theme-toggle" ${dark ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>

      <div class="settings-section-title">Roster</div>
      <div class="settings-item" data-action="sync-rosters">
        <div class="settings-item-icon">🔃</div>
        <div style="flex:1;">
          <div class="settings-item-label">Update Rosters</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="settings-item" data-action="generate">
        <div class="settings-item-icon">✨</div>
        <div style="flex:1;">
          <div class="settings-item-label">Generate Roster</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="settings-item" data-action="print">
        <div class="settings-item-icon">🖨️</div>
        <div style="flex:1;">
          <div class="settings-item-label">Print Roster</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="settings-item" data-action="swap">
        <div class="settings-item-icon">⇄</div>
        <div style="flex:1;">
          <div class="settings-item-label">Swap / Reassign Duty</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      ${swaps ? `<div class="settings-item" data-action="swap-clear">
        <div class="settings-item-icon">🧹</div>
        <div style="flex:1;">
          <div class="settings-item-label">Clear All Swaps</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>` : ''}

      <div class="settings-section-title">Notifications</div>
      <div class="settings-item" data-action="alerts">
        <div class="settings-item-icon">🔔</div>
        <div style="flex:1;">
          <div class="settings-item-label">Duty Alerts</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>

      <div class="settings-section-title">Backup</div>
      <div class="settings-item" data-action="backup">
        <div class="settings-item-icon">💾</div>
        <div style="flex:1;">
          <div class="settings-item-label">Backup / Restore</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
    </div>
  `;

  body.querySelectorAll('.settings-item[data-action]').forEach(item => {
    item.addEventListener('click', (e) => {
      const action = item.dataset.action;
      if (action === 'theme') return; // handled by switch
      closeSettingsModal();
      if (action === 'generate') openRosterModal();
      else if (action === 'print') { openPrintModal(); }
      else if (action === 'swap') { openSwapModal(); }
      else if (action === 'swap-clear') { clearSwaps(); showToast('All swaps reverted'); dispatchEvent(new CustomEvent('roster-changed')); }
      else if (action === 'alerts') openAlertModal();
      else if (action === 'sync-rosters') openRosterSyncModal();
      else if (action === 'backup') openBackupModal();
    });
  });

  const themeToggle = document.getElementById('settings-theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('change', () => {
      toggleTheme();
    });
  }
}

export function toggleTheme() {
  triggerHaptic(20);
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  localStorage.setItem('mrinalTheme', dark ? 'light' : 'dark');
  updateThemeIcon();
}

export function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerText = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
}

export function initTheme() {
  const saved = localStorage.getItem('mrinalTheme');
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  updateThemeIcon();
}

/* ---- SWAP MODAL ---- */
export function openSwapModal() {
  triggerHaptic(20);
  const modal = document.getElementById('swap-modal');
  if (!modal) return;
  const container = document.getElementById('swap-body');
  renderSwapModal(container);
  modal.classList.add('show');
}

export function closeSwapModal() {
  document.getElementById('swap-modal').classList.remove('show');
}

/* ---- CLOUD MODAL (GitHub roster store) ---- */
export function openCloudModal() {
  triggerHaptic(20);
  const modal = document.getElementById('cloud-modal');
  if (!modal) return;
  const body = document.getElementById('cloud-body');
  const token = getToken();

  body.innerHTML = `
    <div class="github-row">
      <div class="setting-label">GitHub Personal Access Token</div>
      <div class="setting-sub">Create one at github.com/settings/tokens with <b>repo</b> scope (Contents R/W). Stored only on this device.</div>
      <input type="password" class="github-token-input" id="cloud-token" value="${escapeHtml(token)}" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
    </div>
    <div class="modal-actions" style="flex-wrap:wrap;">
      <button class="modal-btn btn-save" id="cloud-save-btn">Save Token</button>
      <button class="modal-btn" id="cloud-upload-btn" style="flex:1;">⬆️ Upload Current Roster</button>
      <button class="modal-btn btn-cancel" id="cloud-refresh-btn">Refresh</button>
    </div>
    <div class="github-status" id="cloud-status"></div>
    <div class="setting-sub" style="margin:10px 0 6px;font-weight:600;color:var(--text);">Stored rosters on GitHub</div>
    <div class="swap-days-list" id="cloud-roster-list" style="max-height:240px;overflow:auto;">Loading…</div>
  `;

  body.querySelector('#cloud-save-btn').addEventListener('click', () => {
    const val = body.querySelector('#cloud-token').value;
    setToken(val);
    showToast(val ? 'Token saved' : 'Token cleared');
  });

  body.querySelector('#cloud-upload-btn').addEventListener('click', async () => {
    const btn = body.querySelector('#cloud-upload-btn');
    const status = body.querySelector('#cloud-status');
    const val = body.querySelector('#cloud-token').value.trim();
    if (val) setToken(val);
    btn.disabled = true;
    status.textContent = 'Uploading current roster…';
    status.className = 'github-status';
    try {
      const { fileName, result } = await uploadCurrentRoster();
      status.className = 'github-status ok';
      status.textContent = `✓ ${fileName} ${result === 'updated' ? 'updated' : 'created'} on GitHub`;
      showToast('Roster uploaded to GitHub ☁️');
      renderRosterStoreList(body);
    } catch (e) {
      status.className = 'github-status error';
      status.textContent = '✗ ' + (e.message || 'Upload failed');
    } finally {
      btn.disabled = false;
    }
  });

  body.querySelector('#cloud-refresh-btn').addEventListener('click', () => renderRosterStoreList(body));

  renderRosterStoreList(body);
  modal.classList.add('show');
}

async function renderRosterStoreList(body) {
  const list = body.querySelector('#cloud-roster-list');
  if (!list) return;
  list.innerHTML = 'Loading…';
  const files = await listStoreRosters(true);
  if (!files.length) { list.innerHTML = '<div class="swap-preview empty">No rosters stored yet — upload the current month to start.</div>'; return; }

  /* Resolve each file's meta + today badge in parallel; tolerate failures. */
  const rows = await Promise.all(files.map(async (f) => {
    let meta = null, invalid = false;
    try {
      const data = await fetchStoreRoster(f.name);
      meta = { month: data.month, startDate: data.startDate, days: data.days };
    } catch (e) { invalid = true; }
    return { f, meta, invalid };
  }));

  list.innerHTML = rows.map(({ f, meta, invalid }) => {
    const label = meta ? escapeHtml(meta.month) : '<span style="opacity:.6">(unreadable)</span>';
    const today = meta && coversDate(meta) ? ' <span class="store-badge today">Today</span>' : '';
    const loaded = meta && getMeta().month === meta.month ? ' <span class="store-badge loaded">Loaded</span>' : '';
    const date = meta ? `<span class="sr-foot" style="opacity:.7;font-size:11px;">${escapeHtml(meta.startDate)}</span>` : '';
    return `<div class="store-file-row" data-name="${escapeHtml(f.name)}">
      <div style="flex:1;min-width:0;">
        <div class="sr-head">
          <span class="sr-date">☁️ ${escapeHtml(f.name)}</span>${today}${loaded}
        </div>
        <div class="sr-foot">${label} &nbsp; ${date}</div>
      </div>
      <div class="store-row-actions">
        <button class="modal-btn store-load-btn" data-action="load">Load</button>
        <button class="modal-btn btn-cancel store-del-btn" data-action="del" title="Delete from GitHub">🗑</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.store-load-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const name = btn.closest('.store-file-row').dataset.name;
    const status = body.querySelector('#cloud-status');
    status.className = 'github-status';
    status.textContent = `Loading ${name}…`;
    try {
      const { meta } = await loadRosterFromStore(name);
      if (window.__recomputeAndRender) window.__recomputeAndRender();
      status.className = 'github-status ok';
      status.textContent = `✓ Loaded ${meta.month}`;
      showToast(`Loaded ${meta.month} from GitHub`);
      renderRosterStoreList(body);
    } catch (e) {
      status.className = 'github-status error';
      status.textContent = '✗ ' + (e.message || 'Load failed');
    }
  }));

  list.querySelectorAll('.store-del-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const name = btn.closest('.store-file-row').dataset.name;
    const status = body.querySelector('#cloud-status');
    if (!confirm(`Delete ${name} from GitHub?`)) return;
    status.className = 'github-status';
    status.textContent = `Deleting ${name}…`;
    btn.disabled = true;
    try {
      await deleteStoreRoster(name);
      status.className = 'github-status ok';
      status.textContent = `✓ Deleted ${name}`;
      showToast(`Deleted ${name}`);
      renderRosterStoreList(body);
    } catch (e) {
      status.className = 'github-status error';
      status.textContent = '✗ ' + (e.message || 'Delete failed');
      btn.disabled = false;
    }
  }));
}

export function closeCloudModal() {
  document.getElementById('cloud-modal').classList.remove('show');
}

/* ---- ROSTER SYNC MODAL (check + download new rosters locally) ---- */
export function openRosterSyncModal() {
  triggerHaptic(20);
  const modal = document.getElementById('roster-sync-modal');
  if (!modal) return;
  const body = document.getElementById('roster-sync-body');
  body.innerHTML = `
    <div class="setting-sub">Scans <b>reewaaz/roster → /rosters</b> on GitHub and saves every month file on this device — new months stay readable offline and the calendar ⇄ arrows keep working without a connection.</div>
    <div class="modal-actions">
      <button class="modal-btn btn-save" id="roster-sync-run">🔍 Check &amp; Download</button>
    </div>
    <div class="github-status" id="roster-sync-status"></div>
    <div class="setting-sub" style="margin:12px 0 6px;font-weight:600;color:var(--text);">Saved on this device</div>
    <div class="swap-days-list" id="roster-sync-list" style="max-height:240px;overflow:auto;">${renderLocalCacheList()}</div>
  `;
  body.querySelector('#roster-sync-run').addEventListener('click', runRosterSync);
  bindLocalCacheButtons();
  modal.classList.add('show');
}

export function closeRosterSyncModal() {
  const m = document.getElementById('roster-sync-modal');
  if (m) m.classList.remove('show');
}

function renderLocalCacheList() {
  const cache = getLocalRosterCache();
  const names = Object.keys(cache.files).sort();
  if (!names.length) return '<div class="swap-preview empty">Nothing saved locally yet — tap “Check &amp; Download” to fetch the months from GitHub.</div>';
  return names.map((name) => {
    const c = cache.files[name] || {};
    const loaded = getMeta().month === c.month ? ' <span class="store-badge loaded">Loaded</span>' : '';
    const when = c.fetchedAt ? new Date(c.fetchedAt).toLocaleDateString() : '—';
    return `<div class="store-file-row" data-name="${escapeHtml(name)}">
      <div style="flex:1;min-width:0;">
        <div class="sr-head"><span class="sr-date">💾 ${escapeHtml(name)}</span>${loaded}</div>
        <div class="sr-foot">${escapeHtml(c.month || '?')} · saved ${escapeHtml(when)}</div>
      </div>
      <div class="store-row-actions">
        <button class="modal-btn store-load-btn" data-action="load-local">Load</button>
        <button class="modal-btn btn-cancel store-del-btn" data-action="del-local" title="Remove local copy">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function runRosterSync() {
  const btn = document.getElementById('roster-sync-run');
  const status = document.getElementById('roster-sync-status');
  if (!btn || !status) return;
  btn.disabled = true;
  status.className = 'github-status';
  status.textContent = 'Scanning GitHub for rosters…';
  try {
    const s = await checkAndCacheRosters();
    const parts = [];
    if (s.newFiles.length) parts.push(`${s.newFiles.length} new (${s.newFiles.join(', ')})`);
    if (s.updated.length) parts.push(`${s.updated.length} updated`);
    if (s.invalid.length) parts.push(`⚠ ${s.invalid.length} invalid (${s.invalid.join(', ')})`);
    if (s.adopted) parts.push(`loaded ${s.adopted}`);
    const msg = parts.length ? parts.join(' · ') : 'nothing new on GitHub';
    status.className = 'github-status ok';
    status.textContent = `✓ Checked ${s.total} file${s.total === 1 ? '' : 's'} — ${msg}`;
    if (s.adopted) showToast(`Updated ${s.adopted} from GitHub`);
    refreshLocalCacheList();
  } catch (e) {
    status.className = 'github-status error';
    status.textContent = '✗ ' + (e.message || 'Sync failed — are you online?');
  } finally {
    btn.disabled = false;
  }
}

function refreshLocalCacheList() {
  const list = document.getElementById('roster-sync-list');
  if (!list) return;
  list.innerHTML = renderLocalCacheList();
  bindLocalCacheButtons();
}

function bindLocalCacheButtons() {
  const list = document.getElementById('roster-sync-list');
  if (!list) return;
  list.querySelectorAll('.store-load-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const name = btn.closest('.store-file-row').dataset.name;
    const status = document.getElementById('roster-sync-status');
    status.className = 'github-status';
    status.textContent = `Loading ${name}…`;
    try {
      const { meta } = await loadRosterCachedOrStore(name);
      if (window.__recomputeAndRender) window.__recomputeAndRender();
      status.className = 'github-status ok';
      status.textContent = `✓ Loaded ${meta.month} (local copy)`;
      showToast(`Loaded ${meta.month}`);
      refreshLocalCacheList();
    } catch (e) {
      status.className = 'github-status error';
      status.textContent = '✗ ' + (e.message || 'Load failed');
    }
  }));
  list.querySelectorAll('.store-del-btn').forEach((btn) => btn.addEventListener('click', () => {
    const name = btn.closest('.store-file-row').dataset.name;
    if (!confirm(`Remove the local copy of ${name}? (the GitHub original stays)`)) return;
    removeLocalRoster(name);
    refreshLocalCacheList();
  }));
}

/* ---- BACKUP / RESTORE MODAL ---- */
const BACKUP_APP_TAG = 'mrinal-duty-roster';
const BACKUP_VERSION = 1;

/* Bundle the whole app state (roster + notes + swaps/duty changes) into one object. */
export function buildBackup() {
  return {
    app: BACKUP_APP_TAG,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    roster: { month: getMeta().month, startDate: getMeta().startDate, days: getRoster() },
    notes: { ...notesDB },
    swaps: getSwaps(),
  };
}

export function exportBackup() {
  triggerHaptic(40);
  const data = buildBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mrinal-roster-backup-${data.roster.startDate}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  showToast('Backup exported ✓');
}

/* Restore a backup object or JSON string; returns the restored month. */
export async function restoreBackup(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.app !== BACKUP_APP_TAG) throw new Error('Not a Mrinal roster backup file');
  if (!data.roster || !data.roster.month || !data.roster.startDate || !Array.isArray(data.roster.days)) throw new Error('Backup has no roster');
  const validation = validateRosterData({ month: data.roster.month, startDate: data.roster.startDate, days: data.roster.days });
  if (validation) throw new Error(`Backup roster invalid: ${validation}`);
  saveRoster({ month: data.roster.month, startDate: data.roster.startDate }, data.roster.days);
  setSwaps((data.swaps && typeof data.swaps === 'object') ? data.swaps : {});
  applySwapsToDays();
  replaceNotes((data.notes && typeof data.notes === 'object') ? data.notes : {});
  if (window.__recomputeAndRender) window.__recomputeAndRender();
  return { month: data.roster.month };
}

export function openBackupModal() {
  triggerHaptic(20);
  const modal = document.getElementById('backup-modal');
  if (!modal) return;
  const body = document.getElementById('backup-body');
  body.innerHTML = `
    <div class="setting-sub">One JSON file holds the active roster plus every day-note, duty swap &amp; reassign. Export it, and Import restores everything in one step.</div>
    <div class="modal-actions" style="flex-wrap:wrap;">
      <button class="modal-btn btn-save" id="backup-export-btn">⬇️ Export backup (.json)</button>
      <button class="modal-btn" id="backup-import-btn">⬆️ Import backup</button>
    </div>
    <input type="file" id="backup-file" accept="application/json,.json" style="display:none;">
    <div class="github-status" id="backup-status"></div>
  `;
  body.querySelector('#backup-export-btn').addEventListener('click', exportBackup);
  body.querySelector('#backup-import-btn').addEventListener('click', () => body.querySelector('#backup-file').click());
  body.querySelector('#backup-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = body.querySelector('#backup-status');
    status.className = 'github-status';
    status.textContent = `Reading ${file.name}…`;
    try {
      const { month } = await restoreBackup(await file.text());
      status.className = 'github-status ok';
      status.textContent = `✓ Restored ${month} — notes & swaps are back`;
      showToast('Backup restored ✓');
      closeAllModals();
    } catch (err) {
      status.className = 'github-status error';
      status.textContent = '✗ ' + (err.message || 'Import failed');
    }
  });
  modal.classList.add('show');
}

export function closeBackupModal() {
  const m = document.getElementById('backup-modal');
  if (m) m.classList.remove('show');
}

/* ---- SEARCH ---- */
const SEARCH_FIELDS = [
  { key: 'title', label: 'Posting' },
  { key: 'ward', label: 'Ward/ER' },
  { key: 'nicu', label: 'NICU' },
  { key: 'picu', label: 'PICU' },
  { key: 'er', label: 'ER Day' },
  { key: 'second', label: '2nd Call' },
  { key: 'opd', label: 'OPD' },
  { key: 'nagarHospital', label: 'Nagar Hospital' },
  { key: 'day', label: 'Day' },
];

function highlight(text, q) {
  const esc = escapeHtml(text == null ? '' : String(text));
  if (!q) return esc;
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return esc.replace(re, '<mark>$1</mark>');
}

/* Empty search state — nothing to show until the user types. */
const searchEmptyState = '';

/* Search every placement and every person: the query must match at least one field
   value, then every matching field is highlighted in the day chip below. */
function runSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!input || !results) return;
  const q = (input.value || '').trim().toLowerCase();
  if (!q) {
    results.innerHTML = searchEmptyState;
    return;
  }
  const meta = getMeta();
  const monthsName = meta.month.split(' ')[0];
  const roster = getRoster();
  const matches = [];
  roster.forEach((d) => {
    /* Hay = every placement value plus each duty/field name, so the query can hit
       any person OR any posting / ward / day label too. */
    const hay = SEARCH_FIELDS
      .filter((f) => d[f.key] && String(d[f.key]).trim() && d[f.key] !== '—')
      .map((f) => `${f.label}:${d[f.key]}`)
      .join(' | ').toLowerCase();
    if (!hay.includes(q)) return;
    const matched = [];
    for (const f of SEARCH_FIELDS) {
      const v = d[f.key];
      if (!v || !String(v).trim() || v === '—') continue;
      if (String(v).toLowerCase().includes(q) || f.label.toLowerCase().includes(q)) {
        matched.push({ label: f.label, value: String(v), key: f.key });
      }
    }
    matches.push({ d, matched });
  });
  if (!matches.length) {
    results.innerHTML = `<div class="swap-preview empty">No person or posting matches "${escapeHtml(q)}".</div>`;
    return;
  }
  /* Count the distinct people found so searching a name shows every placement. */
  const people = new Set();
  matches.forEach(({ matched }) => {
    matched.forEach((m) => {
      if (m.label !== 'Posting' && m.label !== 'Day') {
        String(m.value).split(/,\s*/).forEach((n) => { if (n.trim()) people.add(n.trim()); });
      }
    });
  });
  const daysWord = matches.length === 1 ? 'day' : 'days';
  const peopleWord = people.size ? ` · ${people.size} ${people.size === 1 ? 'person' : 'people'}` : '';
  results.innerHTML = matches.map(({ d, matched }) => {
    const idx = roster.findIndex((r) => r.date === d.date);
    const sw = getSwaps()[d.date];
    const swapsHtml = sw && sw.now != null
      ? `${sw.original} → ${String(sw.now).trim() ? sw.now : 'Leave'}` : '';
    const notesHtml = notesDB[d.date] ? '📝' : '';
    /* Tint every result card by Dr. Mrinal's actual placement for that day —
       the same colour language as the day cards and calendar. */
    const m = mrinalDutyAt(idx);
    const mTint = m && m.tint ? m.tint : 'mrd-off';
    const mLabel = m ? m.label : '';
    const matchHtml = matched.map((p) =>
      `<span class="sr-match" data-key="${p.key}"><span class="sr-match-label">${p.label}</span> <b>${highlight(p.value, q)}</b></span>`
    ).join('');
    const foot = [notesHtml ? '<span>📝 note</span>' : '', swapsHtml ? `<span class="sr-swap">⇄ ${swapsHtml}</span>` : ''].filter(Boolean).join('');
    return `<div class="swap-day-chip sr-chip ${mTint}" data-idx="${idx}">
      <div class="sr-head">
        <span class="sr-date">${monthsName} ${d.date.split('-')[1]} <span class="swap-chip-role">• ${d.day}</span></span>
        <span class="upcoming-badge type-${d.type} ${mTint}">${highlight(mLabel || d.title, q)}</span>
      </div>
      ${matchHtml ? `<div class="sr-matches">${matchHtml}</div>` : ''}
      ${foot ? `<div class="sr-foot">${foot}</div>` : ''}
    </div>`;
  }).join('');
  const intro = `<div class="sr-summary">${matches.length} matching ${daysWord}${peopleWord}</div>`;
  results.innerHTML = intro + results.innerHTML;
  results.querySelectorAll('.swap-day-chip').forEach((chip) => chip.addEventListener('click', () => {
    closeSearchModal();
    window.__jumpToIndex(parseInt(chip.dataset.idx, 10));
  }));
}

/* Wire the input once so reopening the modal never stacks duplicate listeners. */
let searchBound = false;
function bindSearchInput() {
  if (searchBound) return;
  searchBound = true;
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', runSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const results = document.getElementById('search-results');
      const chip = results && results.querySelector('.swap-day-chip');
      if (chip) chip.click();
    }
  });
}

export function openSearchModal() {
  triggerHaptic(20);
  const modal = document.getElementById('search-modal');
  if (!modal) return;
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (input) input.value = '';
  if (results) results.innerHTML = searchEmptyState;
  bindSearchInput();
  modal.classList.add('show');
  setTimeout(() => input && input.focus(), 200);
}

export function closeSearchModal() {
  document.getElementById('search-modal').classList.remove('show');
}

/* ---- ROSTER GENERATE MODAL ---- */
export function openRosterModal() {
  triggerHaptic(20);
  const modal = document.getElementById('roster-modal');
  if (!modal) return;
  const status = document.getElementById('roster-status');
  if (status) {
    status.textContent = '';
    status.className = 'roster-status';
  }
  const input = document.getElementById('roster-input');
  if (input) input.value = '';
  modal.classList.add('show');
  setTimeout(() => { const i = document.getElementById('roster-input'); i && i.focus(); }, 300);
}

export function closeRosterModal() {
  document.getElementById('roster-modal').classList.remove('show');
}

function setRosterStatus(msg, ok) {
  const el = document.getElementById('roster-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'roster-status ' + (ok ? 'ok' : 'error');
}

export function copyRosterTemplate() {
  const done = () => setRosterStatus('Template copied — paste it into your AI chat with the roster image.', true);
  const fail = () => {
    const ta = document.createElement('textarea');
    ta.value = ROSTER_TEMPLATE;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { setRosterStatus('Copy failed — select the steps text manually.', false); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ROSTER_TEMPLATE).then(done).catch(fail);
  } else { fail(); }
}

export async function validateAndSaveRoster() {
  triggerHaptic(30);
  const raw = document.getElementById('roster-input').value.trim();
  if (!raw) { setRosterStatus('Paste the JSON from your AI chat first.', false); return; }
  let data;
  try { data = JSON.parse(raw); }
  catch (e) { setRosterStatus('Invalid JSON — check for missing commas, quotes or brackets.', false); return; }
  const err = validateRosterData(data);
  if (err) { setRosterStatus(err, false); return; }

  const meta = { month: data.month.trim(), startDate: data.startDate, userGenerated: true };
  const days = data.days;
  saveRoster(meta, days);
  window.__recomputeAndRender();

  /* Cross-month handover: attempt to pull previous month's last day for day-1 handover */
  try {
    const history = await loadHistory();
    const prev = history.prevDay;
    if (prev && prev.meta && prev.meta.month !== meta.month) {
      window.__prevDayData = { meta: prev.meta, day: prev.day };
    }
  } catch (e) {}

  closeRosterModal();
  setRosterStatus('', true);
  scheduleAlerts();

  /* Push to GitHub silently (best-effort) */
  pushToCloudSilently(meta, days);

  if (window.__onRosterSaved) window.__onRosterSaved();
}

async function pushToCloudSilently(meta, days) {
  if (!getToken()) return;
  try { await persistCurrentRoster(meta, days); }
  catch (e) { console.warn('Cloud sync failed', e); }
  try { await uploadCurrentRoster(); }
  catch (e) { console.warn('Roster store upload failed', e); }
}

/* Local-only keys wiped by a full reset. The GitHub PAT, store config, theme and
   the cloud-sync history gist intentionally survive a reset. */
const RESET_KEYS = [
  'mrinalRosterData',       // cached roster
  'mrinalDutySwaps',        // OPD/leave swaps
  'mrinalDutyNotes',        // per-day notes
  'mrinalDutyAlerts',       // scheduled duty alerts
  'mrinalDutyAlertSettings',// alert pill/lead-time settings
];

export function clearAppState() {
  RESET_KEYS.forEach((k) => localStorage.removeItem(k));
}

export function resetRoster() {
  triggerHaptic(30);
  clearAppState();
  resetToDefault();              /* instant bundled fallback so the UI is never blank */
  window.__prevDayData = null;
  window.__recomputeAndRender();
  setRosterStatus('', true);
  closeRosterModal();
  /* "Built-in" is now the /rosters/ GitHub folder: reload so autoSelectRoster pulls
     the current month's file (falls back to the bundled copy when offline). */
  location.reload();
}

export function scheduleAlerts() {
  scheduleDutyAlerts();
}

export function closeAllModals() {
  closeNoteModalFromRendering?.();
  const im = document.getElementById('install-modal');
  if (im && im.classList.contains('show')) im.classList.remove('show');
  ['note-modal', 'alert-modal', 'roster-modal', 'settings-modal', 'swap-modal', 'cloud-modal', 'roster-sync-modal', 'backup-modal', 'search-modal', 'print-modal'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.classList.remove('show');
  });
}