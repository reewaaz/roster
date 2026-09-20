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

/* Replace the whole swap map wholesale (Backup/Restore import). */
export function setSwaps(next) {
  swaps = (next && typeof next === 'object' && !Array.isArray(next)) ? next : {};
  saveSwaps();
}

/* Re-apply the swap map onto the roster day fields so the current view matches
   the restored swaps (an empty `now` means the person was moved onto 🧹 Leave). */
export function applySwapsToDays() {
  const roster = getRoster();
  Object.entries(swaps).forEach(([dateKey, s]) => {
    if (!s || typeof s.field !== 'string') return;
    const day = roster.find((d) => d.date === dateKey);
    if (day && day[s.field] !== undefined) day[s.field] = s.now == null ? s.original : s.now;
  });
}

/* A swap with an empty `now` means the person was dragged onto 🧹 Leave. */
function nowLabel(now) {
  return String(now || '').trim() ? now : 'Leave';
}

/* swaps[dateKey] = { field: 'picu', original: 'Aayoush', now: 'Salina', by: 'Dr. Mrinal' } */
export function swapBadgeFor(dateKey, field) {
  const s = swaps[dateKey];
  if (s && s.field === field) {
    return `<span class="swap-badge">⇄ ${escapeHtml(s.original)} → ${escapeHtml(nowLabel(s.now))}</span>`;
  }
  return '';
}

export function swapCount() {
  return Object.keys(swaps).length;
}

const FIELDS_MAP = {
  ward: 'Ward/ER', nicu: 'NICU', picu: 'PICU', er: 'ER Day', second: '2nd', opd: 'OPD', nagarHospital: 'Nagar',
};
/* 24h coverage roles must never be left blank after a reassignment. */
const HOUR24_FIELDS = ['ward', 'nicu', 'picu'];

function dayByDate(dateKey) {
  return getRoster().find((d) => d.date === dateKey);
}

/* OPD holds a comma-separated list of names. */
function opdMembers(day) {
  return String(day && day.opd || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function opdJoin(arr) {
  return arr.filter(Boolean).join(', ');
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

/* Append one person to a day's OPD list (never deletes existing members). */
function appendOpd(dateKey, name) {
  const day = dayByDate(dateKey);
  if (!day || !name) return;
  if (day.type === 'off' || day.type === 'post-off') return; /* holidays have no OPD postings */
  const list = opdMembers(day);
  if (!list.includes(name)) list.push(name);
  setPerson(dateKey, 'opd', opdJoin(list));
}

/* ---- GRID ---- */
function chipHtml(dateKey, field, value, label) {
  return `<span class="swap-chip" draggable="true" data-date="${dateKey}" data-field="${field}" data-person="${escapeHtml(value)}"><span class="swap-chip-role">${label}</span> <span class="swap-chip-name">${escapeHtml(value)}</span></span>`;
}

function allPeople() {
  const seen = new Set();
  getRoster().forEach((day) => {
    for (const f of FIELDS) {
      if (f.key === 'opd') opdMembers(day).forEach((n) => n && seen.add(n));
      else {
        const v = day[f.key];
        if (v && String(v).trim()) seen.add(String(v).trim());
      }
    }
  });
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/* Typeahead add control — a shared <datalist> supplies the roster names so the
   list filters as you type instead of one huge <select> per slot. */
function addPeopleInputHtml(dateKey, field, labelHint) {
  const placeholder = labelHint ? `＋ ${labelHint}…` : '＋ add…';
  return `<input class="swap-addsel" list="swap-people-list" data-date="${dateKey}" data-field="${field}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" enterkeyhint="done">`;
}

function renderGrid() {
  const meta = getMeta();
  const monthName = meta.month.split(' ')[0];
  return getRoster().map((day) => {
    const chips = [];
    for (const f of FIELDS) {
      const label = FIELDS_MAP[f.key] || f.label;
      if (f.key === 'opd') {
        const members = opdMembers(day);
        members.forEach((m) => chips.push(chipHtml(day.date, 'opd', m, label)));
        chips.push(addPeopleInputHtml(day.date, 'opd', 'OPD add'));
      } else {
        const v = day[f.key];
        if (v && String(v).trim()) {
          chips.push(chipHtml(day.date, f.key, String(v).trim(), label));
        } else {
          chips.push(addPeopleInputHtml(day.date, f.key, label));
        }
      }
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

export function renderSwapModal(container) {
  const meta = getMeta();
  const monthName = meta.month.split(' ')[0];

  container.innerHTML = `
    <datalist id="swap-people-list">${allPeople().map((n) => `<option value="${escapeHtml(n)}"></option>`).join('')}</datalist>
    <div class="swap-hint">👆 <b>Drag</b> a chip onto another day/role to <b>swap</b>; onto the <b>🧹 Leave</b> bar to remove them from that duty. Drop onto an empty row to <b>move</b>; use the <b>＋ boxes</b> to add people (type to filter).</div>
    <div class="swap-leave" id="swap-leave">🧹 <b>Leave</b> — drag a chip here to remove them from that duty</div>
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

  /* ---- ADD VIA DROPDOWN ---- */
  bindAddSelects(container);

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

function bindAddSelects(container) {
  const grid = container.querySelector('#swap-grid');
  if (!grid) return;
  const applyAdd = (sel) => {
    const val = sel.value.trim();
    if (!val) return;
    sel.value = '';
    const dateKey = sel.dataset.date;
    const field = sel.dataset.field;
    const day = dayByDate(dateKey);
    if (field === 'opd') {
      if (day && (day.type === 'off' || day.type === 'post-off')) {
        showToast('Holidays / OFF days have no OPD postings');
        return;
      }
      appendOpd(dateKey, val);
    } else {
      setPerson(dateKey, field, val);
    }
    triggerHaptic(20);
    const fLabel = FIELDS.find((f) => f.key === field)?.label || field;
    showToast(`＋ ${val} on ${dateKey.split('-')[1]} → ${fLabel}`);
    refreshSwapUI(container);
    dispatchEvent(new CustomEvent('roster-changed'));
  };
  grid.querySelectorAll('.swap-addsel').forEach((sel) => {
    sel.addEventListener('change', () => applyAdd(sel));
    sel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyAdd(sel); }
    });
  });
}

function initDragAndDrop(container) {
  const grid = container.querySelector('#swap-grid');
  if (!grid) return;

  let drag = null;      // { dateKey, field, name, person }
  let ghost = null;
  const leave = container.querySelector('#swap-leave');

  const makeGhost = (name) => {
    ghost = document.createElement('div');
    ghost.className = 'swap-ghost';
    ghost.textContent = name;
    document.body.appendChild(ghost);
  };

  const clearHighlights = () => {
    grid.querySelectorAll('.swap-chip').forEach((c) => c.classList.remove('candrop'));
    grid.querySelectorAll('.swap-day-row').forEach((r) => r.classList.remove('drop-target'));
    if (leave) leave.classList.remove('drag-over');
  };

  const move = (x, y) => {
    if (ghost) ghost.style.left = x + 'px';
    if (ghost) ghost.style.top = y + 'px';
    if (!drag) return;
    clearHighlights();
    const el = document.elementFromPoint(x, y);
    if (el) {
      if (leave && el.closest('.swap-leave')) {
        leave.classList.add('drag-over');
        return;
      }
      const chip = el.closest('.swap-chip');
      if (chip && !(chip.dataset.date === drag.dateKey && chip.dataset.field === drag.field)) {
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
    if (leave && el.closest('.swap-leave')) return { kind: 'leave' };
    const chip = el.closest('.swap-chip');
    if (chip) return { kind: 'chip', dateKey: chip.dataset.date, field: chip.dataset.field, person: chip.dataset.person };
    const roles = el.closest('.swap-day-roles');
    if (roles) return { kind: 'roles', dateKey: roles.dataset.date };
    return null;
  };

  const up = (e) => {
    if (!drag) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const target = getDropTarget(t.clientX, t.clientY);
    if (target) {
      if (target.kind === 'leave') {
        doLeave(drag);
      } else if (target.kind === 'chip') {
        if (target.dateKey === drag.dateKey && target.field === drag.field) {
          showToast('That chip is already in place');
        } else {
          doSwapChips(drag, target);
        }
      } else if (target.kind === 'roles' && target.dateKey !== drag.dateKey) {
        doMoveToDay(drag, target.dateKey);
      } else {
        showToast('Drop onto another day to move them there');
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
    const person = chip.dataset.person || chip.textContent.replace(/^\s*\S+\s+/, '').trim();
    drag = { dateKey: chip.dataset.date, field: chip.dataset.field, name: person, person };
    makeGhost(person);
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

/* Swap a dragged person/chip with a target person/chip, OPD-aware. */
function doSwapChips(drag, target) {
  const aOpd = drag.field === 'opd';
  const bOpd = target.field === 'opd';
  /* Holidays / OFF days have no OPD postings — never swap OPD in or out of them. */
  const aDay = dayByDate(drag.dateKey);
  const bDay = dayByDate(target.dateKey);
  const aForbidden = aOpd && aDay && (aDay.type === 'off' || aDay.type === 'post-off');
  const bForbidden = bOpd && bDay && (bDay.type === 'off' || bDay.type === 'post-off');
  if (aForbidden || bForbidden) {
    showToast('Holidays / OFF days have no OPD postings');
    return;
  }

  if (aOpd && bOpd) {
    /* Exchange two named OPD members between their days' OPD lists. */
    const aList = opdMembers(dayByDate(drag.dateKey)).filter((n) => n !== drag.person);
    const bList = opdMembers(dayByDate(target.dateKey)).filter((n) => n !== target.person);
    if (target.person) aList.push(target.person);
    if (drag.person) bList.push(drag.person);
    setPerson(drag.dateKey, 'opd', opdJoin(aList));
    setPerson(target.dateKey, 'opd', opdJoin(bList));
    triggerHaptic(30);
    showToast(`⇄ ${drag.person} ↔ ${target.person || '—'} (OPD)`);
  } else if (aOpd) {
    /* Dragged OPD member takes target role; target person moves into source day's OPD list. */
    const aList = opdMembers(dayByDate(drag.dateKey)).filter((n) => n !== drag.person);
    const bVal = String(dayByDate(target.dateKey)[target.field] || '').trim();
    swapOpdOutToRole(aList, bVal, drag, target);
  } else if (bOpd) {
    /* Dragged person takes target OPD member's spot; that member takes the dragged role. */
    const bList = opdMembers(dayByDate(target.dateKey)).filter((n) => n !== target.person);
    if (drag.person) bList.push(drag.person);
    setPerson(drag.dateKey, drag.field, target.person || '');
    setPerson(target.dateKey, 'opd', opdJoin(bList));
    triggerHaptic(30);
    showToast(`⇄ ${drag.person} ↔ ${target.person || '-'} (OPD)`);
  } else {
    /* Plain whole-value swap between two (day, field) pairs — same or different roles. */
    const aVal = dayByDate(drag.dateKey)[drag.field];
    const bVal = dayByDate(target.dateKey)[target.field];
    if (!aVal || !String(aVal).trim()) { showToast('Nothing to swap from that chip'); return; }
    setPerson(drag.dateKey, drag.field, bVal);
    setPerson(target.dateKey, target.field, aVal);
    triggerHaptic(30);
    showToast(`⇄ Swapped: ${aVal} ↔ ${bVal || '—'}`);
  }
  refreshSwapUI(querySwapContainer());
  dispatchEvent(new CustomEvent('roster-changed'));
}

function swapOpdOutToRole(aList, bVal, drag, target) {
  /* aList = source day OPD without the dragged member (already built). */
  if (bVal) aList.push(bVal);
  setPerson(drag.dateKey, 'opd', opdJoin(aList));
  setPerson(target.dateKey, target.field, drag.person);
  triggerHaptic(30);
  showToast(`⇄ ${drag.person} ↔ ${bVal || '—'}`);
}

function doMoveToDay(drag, bDate) {
  const bDay = dayByDate(bDate);
  if (drag.field === 'opd') {
    if (bDay && (bDay.type === 'off' || bDay.type === 'post-off')) {
      showToast('Holidays / OFF days have no OPD postings');
      return;
    }
    /* Remove dragged member from source OPD, append to target OPD. */
    const aList = opdMembers(dayByDate(drag.dateKey)).filter((n) => n !== drag.person);
    setPerson(drag.dateKey, 'opd', opdJoin(aList));
    appendOpd(bDate, drag.person);
    triggerHaptic(30);
    showToast(`→ ${drag.person} moved to OPD on ${bDate.split('-')[1]}`);
  } else {
    const aVal = dayByDate(drag.dateKey)[drag.field];
    if (!aVal || !String(aVal).trim()) { showToast('Nothing to move from that chip'); return; }
    setPerson(drag.dateKey, drag.field, '');
    setPerson(bDate, drag.field, aVal);
    triggerHaptic(30);
    showToast(`→ Moved ${aVal} to ${bDate.split('-')[1]}`);
  }
  refreshSwapUI(querySwapContainer());
  dispatchEvent(new CustomEvent('roster-changed'));
}

function querySwapContainer() {
  return document.getElementById('swap-body') || document;
}

/* Record a removal (now = '') as a normal swap so it can be undone later. */
function leavePerson(dateKey, field, original, newVal) {
  const day = dayByDate(dateKey);
  if (!day) return;
  const existing = swaps[dateKey] && swaps[dateKey].field === field;
  if (existing) {
    if (newVal === swaps[dateKey].original) delete swaps[dateKey];
    else swaps[dateKey].now = newVal;
  } else if (newVal !== original) {
    swaps[dateKey] = { field, original, now: newVal, by: 'Dr. Mrinal', at: Date.now() };
  }
  day[field] = newVal;
  saveSwaps();
}

/* Drag a person onto the 🧹 Leave bar: remove them from that duty (undoable).
   The 24h roles (Ward/ER, NICU, PICU) must stay covered, so the emptied slot
   becomes a ＋ box and we nudge the user to fill it. */
function doLeave(drag) {
  const day = dayByDate(drag.dateKey);
  if (!day) return;
  const hint = HOUR24_FIELDS.includes(drag.field)
    ? ` — pick a replacement to keep ${FIELDS_MAP[drag.field] || drag.field} covered`
    : '';
  if (drag.field === 'opd') {
    const list = opdMembers(day).filter((n) => n !== drag.person);
    leavePerson(drag.dateKey, 'opd', drag.person, opdJoin(list));
  } else {
    leavePerson(drag.dateKey, drag.field, String(day[drag.field] || drag.person).trim(), '');
  }
  triggerHaptic(30);
  showToast(`🧹 ${drag.person} released from duty${hint}`);
  refreshSwapUI(querySwapContainer());
  dispatchEvent(new CustomEvent('roster-changed'));
}

function refreshSwapUI(container) {
  container = container || querySwapContainer();
  const grid = container.querySelector('#swap-grid');
  if (grid) {
    grid.innerHTML = renderGrid();
    bindAddSelects(container);
  }
  renderSwapListRefresh(container);
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
        <span class="swap-chip-cur">${escapeHtml(s.original)} <b style="color:var(--swap-txt)">→ ${escapeHtml(nowLabel(s.now))}</b> <span style="color:var(--accent);">✕</span></span>
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
      refreshSwapUI(container);
      dispatchEvent(new CustomEvent('roster-changed'));
    });
  });
}