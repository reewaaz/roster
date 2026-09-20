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
  deleteStoreRoster, coversDate,
} from './rosters.js';
import { renderSwapModal, clearSwaps, swapCount, getSwaps } from './swaps.js';
import { openAlertModal, saveAlertSettings, sendTestNotification, scheduleDutyAlerts } from './alerts.js';
import { printRoster } from './print.js';
import { renderScrollView, renderMonthView, setRealTodayIndex, setCurrentIndex, notesDB, closeNoteModal as closeNoteModalFromRendering } from './rendering.js';

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
      <div class="settings-item" data-action="generate">
        <div class="settings-item-icon">✨</div>
        <div style="flex:1;">
          <div class="settings-item-label">Generate Roster</div>
          <div class="settings-item-sub">Generate / replace the current ${escapeHtml(meta.month)} roster</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="settings-item" data-action="print">
        <div class="settings-item-icon">🖨️</div>
        <div style="flex:1;">
          <div class="settings-item-label">Print Roster</div>
          <div class="settings-item-sub">Beautiful 2-page A4 PDF of ${escapeHtml(meta.month)}</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      <div class="settings-item" data-action="swap">
        <div class="settings-item-icon">⇄</div>
        <div style="flex:1;">
          <div class="settings-item-label">Swap / Reassign Duty</div>
          <div class="settings-item-sub">${swaps ? `${swaps} active swaps` : 'Swap a person between days / roles'}</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>
      ${swaps ? `<div class="settings-item" data-action="swap-clear">
        <div class="settings-item-icon">🧹</div>
        <div style="flex:1;">
          <div class="settings-item-label">Clear All Swaps</div>
          <div class="settings-item-sub">Revert every swap back to original</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>` : ''}

      <div class="settings-section-title">Notifications</div>
      <div class="settings-item" data-action="alerts">
        <div class="settings-item-icon">🔔</div>
        <div style="flex:1;">
          <div class="settings-item-label">Duty Alerts</div>
          <div class="settings-item-sub">Reminders before each duty day</div>
        </div>
        <span style="color:var(--text-muted);">›</span>
      </div>

      <div class="settings-section-title">Roster Store</div>
      <div class="settings-item" data-action="cloud">
        <div class="settings-item-icon">☁️</div>
        <div style="flex:1;">
          <div class="settings-item-label">GitHub Rosters</div>
          <div class="settings-item-sub">${tokenConfigured ? 'Connected · ' + (lastSync ? `last sync ${new Date(lastSync).toLocaleDateString()}` : 'set up') : 'Add PAT — upload, load & delete stored rosters'}</div>
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
      else if (action === 'print') { printRoster(); }
      else if (action === 'swap') { openSwapModal(); }
      else if (action === 'swap-clear') { clearSwaps(); showToast('All swaps reverted'); dispatchEvent(new CustomEvent('roster-changed')); }
      else if (action === 'alerts') openAlertModal();
      else if (action === 'cloud') openCloudModal();
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

/* ---- SEARCH ---- */
const SEARCH_FIELDS = [
  { key: 'title', label: 'Posting' },
  { key: 'ward', label: 'ER/Ward' },
  { key: 'nicu', label: 'NICU' },
  { key: 'picu', label: 'PICU' },
  { key: 'er', label: 'Day ER' },
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

function srHours(d) {
  if (!d) return '';
  if (d.type === 'off') return 'Off';
  if (d.type === 'post-off') return 'Off Day';
  if (d.type === 'picu-24') return '🕘 9AM–9AM';
  if (d.day === 'Fri') return '🕘 9AM–3PM';
  if (d.day === 'Wed') return '🕘 9AM–1PM';
  return '🕘 9AM–5PM';
}

export function openSearchModal() {
  triggerHaptic(20);
  const modal = document.getElementById('search-modal');
  if (!modal) return;
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (input) input.value = '';
  if (results) results.innerHTML = '<div class="swap-preview empty">🔍 Type a name or duty to search the whole month.</div>';
  modal.classList.add('show');
  setTimeout(() => input && input.focus(), 250);

  const run = () => {
    const q = (input.value || '').trim().toLowerCase();
    if (!q) {
      results.innerHTML = '<div class="swap-preview empty">🔍 Type a name or duty to search the whole month.</div>';
      return;
    }
    const meta = getMeta();
    const monthsName = meta.month.split(' ')[0];
    const roster = getRoster();
    const matches = [];
    roster.forEach((d) => {
      const hay = [d.title, d.ward, d.nicu, d.picu, d.er, d.second, d.opd, d.nagarHospital, d.day]
        .join(' | ').toLowerCase();
      if (!hay.includes(q)) return;
      const matched = [];
      for (const f of SEARCH_FIELDS) {
        const v = d[f.key];
        if (!v || !String(v).trim() || v === '—') continue;
        if (String(v).toLowerCase().includes(q)) matched.push({ label: f.label, value: String(v) });
      }
      matches.push({ d, matched });
    });
    if (!matches.length) {
      results.innerHTML = `<div class="swap-preview empty">No days match "${escapeHtml(q)}".</div>`;
      return;
    }
    results.innerHTML = matches.map(({ d, matched }) => {
      const idx = roster.findIndex((r) => r.date === d.date);
      const swapsHtml = getSwaps()[d.date] && getSwaps()[d.date].now
        ? `${getSwaps()[d.date].original} → ${getSwaps()[d.date].now}` : '';
      const notesHtml = notesDB[d.date] ? '📝' : '';
      const hoursHtml = srHours(d);
      const matchHtml = matched.map((m) =>
        `<span class="sr-match"><span class="sr-match-label">${m.label}</span> <b>${highlight(m.value, q)}</b></span>`
      ).join('');
      return `<div class="swap-day-chip sr-chip" data-idx="${idx}">
        <div class="sr-head">
          <span class="sr-date">${monthsName} ${d.date.split('-')[1]} <span class="swap-chip-role">• ${d.day}</span></span>
          <span class="upcoming-badge type-${d.type}">${highlight(d.title, q)}</span>
        </div>
        ${matchHtml ? `<div class="sr-matches">${matchHtml}</div>` : ''}
        <div class="sr-foot"><span>${hoursHtml}</span>${notesHtml ? '<span>📝 note</span>' : ''}${swapsHtml ? `<span class="sr-swap">⇄ ${swapsHtml}</span>` : ''}</div>
      </div>`;
    }).join('');
    results.querySelectorAll('.swap-day-chip').forEach((chip) => chip.addEventListener('click', () => {
      closeSearchModal();
      window.__jumpToIndex(parseInt(chip.dataset.idx, 10));
    }));
  };

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const chip = results.querySelector('.swap-day-chip');
      if (chip) chip.click();
    }
  });
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

export function resetRoster() {
  triggerHaptic(30);
  resetToDefault();
  window.__recomputeAndRender();
  window.__prevDayData = null;
  closeRosterModal();
  setRosterStatus('', true);
  scheduleAlerts();
}

export function scheduleAlerts() {
  scheduleDutyAlerts();
}

export function closeAllModals() {
  closeNoteModalFromRendering?.();
  const im = document.getElementById('install-modal');
  if (im && im.classList.contains('show')) im.classList.remove('show');
  ['note-modal', 'alert-modal', 'roster-modal', 'settings-modal', 'swap-modal', 'cloud-modal', 'search-modal'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.classList.remove('show');
  });
}