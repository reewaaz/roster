import { triggerHaptic, showToast, escapeHtml } from './utils.js';
import {
  getRoster, getMeta, getStart, getEnd, isExpired, recomputeToday,
  findHandoverName, getOffDutyPeople, dayRole, WEEKDAYS,
} from './roster.js';
import { getSwaps } from './swaps.js';
import { listStoreRosters, parseMonthYear, loadRosterCachedOrStore, coversDate, getLocalRosterCache, rosterFileName } from './rosters.js';

/* Dr. Mrinal's day chip — same colour language as the print references. */
const MRINAL_DUTY = {
  ward:   { label: 'Ward/ER 24h', cls: 'd-ward24', tint: 'mrd-ward24' },
  nicu:   { label: 'NICU 24h',    cls: 'd-nicu24', tint: 'mrd-nicu24' },
  picu:   { label: 'PICU 24h',    cls: 'd-picu24', tint: 'mrd-picu24' },
  er:     { label: 'ER Day',      cls: 'd-dayer',  tint: 'mrd-dayer' },
  opd:    { label: 'OPD',         cls: 'd-opd',    tint: 'mrd-opd' },
  nagarHospital: { label: 'Nagar Hospital', cls: 'd-nagar', tint: 'mrd-nagar' },
  second: { label: '2nd call',    cls: 'd-second', tint: 'mrd-second' },
  postOff: { label: 'Post 24h OFF', cls: 'd-post', tint: 'mrd-post' },
  off:    { label: 'OFF',         cls: 'd-off',    tint: 'mrd-off' },
  picuDay: { label: 'PICU Day',   cls: 'd-picuday', tint: 'mrd-picuday' },
};

/* Full weekday names for card headers / mini cards ("Sunday" instead of "Sun"). */
const FULL_DAYS = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
function fullDayName(d) { return (d && FULL_DAYS[d]) || d || ''; }

export function mrinalDutyAt(idx) {
  const roster = getRoster();
  if (!roster || idx < 0 || idx >= roster.length) return null;
  const prevDay = idx === 0 ? (window.__prevDayData && window.__prevDayData.day) : null;
  const r = dayRole(roster, idx, 'Mrinal', prevDay);
  const d = MRINAL_DUTY[r.key];
  return { key: r.key, label: d.label, cls: d.cls, tint: d.tint };
}

function mrinalDutyOf(data) {
  if (!data) return null;
  const roster = getRoster();
  return mrinalDutyAt(roster.findIndex((r) => r.date === data.date));
}

let realTodayIndex = 0;
let currentIndex = 0;
let expandMountFor = -1;
let mountOrigin = null;  // { x, y } percentages — where the new card should expand from
let suppressScrollDayUntil = 0;  // timestamp; ignore ghost clicks right after a view switch
let browsingNonCurrent = false; // true when calendar arrows moved to a month that doesn't contain today
let todayAnchor = null;         // { name, meta, days } — the roster that actually contains today,
                                // captured whenever a month covering today is rendered; the Today
                                // pill bounces back to this month from any other browsed month

function loadNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem('mrinalDutyNotes'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    /* Corrupted note data must not brick the whole app on startup. */
    return {};
  }
}
export const notesDB = loadNotes();
export function getNotes() { return notesDB; }
export function setRealTodayIndex(v) { realTodayIndex = v; }
export function getRealTodayIndex() { return realTodayIndex; }
export function getCurrentIndex() { return currentIndex; }
export function setCurrentIndex(v) { currentIndex = v; }

function saveNotes() {
  localStorage.setItem('mrinalDutyNotes', JSON.stringify(notesDB));
}

/* Replace every note wholesale (Backup/Restore import). */
export function replaceNotes(notes) {
  Object.keys(notesDB).forEach((k) => delete notesDB[k]);
  if (notes && typeof notes === 'object') Object.assign(notesDB, notes);
  saveNotes();
}

/* ---- MAIN CARD HTML ---- */
function mainCardHtml(data, mountCls = '') {
  if (!data) return '';
  const swaps = getSwaps();
  const meta = getMeta();
  const roster = getRoster();

  let detailsHtml = '';
  const idx = roster.findIndex((r) => r.date === data.date);

  /* Dr. Mrinal's actual duty drives the badge label + tint (not the raw roster
     title). Her duty hours/status meta is hidden on 24h shifts and post-duty
     recovery days. */
  const m = mrinalDutyOf(data);
  const mTint = m ? m.tint : 'mrd-off';
  const mLabel = m ? m.label : '';
  const hideDutyMeta = !!(m && (m.key === 'ward' || m.key === 'nicu' || m.key === 'picu' || m.key === 'postOff'));

  /* Handover line on Mrinal's 24h cards (Ward/ER, NICU, PICU): who held the same
     placement the day before (take handover from) and who takes over the next day
     (give handover to). Unknown sides are omitted; the whole line only shows when
     at least one side is known. */
  const fromToHtml = (m && (m.key === 'ward' || m.key === 'nicu' || m.key === 'picu'))
    ? (() => {
        const prev = idx > 0 ? roster[idx - 1] : (window.__prevDayData && window.__prevDayData.day);
        const next = idx < roster.length - 1 ? roster[idx + 1] : null;
        const occupant = (d) => {
          if (!d) return null;
          const v = d[m.key];
          if (!v) return null;
          const names = String(v).split(',').map((s) => s.trim()).filter((s) => s && s !== '—');
          return names.length ? names.join(', ') : null;
        };
        const from = occupant(prev);
        const to = occupant(next);
        const bits = [];
        if (from) bits.push(`<span class="ft-item"><span class="ft-k">From</span><span class="ft-name">${escapeHtml(from)}</span></span>`);
        if (to) bits.push(`<span class="ft-item"><span class="ft-k">To</span><span class="ft-name">${escapeHtml(to)}</span></span>`);
        return bits.length
          ? `<div class="handover-fromto c-${m.key}">${bits.join('<span class="ft-arrow">→</span>')}</div>`
          : '';
      })()
    : '';

  if (data.type === 'opd') {
    const opdTeammates = data.opd
      ? data.opd.split(', ')
          .map(n => n.trim())
          .filter(n => n.toLowerCase() !== 'mrinal')
      : [];
    const pills = opdTeammates.length > 0
      ? opdTeammates.map(n => `<span class="pill">${escapeHtml(n)}</span>`).join('')
      : '<span class="pill">None</span>';
    detailsHtml = `
      <div>
        <div class="team-label">OPD Teammates</div>
        <div class="pills">${pills}</div>
      </div>`;
    if (data.nagarHospital && String(data.nagarHospital).trim()) {
      detailsHtml += `
        <div class="nagar-row">
          <span class="nagar-label">🏥 Nagar Hospital</span>
          <span class="nagar-name">${escapeHtml(data.nagarHospital)}</span>
        </div>`;
    }
  } else if (data.type === 'picu-24') {
    let rows = [];
    if (data.ward) rows.push(`<div class="duty-row dr-ward"><span class="duty-k">Ward/ER</span><span class="duty-v ${swaps[data.date] && swaps[data.date].field === 'ward' ? 'swapped' : ''}">${escapeHtml(data.ward)}${swaps[data.date] && swaps[data.date].field === 'ward' ? swapBadge(data.date, 'ward') : ''}</span></div>`);
    if (data.nicu) rows.push(`<div class="duty-row dr-nicu"><span class="duty-k">NICU</span><span class="duty-v ${swaps[data.date] && swaps[data.date].field === 'nicu' ? 'swapped' : ''}">${escapeHtml(data.nicu)}${swaps[data.date] && swaps[data.date].field === 'nicu' ? swapBadge(data.date, 'nicu') : ''}</span></div>`);
    if (data.picu) rows.push(`<div class="duty-row dr-picu"><span class="duty-k">PICU</span><span class="duty-v ${swaps[data.date] && swaps[data.date].field === 'picu' ? 'swapped' : ''}">${escapeHtml(data.picu)}${swaps[data.date] && swaps[data.date].field === 'picu' ? swapBadge(data.date, 'picu') : ''}</span></div>`);
    if (data.er) rows.push(`<div class="duty-row dr-er"><span class="duty-k">ER Day</span><span class="duty-v ${swaps[data.date] && swaps[data.date].field === 'er' ? 'swapped' : ''}">${escapeHtml(data.er)}${swaps[data.date] && swaps[data.date].field === 'er' ? swapBadge(data.date, 'er') : ''}</span></div>`);
    detailsHtml = `
      <div>
        <div class="duty-list">${rows.join('')}</div>
      </div>`;
    if (data.nagarHospital && String(data.nagarHospital).trim()) {
      detailsHtml += `
        <div class="nagar-row">
          <span class="nagar-label">🏥 Nagar Hospital</span>
          <span class="nagar-name">${escapeHtml(data.nagarHospital)}</span>
        </div>`;
    }
  } else if (data.type === 'off' || data.type === 'post-off') {
    const statusText = data.type === 'off' ? 'Public Holiday / Off' : 'Post 24h Duty OFF';
    const bgCol = data.type === 'off' ? '#dcfce7' : '#f1f5f9';
    const txtCol = data.type === 'off' ? '#15803d' : '#475569';
    const isPublicHoliday = data.type === 'off';
    const people = getOffDutyPeople(data);
    const placeCls = { 'Ward/ER': 'dr-ward', NICU: 'dr-nicu', PICU: 'dr-picu', 'ER Day': 'dr-er' };
    const peopleRows = people.map(p => `
      <div class="duty-row ${placeCls[p.label] || ''}">
        <span class="duty-k">${escapeHtml(p.label)}</span>
        <span class="duty-v">${escapeHtml(p.value)}</span>
      </div>`).join('');
    detailsHtml = `
      <div>
        ${(hideDutyMeta || isPublicHoliday) ? '' : `<div class="team-label">Duty Status</div>
        <div class="pills"><span class="pill" style="background:${bgCol}; color:${txtCol}; width:100%; text-align:center;">${statusText}</span></div>`}
        ${people.length ? `<div class="duty-list">${peopleRows}</div>` : ''}
      </div>`;
  } else {
    let rows = [];
    if (data.ward) rows.push(`<div class="duty-row dr-ward"><span class="duty-k">Ward/ER</span><span class="duty-v ${swaps[data.date] && swaps[data.date].field === 'ward' ? 'swapped' : ''}">${escapeHtml(data.ward)}${swapBadge(data.date, 'ward')}</span></div>`);
    if (data.nicu) rows.push(`<div class="duty-row dr-nicu"><span class="duty-k">NICU</span><span class="duty-v ${swaps[data.date] && swaps[data.date].field === 'nicu' ? 'swapped' : ''}">${escapeHtml(data.nicu)}${swapBadge(data.date, 'nicu')}</span></div>`);
    if (data.picu) rows.push(`<div class="duty-row dr-picu"><span class="duty-k">PICU</span><span class="duty-v ${swaps[data.date] && swaps[data.date].field === 'picu' ? 'swapped' : ''}">${escapeHtml(data.picu)}${swapBadge(data.date, 'picu')}</span></div>`);
    if (data.er) rows.push(`<div class="duty-row dr-er"><span class="duty-k">ER Day</span><span class="duty-v ${swaps[data.date] && swaps[data.date].field === 'er' ? 'swapped' : ''}">${escapeHtml(data.er)}${swapBadge(data.date, 'er')}</span></div>`);
    detailsHtml = `
      <div>
        <div class="duty-list">${rows.join('')}</div>
      </div>`;
    if (data.nagarHospital && String(data.nagarHospital).trim()) {
      detailsHtml += `
        <div class="nagar-row">
          <span class="nagar-label">🏥 Nagar Hospital</span>
          <span class="nagar-name">${escapeHtml(data.nagarHospital)}</span>
        </div>`;
    }
  }

  const secondCallHtml = data.second
    ? `<div class="second-call"><span class="second-call-label">📞 2nd On Call</span><span class="second-call-name">${escapeHtml(data.second)}</span></div>`
    : '';

  /* Who's on the OPD team this day — shown on every expanded card (not just OPD
     days) as a labelled chip list, so the OPD roster reads clearly alongside the
     duty details. */
  const opdTeamHtml = (data.type !== 'opd' && data.opd && String(data.opd).trim())
    ? (() => {
        const names = String(data.opd).split(/,\s*/).map((n) => n.trim()).filter(Boolean);
        return `
      <div class="opd-row">
        <div class="opd-head">
          <span class="opd-label">🏥 OPD Team</span>
          <span class="opd-count">${names.length}</span>
        </div>
        <div class="opd-pills">${names.map((n) => `<span class="opd-pill">${escapeHtml(n)}</span>`).join('')}</div>
      </div>`;
      })()
    : '';

  const savedNote = notesDB[data.date];
  const noteHtml = savedNote
    ? `<div class="daily-note"><span style="font-size:10px; text-transform:uppercase; font-family:'Inter',sans-serif; display:block; margin-bottom:1px; opacity:0.8;">Note Attached</span>${escapeHtml(savedNote)}</div>`
    : '';

  const noteBadgeHtml = savedNote
    ? `<div class="card-note-badge">Note Attached</div>`
    : '';

  const festNote = (data.title && !/off/i.test(String(data.title).trim()))
    ? `<div class="fest-note">🎉 ${escapeHtml(String(data.title).trim())}</div>`
    : '';
  return `
    <div class="card today type-${data.type} ${mTint}${mountCls}" id="dailyCardElement" data-date="${data.date}">
      <div class="card-header">
        <div>
          <span class="date-num">${escapeHtml(meta.month.split(' ')[0])} ${data.date.split('-')[1]}${savedNote ? '<span class="scroll-note" style="color:var(--text-main);font-size:18px;font-weight:900;">*</span>' : ''}</span>
          <span class="day-name">${fullDayName(data.day)}</span>
          ${festNote}
          ${fromToHtml}
        </div>
        <div class="card-header-right">
          <div class="badge type-${data.type} ${mTint}">${escapeHtml(mLabel || data.title)}</div>
          ${noteBadgeHtml}
        </div>
      </div>

      <div class="card-body-content">
        ${detailsHtml}
        ${opdTeamHtml}
        ${secondCallHtml}
      </div>

      ${noteHtml}
    </div>
  `;
}

function swapBadge(dateKey, field) {
  const s = getSwaps()[dateKey];
  if (s && s.field === field) {
    const now = String(s.now || '').trim() ? s.now : 'Leave';
    return `<span class="swap-badge">⇄ ${escapeHtml(s.original)} → ${escapeHtml(now)}</span>`;
  }
  return '';
}

/* ---- SCROLL VIEW ---- */
function markPillOverflow(area) {
  area.querySelectorAll('.pills').forEach(pills => {
    pills.classList.toggle('has-overflow', pills.scrollHeight > pills.clientHeight);
  });
}

function updateTodayPill(area) {
  const pill = document.getElementById('today-pill');
  if (!pill) return;
  const dailyActive = document.getElementById('view-daily').classList.contains('active');
  /* In a browsed month that has no real today (calendar arrows moved past the
     current month), the pill stays visible so the user can always bounce back
     to today's actual card. Inside the current month it shows only when the
     open card isn't today's. */
  const hasRealToday = coversDate({ startDate: getMeta().startDate, days: getRoster() });
  const show = dailyActive && (!hasRealToday || currentIndex !== realTodayIndex);
  if (pill.classList.contains('visible') !== show) {
    pill.classList.toggle('visible', show);
  }
  area = area; // silence unused
}

/* The expanded card is mid popIn/enter-animation (scale .88 + 6px translate) at
   the moment alignCurrentCard's rAF fires, so getBoundingClientRect includes a
   transform offset that skews the scroll target. Pause the card's animation for
   one layout read to get its true resting geometry. */
function restingRect(el) {
  const cs = getComputedStyle(el);
  if (!cs.animationName || cs.animationName === 'none') return el.getBoundingClientRect();
  const prev = el.style.animation;
  el.style.animation = 'none';
  const r = el.getBoundingClientRect();
  el.style.animation = prev;
  return r;
}

/* Scroll so the opened day's card sits just below the frosted header ('top'),
   or stays centered within the scroll area ('center', e.g. arrow navigation). */
function alignCurrentCard(area, mode) {
  const main = document.getElementById('dailyCardElement');
  if (!main) return;
  requestAnimationFrame(() => {
    const rect = restingRect(main);
    const areaRect = area.getBoundingClientRect();
    let target;
    if (mode === 'top') {
      /* Park the card just below the frosted header overlay. The scroller has
         overflow-anchor: none, so scroll anchoring can't shift the content
         between this rect read and the scroll below. */
      const c = document.querySelector('.app-container');
      const v = c ? parseInt(getComputedStyle(c).getPropertyValue('--header-h'), 10) : NaN;
      const headerH = Number.isFinite(v) && v >= 72 ? v : 94;
      target = area.scrollTop + (rect.top - areaRect.top) - (headerH + 12);
    } else {
      target = area.scrollTop + (rect.top - areaRect.top) - (area.clientHeight - rect.height) / 2;
    }
    area.scrollTo({ top: Math.max(0, Math.round(target)), behavior: 'smooth' });
  });
}

export function openScrollDay(idx) {
  const roster = getRoster();
  idx = parseInt(idx, 10);
  /* Browser-synthesized click from a just-finished touch (e.g. after switching to
     the daily view) can land on a mini card and fire this handler — ignore it. */
  if (Date.now() < suppressScrollDayUntil) return;
  if (isNaN(idx) || idx < 0 || idx >= roster.length || idx === currentIndex) return;
  triggerHaptic(25);
  const area = document.getElementById('daily-render-area');
  const mini = area.querySelector(`.upcoming-card[data-index="${idx}"]`);
  const main = document.getElementById('dailyCardElement');

  /* Aim the collapse/expand at the tapped mini card so the big card appears to
     grow out of the small row (and shrink back into it on the way out). */
  if (main && mini) {
    const mr = main.getBoundingClientRect();
    const ir = mini.getBoundingClientRect();
    const cx = mr.width ? ((ir.left + ir.width / 2) - mr.left) / mr.width * 100 : 50;
    const cy = mr.height ? ((ir.top + ir.height / 2) - mr.top) / mr.height * 100 : 50;
    mountOrigin = { x: Math.max(0, Math.min(100, cx)), y: Math.max(0, Math.min(100, cy)) };
    /* Set the transform-origin on the OUTGOING card as well so the collapse and
       the incoming expand both pivot around the same spot. */
    main.style.setProperty('--iso-origin-x', mountOrigin.x + '%');
    main.style.setProperty('--iso-origin-y', mountOrigin.y + '%');
  } else {
    mountOrigin = null;
  }
  if (main) main.classList.add('iso-collapse');
  if (mini) mini.classList.add('iso-lift');
  expandMountFor = idx;
  /* Keep the collapse → expand handoff tight: render the new card as soon as the
     collapse has visually started so the whole morph feels instant. */
  setTimeout(() => {
    currentIndex = idx;
    /* Grow the new card out of the tapped mini row, then pull it up so it becomes
       the FIRST card in view, parked just under the frosted header — the same
       'top' treatment the Today pill applies. */
    renderScrollView();
    mountOrigin = null;
    const area2 = document.getElementById('daily-render-area');
    if (area2) alignCurrentCard(area2, 'top');
  }, 120);
}

export function renderScrollView(dir, align) {
  const area = document.getElementById('daily-render-area');
  if (!area) return;
  const roster = getRoster();
  const meta = getMeta();
  let html = '';
  if (isExpired() && !browsingNonCurrent) {
    html += `<div class="expired-card" onclick="window.__openRosterModal && window.__openRosterModal()">
        <div class="expired-title">✨ Next month's roster not loaded yet</div>
        <div class="expired-sub">${escapeHtml(meta.month)} ends soon. Generate the next roster.</div>
        <div class="expired-cta">Generate Roster</div>
      </div>`;
  }
  const mon = meta.month.split(' ')[0];
  let mounted = false;
  roster.forEach((d, i) => {
    if (i === currentIndex) {
      let mountCls = '';
      if (expandMountFor === i) {
        mountCls = ' iso-mount';
        expandMountFor = -1;
      } else if (dir === 'right' || dir === 'left') {
        mountCls = dir === 'right' ? ' enter-right' : ' enter-left';
      }
      mounted = true;
      html += mainCardHtml(d, mountCls);
      return;
    }
    const past = i < currentIndex ? ' scroll-past' : '';
    const noteMark = notesDB[d.date] ? '<span class="scroll-note" style="color:var(--text-main);font-size:18px;font-weight:900;">*</span>' : '';
    const sw = getSwaps()[d.date];
    const swapMark = sw ? `<span class="swap-badge">⇄</span>` : '';
    const m = mrinalDutyAt(i);
    const mTint = m ? m.tint : 'mrd-off';
    const mLabel = m ? m.label : '';
    html += `
      <div class="upcoming-card type-${d.type} ${mTint}${past}" data-index="${i}" data-date="${d.date}" onclick="window.__openScrollDay(${i})">
        <div class="upcoming-date-info">
          <span class="upcoming-day">${mon} ${d.date.split('-')[1]}${noteMark}${swapMark}</span>
          <span class="upcoming-weekday">• ${fullDayName(d.day)}</span>
        </div>
        <div class="upcoming-badge type-${d.type} ${mTint}">${escapeHtml(mLabel || d.title)}</div>
      </div>`;
  });
  area.innerHTML = html;
  if (mounted && mountOrigin) {
    const mainEl = document.getElementById('dailyCardElement');
    if (mainEl) {
      mainEl.style.setProperty('--iso-origin-x', mountOrigin.x + '%');
      mainEl.style.setProperty('--iso-origin-y', mountOrigin.y + '%');
    }
  }
  markPillOverflow(area);
  updateTodayPill(area);
  /* Only auto-scroll on deliberate navigation (dir = arrow/prev/next, align = top/center).
     Incidental re-renders (swap, note, alert timers) must NOT yank the user back to
     the current day's card — they can scroll up to the start of the month freely. */
  if (dir && !align) align = 'center';
  if (align) alignCurrentCard(area, align);
}

/* ---- MONTH VIEW ---- */

/* File name for the neighbour month: "Ashwin 2083" + dir → 208305.json / 208307.json. */
function neighborFileName(dir) {
  const p = parseMonthYear(getMeta().month);
  if (!p) return null;
  let year = Number(p.year), index = p.index;
  if (dir < 0) { index -= 1; if (index < 1) { index = 12; year -= 1; } }
  else { index += 1; if (index > 12) { index = 1; year += 1; } }
  return `${year}${String(index).padStart(2, '0')}.json`;
}

/* Enable/disable the calendar arrows based on which neighbour rosters actually exist
   in the GitHub /rosters/ folder. Re-evaluated on every month render. */
async function updateMonthNav() {
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  if (!prevBtn || !nextBtn) return;
  const prevName = neighborFileName(-1);
  const nextName = neighborFileName(1);
  let names = new Set();
  try { names = new Set((await listStoreRosters()).map((f) => f.name)); } catch (e) { /* offline → rely on the local cache below */ }
  /* Locally-cached rosters count too, so the arrows work offline after a sync. */
  Object.keys(getLocalRosterCache().files).forEach((n) => names.add(n));
  prevBtn.disabled = !prevName || !names.has(prevName);
  nextBtn.disabled = !nextName || !names.has(nextName);
}

/* Switch the whole app to the previous/next month's roster, but ONLY when that
   month's file exists in the GitHub /rosters/ folder (e.g. 208307.json). */
export async function switchMonth(dir) {
  const name = neighborFileName(dir);
  if (!name) { showToast('Could not identify this month'); return { ok: false, reason: 'unparseable' }; }
  try {
    const result = await loadRosterCachedOrStore(name);
    /* Land on a sensible day: today if the month covers it, otherwise the last day
       of a past month or the first day of a future one (recomputeToday clamps). */
    realTodayIndex = recomputeToday();
    currentIndex = realTodayIndex;
    browsingNonCurrent = !coversDate({ startDate: result.meta.startDate, days: result.days }, new Date());
    reRenderAll();
    updateTodayPill(document.getElementById('daily-render-area'));
    /* Re-sync duty alerts to the newly active month. */
    import('./alerts.js').then((m) => m.scheduleDutyAlerts()).catch(() => {});
    return { ok: true, name, meta: result.meta };
  } catch (e) {
    const msg = String(e && e.message || e);
    showToast(msg.includes('Invalid')
      ? `Can't open ${name}: ${msg.replace(/^Invalid roster [^:]+: /, '')}`
      : 'No roster for that month yet');
    return { ok: false, reason: msg.includes('Invalid') ? 'invalid' : 'fetch-failed', error: msg, name };
  }
}

export function renderMonthView() {
  const grid = document.getElementById('calendar-grid');
  const monthTitle = document.getElementById('cal-month-title');
  if (!grid) return;
  const meta = getMeta();
  const roster = getRoster();
  if (monthTitle) monthTitle.innerText = meta.month;
  let html = '';

  /* FIX: compute leading empty cells from startDate's weekday */
  const startDay = getStart().getDay();
  for (let i = 0; i < startDay; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  /* Today's Gregorian key — exactly ONE cell across all months may match. The old
     index==realTodayIndex test highlighted the first/last cell of adjacent months
     (index clamps), so prev/next months showed a fake "today". */
  const t = new Date();
  const todayKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const startMs = getStart().getTime();
  const DAY_MS = 86400000;

  roster.forEach((day, index) => {
    const hasNote = !!notesDB[day.date];
    const hasNoteClass = hasNote ? 'has-note' : '';
    const cell = new Date(startMs + index * DAY_MS);
    const cellKey = `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}-${String(cell.getDate()).padStart(2, '0')}`;
    const isTodayClass = cellKey === todayKey ? 'is-today' : '';
    const asteriskHtml = hasNote ? `<span class="note-asterisk" style="font-size:16px;font-weight:900;color:var(--text-main);">*</span>` : '';
    /* Calendar cells are tinted purely by Dr. Mrinal's duty placement —
       no text label needed under the date. */
    const m = mrinalDutyAt(index);
    const mTint = m ? m.tint : 'mrd-off';
    html += `
      <div class="cal-cell ${mTint} ${hasNoteClass} ${isTodayClass}"
           data-index="${index}" data-date="${day.date}"
           title="Dr. Mrinal — ${escapeHtml(m ? m.label : 'OFF')}"
           style="animation-delay: ${(index + startDay) * 18}ms;">
        <span class="cal-date">${day.date.split('-')[1]}${asteriskHtml}</span>
      </div>`;
  });
  grid.innerHTML = html;
  attachCalendarInteractions();
  /* Keep the prev/next arrows in sync with which roster files exist on GitHub. */
  updateMonthNav();
}

export function attachCalendarInteractions() {
  document.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
    let pressTimer = null;
    let isLongPress = false;
    let startX = 0;
    let startY = 0;
    let moved = false;

    const startPress = (e) => {
      isLongPress = false; moved = false;
      if (e.type === 'contextmenu') e.preventDefault();
      cell.classList.add('pressed');
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX; startY = touch.clientY;

      pressTimer = setTimeout(() => {
        isLongPress = true;
        triggerHaptic(50);
        openNoteModal(cell.dataset.date);
      }, 400);
    };

    const movePress = (e) => {
      if (!pressTimer) return;
      const touch = e.touches ? e.touches[0] : e;
      if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
        moved = true;
        clearTimeout(pressTimer); pressTimer = null;
        cell.classList.remove('pressed');
      }
    };

    const endPress = (e) => {
      cell.classList.remove('pressed');
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (!isLongPress && !moved) {
        triggerHaptic(20);
        /* Suppress the browser's synthesized mouse events / click for this touch.
           After jumpToDate() switches to the daily view, a ghost click would land
           on whatever card now sits under the finger and re-navigate to a random day. */
        if (e.type === 'touchend') e.preventDefault();
        jumpToDate(cell.dataset.index);
      }
    };

    cell.addEventListener('touchstart', startPress, { passive: true });
    cell.addEventListener('touchmove', movePress, { passive: true });
    cell.addEventListener('touchend', endPress);
    cell.addEventListener('mousedown', startPress);
    cell.addEventListener('mousemove', movePress);
    cell.addEventListener('mouseup', endPress);
    cell.addEventListener('contextmenu', e => e.preventDefault());
  });
}

/* ---- NOTES ---- */
export function openNoteModal(dateKey) {
  const meta = getMeta();
  activeNoteDate = dateKey;
  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.innerText = `${meta.month.split(' ')[0]} ${dateKey.split('-')[1]} Note`;
  const inputEl = document.getElementById('modal-input');
  if (inputEl) {
    inputEl.value = notesDB[dateKey] || '';
    inputEl.placeholder = 'Note…';
  }
  document.getElementById('note-modal').classList.add('show');
  setTimeout(() => { const i = document.getElementById('modal-input'); i && i.focus(); }, 300);
}

let activeNoteDate = null;
export function getActiveNoteDate() { return activeNoteDate; }

export function closeNoteModal() {
  triggerHaptic(20);
  document.getElementById('note-modal').classList.remove('show');
  activeNoteDate = null;
}

export function saveNote() {
  triggerHaptic(40);
  const val = document.getElementById('modal-input')?.value.trim();
  if (val === '') { delete notesDB[activeNoteDate]; }
  else { notesDB[activeNoteDate] = val; }
  saveNotes();
  closeNoteModal();
  renderMonthView();
  renderScrollView();
}

/* ---- NAVIGATION ---- */
export function changeDay(step) {
  const roster = getRoster();
  const newIndex = currentIndex + step;
  if (newIndex < 0 || newIndex >= roster.length) {
    triggerHaptic([12, 40, 12]);
    return;
  }
  triggerHaptic(30);
  if (!document.getElementById('view-daily').classList.contains('active')) {
    currentIndex = newIndex;
    switchTab('daily');
    return;
  }
  /* Slide the outgoing card out, then bring the new one in from the other side. */
  const main = document.getElementById('dailyCardElement');
  const exitCls = step > 0 ? 'exit-left' : 'exit-right';
  const enterDir = step > 0 ? 'right' : 'left';
  if (main) {
    main.classList.add(exitCls);
    setTimeout(() => {
      currentIndex = newIndex;
      renderScrollView(enterDir);
    }, 180);
  } else {
    currentIndex = newIndex;
    renderScrollView(enterDir);
  }
}

export async function goToday() {
  triggerHaptic(35);

  /* Browsing a different month (calendar ⇄ arrows): first return to the month that
     actually contains today, so the Today pill always lands on today's real card. */
  if (!coversDate({ startDate: getMeta().startDate, days: getRoster() }) && todayAnchor) {
    try {
      await loadRosterCachedOrStore(todayAnchor.name);
      realTodayIndex = recomputeToday();
      currentIndex = realTodayIndex;
      browsingNonCurrent = false;
      reRenderAll();
      updateTodayPill(document.getElementById('daily-render-area'));
      import('./alerts.js').then((m) => m.scheduleDutyAlerts()).catch(() => {});
    } catch (e) {
      /* Anchor unavailable — stay where we are; the basic jump below still applies. */
    }
  }

  if (currentIndex === realTodayIndex) {
    /* Already on today's card — still make sure it reveals at the top. */
    const area = document.getElementById('daily-render-area');
    if (area) alignCurrentCard(area, 'top');
    return;
  }
  if (!document.getElementById('view-daily').classList.contains('active')) {
    currentIndex = realTodayIndex;
    switchTab('daily');
    return;
  }
  const main = document.getElementById('dailyCardElement');
  const exitCls = realTodayIndex > currentIndex ? 'exit-left' : 'exit-right';
  const enterDir = realTodayIndex > currentIndex ? 'right' : 'left';
  if (main) {
    main.classList.add(exitCls);
    setTimeout(() => {
      currentIndex = realTodayIndex;
      renderScrollView(enterDir, 'top');
    }, 180);
  } else {
    currentIndex = realTodayIndex;
    renderScrollView(enterDir, 'top');
  }
}

export function jumpToDate(index) {
  currentIndex = parseInt(index, 10);
  switchTab('daily');
}

export function switchTab(tabId, dir) {
  triggerHaptic(30);
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  document.getElementById(`view-${tabId}`)?.classList.add('active');
  document.getElementById(`nav-${tabId}`)?.classList.add('active');

  if (tabId === 'daily') {
    /* Brief window where a browser-synthesized click (ghost tap) may hit a card —
       swallow it so it can't re-navigate to a seemingly random day. */
    suppressScrollDayUntil = Date.now() + 300;
    renderScrollView(undefined, 'top');
    updateTodayPill(document.getElementById('daily-render-area'));
  }
  if (tabId === 'month') {
    const pill = document.getElementById('today-pill');
    if (pill) pill.classList.remove('visible');
    renderMonthView();
    if (document.querySelector('.cal-cell.is-today')) {
      setTimeout(() => {
        const todayCell = document.querySelector('.cal-cell.is-today');
        if (todayCell) todayCell.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 120);
    }
  }
  if (dir === 'left' || dir === 'right') animateTabEnter(tabId, dir);
}

function animateTabEnter(tabId, dir) {
  const el = document.getElementById(`view-${tabId}`);
  if (!el) return;
  el.classList.remove('tab-enter-left', 'tab-enter-right');
  void el.offsetWidth;
  el.classList.add(dir === 'left' ? 'tab-enter-right' : 'tab-enter-left');
  setTimeout(() => el.classList.remove('tab-enter-left', 'tab-enter-right'), 340);
}

export function renderDailyView() {
  renderScrollView();
}

/* Remember the roster month that actually contains today — the anchor the Today
   pill bounces back to after the user browses other months with the calendar
   arrows. Re-captured on every re-render, so it always tracks the current month. */
function captureTodayAnchor() {
  try {
    const meta = getMeta();
    if (coversDate({ startDate: meta.startDate, days: getRoster() })) {
      const name = rosterFileName(meta);
      if (name) {
        todayAnchor = { name, meta: { month: meta.month, startDate: meta.startDate }, days: getRoster() };
      }
    }
  } catch (e) { /* non-fatal */ }
}

/* ---- RE-RENDER AFT drafter.changes ---- */
export function reRenderAll() {
  captureTodayAnchor();
  renderScrollView();
  renderMonthView();
}

export function initRendering() {
  captureTodayAnchor();
  realTodayIndex = recomputeToday();
  currentIndex = realTodayIndex;
  renderScrollView(undefined, 'top');
  renderMonthView();
  updateTodayPill(document.getElementById('daily-render-area'));
}