import { triggerHaptic, showToast, escapeHtml } from './utils.js';
import { FIELDS, getRoster, getMeta } from './roster.js';

const SWAPS_KEY = 'mrinalDutySwaps';
let swaps = loadSwaps();

function loadSwaps() {
  try {
    const raw = JSON.parse(localStorage.getItem(SWAPS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) { return {}; }
}

export function saveSwaps() {
  localStorage.setItem(SWAPS_KEY, JSON.stringify(swaps));
}

export function getSwaps() {
  return swaps;
}

/* swaps[dateKey] = { field: 'picu', original: 'Aayoush', now: 'Salina', by: 'Dr. Mrinal' } */
export function applySwap(dateKey, field, original, now) {
  const day = getRoster().find((d) => d.date === dateKey);
  if (!day) return false;
  swaps[dateKey] = { field, original, now, by: 'Dr. Mrinal', at: Date.now() };
  day[field] = now;
  saveSwaps();
  return true;
}

export function removeSwap(dateKey) {
  const s = swaps[dateKey];
  if (!s) return;
  const day = getRoster().find((d) => d.date === dateKey);
  if (day) day[s.field] = s.original;
  delete swaps[dateKey];
  saveSwaps();
}

export function clearSwaps() {
  Object.keys(swaps).forEach((dateKey) => {
    const s = swaps[dateKey];
    const day = getRoster().find((d) => d.date === dateKey);
    if (day) day[s.field] = s.original;
  });
  swaps = {};
  saveSwaps();
}

export function swapBadgeFor(dateKey, field) {
  const s = swaps[dateKey];
  if (s && s.field === field) {
    return `<span class="swap-badge">⇄ ${escapeHtml(s.original)} → ${escapeHtml(s.now)}</span>`;
  }
  return '';
}

export function swapCount() {
  return Object.keys(swaps).length;
}

const FIELDS_MAP = {
  ward: 'Ward', nicu: 'NICU', picu: 'PICU', er: 'ER', second: '2nd', opd: 'OPD', nagarHospital: 'Nagar',
};

function dayByDate(dateKey) {
  return getRoster().find((d) => d.date === dateKey);
}

/* Set a person on a day/field, keeping swap history sane. */
function setPerson(dateKey, field, newVal) {
  const day = dayByDate(dateKey);
  if (!day) return;
  const existing = swaps[dateKey] && swaps[dateKey].field === field;
  const original = existing ? swaps[dateKey].original : day[field];
  day[field] = newVal;
  if (existing) {
    if (String(newVal).trim() === '' || newVal === original) delete swaps[dateKey];
    else swaps[dateKey].now = newVal;
  } else if (String(newVal).trim() !== '' && newVal !== original) {
    swaps[dateKey] = { field, original, now: newVal, by: 'Dr. Mrinal', at: Date.now() };
  }
  saveSwaps();
}

function isRoleEmpty(day, field) {
  const v = day[field];
  return !v || !String(v).trim();
}

function renderGrid() {
  const meta = getMeta();
  const monthName = meta.month.split(' ')[0];
  return getRoster().map((day, i) => {
    const chips = [];
    for (const f of getAssignableFields()) {
      const v = day[f.key];
      if (!v || !String(v).trim()) continue;
      chips.push(`<span class="swap-chip" draggable="false" data-date="${day.date}" data-field="${f.key}"><span class="swap-chip-role">${FIELDS_MAP[f.key] || f.label}</span> ${escapeHtml(v)}</span>`);
    }
    return `
      <div class="swap-day-row" data-date="${day.date}">
        <div class="swap-day-head">
          <span>${monthName} ${day.date.split('-')[1]} · ${day.day}</span>
          <span class="swap-day-title">${escapeHtml(day.title)}</span>
        </div>
        <div class="swap-day-roles" data-date="${day.date}">${chips.join('') || '<span class="swap-chip-cur" style="font-size:11px;color:var(--text-muted);">no assignments</span>'}</div>
      </div>`;
  }).join('');
}

function getAssignableFields() {
  return FIELDS.filter((f) => f.key !== 'opd');
}

export function renderSwapModal(container) {
  const meta = getMeta();
  const monthName = meta.month.split(' ')[0];

  container.innerHTML = `
    <div class="swap-hint">👆 <b>Drag</b> a person's chip and <b>drop</b> it onto the same role on another day to swap duties. Drop onto an empty area to move them there.</div>
    <div class="swap-grid" id="swap-grid">${renderGrid()}</div>
    <button class="swap-small-toggle" id="swap-show-form">＋ Manual swap (pick day &amp; role)</button>
    <div id="swap-manual" style="display:none;" class="swap-layout">
      <div class="swap-pick">
        <label class="swap-pick-label">Day</label>
        <select id="swap-day-select">
          ${getRoster().map((d) => `<option value="${d.date}">${monthName} ${d.date.split('-')[1]} (${d.day}) — ${escapeHtml(d.title)}</option>`).join('')}
        </select>
      </div>
      <div class="swap-pick">
        <label class="swap-pick-label">Role</label>
        <select id="swap-field-select">
          ${FIELDS.map((f) => `<option value="${f.key}">${escapeHtml(f.label)}</option>`).join('')}
        </select>
      </div>
      <div class="swap-pick">
        <label class="swap-pick-label">New Person</label>
        <input type="text" id="swap-person-input" class="modal-textarea" style="height:auto; margin:0;" placeholder="Name of person taking over">
      </div>
      <div id="swap-current-preview" class="swap-preview empty">Select a day + role to see the current person</div>
      <div class="modal-actions">
        <button class="modal-btn btn-cancel" id="swap-remove-btn">Undo</button>
        <button class="modal-btn btn-save" id="swap-apply-btn">Apply Swap</button>
      </div>
    </div>
    <div class="swap-days-list" id="swap-days-list" style="margin-top:10px;">
      ${Object.keys(swaps).length ? renderActiveSwaps() : '<div class="swap-preview empty">No swaps yet — drag a person onto another day above.</div>'}
    </div>
  `;

  /* ---- DRAG + DROP ---- */
  initDragAndDrop(container);

  /* ---- MANUAL FORM (collapsed by default) ---- */
  const toggleBtn = container.querySelector('#swap-show-form');
  toggleBtn.addEventListener('click', () => {
    const manual = container.querySelector('#swap-manual');
    const show = manual.style.display === 'none';
    manual.style.display = show ? 'flex' : 'none';
    toggleBtn.innerText = show ? '－ Hide manual swap' : '＋ Manual swap (pick day & role)';
  });

  const daySelect = container.querySelector('#swap-day-select');
  const fieldSelect = container.querySelector('#swap-field-select');
  const personInput = container.querySelector('#swap-person-input');
  const preview = container.querySelector('#swap-current-preview');

  const updatePreview = () => {
    const d = dayByDate(daySelect.value);
    const cur = d && d[fieldSelect.value];
    const curText = (cur && String(cur).trim()) ? String(cur) : '— (empty)';
    const s = swaps[daySelect.value];
    const note = s && s.field === fieldSelect.value ? ` (swapped from ${s.original})` : '';
    preview.classList.toggle('empty', !curText || curText === '— (empty)');
    preview.innerHTML = `<span style="text-transform:uppercase; font-size:11px;">Current:</span> ${escapeHtml(curText)}${note}`;
  };
  daySelect && daySelect.addEventListener('change', updatePreview);
  fieldSelect && fieldSelect.addEventListener('change', updatePreview);
  if (updatePreview) updatePreview();

  container.querySelector('#swap-apply-btn').addEventListener('click', () => {
    const dateKey = daySelect.value;
    const field = fieldSelect.value;
    const now = personInput.value.trim();
    if (!now) { showToast('Enter the person name first'); return; }
    const original = dayByDate(dateKey)[field] || '';
    setPerson(dateKey, field, now);
    triggerHaptic(30);
    showToast(`Swapped ${field}: ${original || '—'} → ${now}`);
    renderSwapListRefresh(container);
    dispatchEvent(new CustomEvent('roster-changed'));
  });

  container.querySelector('#swap-remove-btn').addEventListener('click', () => {
    const dateKey = daySelect.value;
    const field = fieldSelect.value;
    if (!swaps[dateKey] || swaps[dateKey].field !== field) {
      showToast('No swap on this day/role to undo');
      return;
    }
    removeSwap(dateKey);
    triggerHaptic(20);
    showToast('Swap undone');
    renderSwapListRefresh(container);
    updatePreview();
    dispatchEvent(new CustomEvent('roster-changed'));
  });
}

function initDragAndDrop(container) {
  const grid = container.querySelector('#swap-grid');
  if (!grid) return;

  let drag = null;      // { dateKey, field, name }
  let ghost = null;

  const makeGhost = (name) => {
    ghost = document.createElement('div');
    ghost.className = 'swap-ghost';
    ghost.textContent = name;
    document.body.appendChild(ghost);
  };

  const clearHighlights = () => {
    grid.querySelectorAll('.swap-chip').forEach((c) => c.classList.remove('candrop'));
    grid.querySelectorAll('.swap-day-row').forEach((r) => r.classList.remove('drop-target'));
  };

  const move = (x, y) => {
    if (ghost) ghost.style.left = x + 'px';
    if (ghost) ghost.style.top = y + 'px';
    if (!drag) return;
    clearHighlights();
    const el = document.elementFromPoint(x, y);
    if (el) {
      const chip = el.closest('.swap-chip');
      if (chip && chip.dataset.field === drag.field && chip.dataset.date !== drag.dateKey) {
        chip.classList.add('candrop');
        return;
      }
      const roles = el.closest('.swap-day-roles');
      if (roles && roles.dataset.date !== drag.dateKey) {
        const row = roles.closest('.swap-day-row');
        if (row) row.classList.add('drop-target');
      }
    }
  };

  const getDropTarget = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const chip = el.closest('.swap-chip');
    if (chip) return { kind: 'chip', dateKey: chip.dataset.date, field: chip.dataset.field };
    const roles = el.closest('.swap-day-roles');
    if (roles) return { kind: 'roles', dateKey: roles.dataset.date };
    return null;
  };

  const up = (e) => {
    if (!drag) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const target = getDropTarget(t.clientX, t.clientY);
    if (target) {
      if (target.kind === 'chip' && target.dateKey !== drag.dateKey && target.field === drag.field) {
        doSwapChips(drag.dateKey, drag.field, target.dateKey, target.field);
      } else if (target.kind === 'roles' && target.dateKey !== drag.dateKey) {
        doMoveToDay(drag.dateKey, drag.field, target.dateKey);
      } else {
        showToast('Drop on the same role of another day');
      }
    }
    if (ghost) { ghost.remove(); ghost = null; }
    grid.querySelectorAll('.swap-chip').forEach((c) => c.classList.remove('dragging'));
    clearHighlights();
    drag = null;
    grid.classList.remove('swap-dragging');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
  };

  const onMove = (e) => move(e.clientX, e.clientY);
  const onUp = (e) => up(e);

  grid.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.swap-chip');
    if (!chip) return;
    e.preventDefault();
    const name = chip.textContent.replace(/^\s*\S+\s+/, '').trim();
    drag = { dateKey: chip.dataset.date, field: chip.dataset.field, name };
    makeGhost(name);
    triggerHaptic(15);
    chip.classList.add('dragging');
    grid.classList.add('swap-dragging');
    const t = e.touches ? e.touches[0] : e;
    move(t.clientX, t.clientY);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
    document.addEventListener('pointercancel', onUp, { once: true });
  });
}

function doSwapChips(aDate, field, bDate, bField) {
  const aVal = dayByDate(aDate)[field];
  const bVal = dayByDate(bDate)[bField];
  if (!aVal || !String(aVal).trim()) { showToast('Nothing to swap from that chip'); return; }
  setPerson(aDate, field, bVal);
  setPerson(bDate, bField, aVal);
  triggerHaptic(30);
  showToast(`⇄ Swapped: ${aVal} ↔ ${bVal || '—'}`);
  refreshSwapUI();
  dispatchEvent(new CustomEvent('roster-changed'));
}

function doMoveToDay(aDate, field, bDate) {
  const aVal = dayByDate(aDate)[field];
  if (!aVal || !String(aVal).trim()) { showToast('Nothing to move from that chip'); return; }
  setPerson(aDate, field, '');
  setPerson(bDate, field, aVal);
  triggerHaptic(30);
  showToast(`→ Moved ${aVal} to ${bDate.split('-')[1]}`);
  refreshSwapUI();
  dispatchEvent(new CustomEvent('roster-changed'));
}

function refreshSwapUI() {
  const grid = document.getElementById('swap-grid');
  if (grid) grid.innerHTML = renderGrid();
  renderSwapListRefresh(document.getElementById('swap-body') || document);
  const count = swapCount();
  const settingsBody = document.getElementById('settings-body');
  if (settingsBody) {
    const swapItem = settingsBody && settingsBody.querySelector('[data-action="swap"] .settings-item-sub');
    if (swapItem) swapItem.textContent = count ? `${count} active swaps` : 'Swap a person between days / roles';
  }
}

function renderActiveSwaps() {
  const meta = getMeta();
  const monthName = meta.month.split(' ')[0];
  return `<div style="margin:6px 0 6px 2px;font-size:11px;font-weight:900;text-transform:uppercase;color:var(--text-muted);letter-spacing:.5px;">Active Swaps</div>` +
    Object.entries(swaps).map(([dateKey, s]) => {
      const fieldLabel = FIELDS.find((f) => f.key === s.field)?.label || s.field;
      return `<div class="swap-day-chip" data-date="${dateKey}" data-field="${s.field}">
        <span>${monthName} ${dateKey.split('-')[1]} <span class="swap-chip-role">${escapeHtml(fieldLabel)}</span></span>
        <span class="swap-chip-cur">${escapeHtml(s.original)} <b style="color:var(--swap-txt)">→ ${escapeHtml(s.now)}</b> <span style="color:var(--accent);">✕</span></span>
      </div>`;
    }).join('');
}

function renderSwapListRefresh(container) {
  const list = container.querySelector('#swap-days-list');
  if (!list) return;
  list.innerHTML = Object.keys(swaps).length ? renderActiveSwaps() : '<div class="swap-preview empty">No swaps yet — drag a person onto another day above.</div>';
  list.querySelectorAll('.swap-day-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      removeSwap(chip.dataset.date);
      triggerHaptic(20);
      showToast('Swap undone');
      renderSwapListRefresh(container);
      refreshSwapUI();
      dispatchEvent(new CustomEvent('roster-changed'));
    });
  });
}