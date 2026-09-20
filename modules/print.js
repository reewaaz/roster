import { getRoster, getMeta, getStart, TYPE_COLORS, VALID_TYPES } from './roster.js';
import { triggerHaptic, escapeHtml } from './utils.js';
import { getSwaps } from './swaps.js';

function typeLabel(t) {
  return t === 'picu-day' ? 'PICU Day'
    : t === 'picu-24' ? 'PICU 24h'
    : t === 'opd' ? 'OPD'
    : t === 'er-day' ? 'Day ER'
    : t === 'off' ? 'Off'
    : 'Post-24h';
}

function dutyDetailsHtml(d) {
  const swaps = getSwaps();
  const map = [
    { key: 'ward', label: 'ER/Ward' },
    { key: 'nicu', label: 'NICU' },
    { key: 'picu', label: 'PICU' },
    { key: 'er', label: 'Day ER' },
    { key: 'second', label: '2nd Call' },
    { key: 'nagarHospital', label: 'Nagar' },
  ];
  const items = [];
  for (const m of map) {
    const v = d[m.key];
    if (!v || !String(v).trim() || v === '—') continue;
    const sw = swaps[d.date] && swaps[d.date].field === m.key
      ? ` <i class="pc-sw">was ${escapeHtml(swaps[d.date].original)}</i>` : '';
    items.push(`<span class="pc-item"><i class="pc-detail-label">${m.label}</i> <b>${escapeHtml(v)}</b>${sw}</span>`);
  }
  if (d.opd && String(d.opd).trim()) {
    items.push(`<span class="pc-item"><i class="pc-detail-label">OPD</i> <b>${escapeHtml(d.opd)}</b></span>`);
  }
  return items.join(' ');
}

export function printRoster(realTodayIndex) {
  triggerHaptic(40);
  const el = document.getElementById('print-area');
  if (!el) return;
  const roster = getRoster();
  const total = roster.length;
  const totalDays = getStart();
  const monthName = getMeta().month;
  const todayIdx = realTodayIndex;

  const firstHalf = Math.ceil(total / 2);
  const chunks = [[0, firstHalf - 1], [firstHalf, total - 1]];

  const legend = VALID_TYPES.map(t => {
    const c = TYPE_COLORS[t] || TYPE_COLORS.opd;
    return `<span class="pl-chip" style="background:${c.bg}; color:${c.tx}; border-color:${c.tx};">${typeLabel(t)}</span>`;
  }).join('');

  el.innerHTML = chunks.map(([from, to], ci) => {
    const rows = [];
    for (let i = from; i <= to; i++) {
      const d = roster[i];
      const c = TYPE_COLORS[d.type] || TYPE_COLORS.opd;
      const dateNum = d.date.split('-')[1];
      const isToday = i === todayIdx;
      const rowCls = `pt-${d.type}${d.day === 'Sat' || d.day === 'Sun' ? ' weekend' : ''}${isToday ? ' today' : ''}`;
      rows.push(`
        <tr class="${rowCls}">
          <td class="pc-day" style="background:${c.bg}; color:${c.tx};">${dateNum}${notesDB[d.date] ? '<span class="pc-note">*</span>' : ''}</td>
          <td class="pc-weekday">${d.day}</td>
          <td class="pc-type" style="background:${c.bg}; color:${c.tx};">${escapeHtml(d.title)}</td>
          <td class="pc-details ${d.type}">${dutyDetailsHtml(d) || '—'}</td>
        </tr>`);
    }
    return `
      <div class="print-page">
        <div class="print-header">
          <div>
            <div class="print-title">${escapeHtml(monthName)} — Duty Roster</div>
            <div class="print-sub">Dr. Mrinal · Pediatric Department</div>
          </div>
          <div class="print-pageno">Page ${ci + 1} of 2<br>${mathDay(from, totalDays)} – ${mathDay(to, totalDays)}<br>${monthName.split(' ')[1] || ''}</div>
        </div>
        <div class="print-legend">${legend}</div>
        <table class="print-table">
          <colgroup><col style="width:9%"><col style="width:8%"><col style="width:15%"><col style="width:68%"></colgroup>
          <thead>
            <tr><th>Date</th><th>Day</th><th>Posting</th><th>Details</th></tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
        <div class="print-footer">Dr. Mrinal Duty App · Blue band = today · Shaded = weekend · * = note · Colors = duty palette</div>
      </div>`;
  }).join('');

  setTimeout(() => window.print(), 60);
}

function mathDay(index, start) {
  const d = new Date(start.getTime() + index * 86400000);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/* notes map injected from rendering module */
let notesDB = {};
export function setNotesDB(notes) { notesDB = notes || {}; }