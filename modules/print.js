import { getRoster, getMeta, getStart } from './roster.js';
import { triggerHaptic, escapeHtml } from './utils.js';

/* Print generator — three A4-landscape styles:
   'simple' : daily list (one day per row, one column per duty)   — like print1
   'name'   : matrix, whole team as rows                          — like print2
   'date'   : matrix, whole team as vertical columns             — like print3
   Layouts / typography follow the reference print1/2/3 files. */

export const PRINT_STYLES = [
  { id: 'simple', label: 'Simple', icon: '🗓️', sub: 'Daily list — one row per day, a column per duty' },
  { id: 'name', label: 'Name first', icon: '👥', sub: 'Matrix by person — rows are the whole team' },
  { id: 'date', label: 'Date first', icon: '📅', sub: 'Matrix by date — columns are the whole team' },
];

/* notes map injected from rendering module */
let notesDB = {};
export function setNotesDB(notes) { notesDB = notes || {}; }

const MONTH_ABB = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CHUNK = 11; /* days per page */

function adLabel(start, i) {
  const d = new Date(start.getTime() + i * 86400000);
  return `${MONTH_ABB[d.getMonth()]} ${d.getDate()}`;
}

function isMe(name) { return /mrinal/i.test(name || ''); }

function personSpan(name, cls) {
  const me = isMe(name) ? ' pr-me' : '';
  return `<span class="${cls}${me}">${escapeHtml(name)}</span>`;
}

/* A duty field holds a single name, or (opd) a comma-separated list. */
function namesInline(v, cls = 'pr-p') {
  if (!v || !String(v).trim() || v === '—') return '';
  return String(v).split(/,\s*/).map((n) => n.trim()).filter(Boolean).map((n) => personSpan(n, cls)).join('');
}

/* ------------------------------------------------------------------ */
/* SIMPLE — daily list, rows = days (print1 format)                   */
/* ------------------------------------------------------------------ */
const SIMPLE_COLS = [
  { key: 'ward', cls: 'pr-ward', label: 'Ward / ER', small: '24 hr' },
  { key: 'nicu', cls: 'pr-nicu', label: 'NICU', small: '24 hr' },
  { key: 'picu', cls: 'pr-picu', label: 'PICU', small: '24 hr' },
  { key: 'er', cls: 'pr-er', label: 'ER day', small: '' },
  { key: 'second', cls: 'pr-second', label: '2nd on call', small: '' },
  { key: 'opd', cls: 'pr-opd', label: 'OPD team', small: '' },
];

function simpleRow(d, i, start) {
  const off = d.type === 'off' || d.type === 'post-off';
  const noteMark = notesDB[d.date] ? '<span class="pr-note">*</span>' : '';
  const offBadge = off ? ' <i class="pr-offb">OFF</i>' : '';
  const nagar = d.nagarHospital && String(d.nagarHospital).trim() && d.nagarHospital !== '—'
    ? `<div class="pr-nagar"><b>Nagar Hospital</b>${personSpan(d.nagarHospital)}</div>` : '';
  const cells = SIMPLE_COLS.map((c) => {
    if (c.key === 'opd') {
      const names = namesInline(d.opd);
      return `<td class="${c.cls}">${names ? `<div class="pr-names">${names}</div>` : ''}${nagar}</td>`;
    }
    const names = namesInline(d[c.key]);
    const empty = c.key === 'er' ? '<span class="pr-none">–</span>' : '';
    return `<td class="${c.cls}">${names ? `<div class="pr-names">${names}</div>` : `<div class="pr-names">${empty}</div>`}</td>`;
  }).join('');
  return `
    <tr class="${off ? 'pr-off' : ''}${i === simpleToday ? ' pr-today' : ''}">
      <th class="pr-date"><div class="pr-dl"><b>${escapeHtml(d.date)}${noteMark}</b><span>${escapeHtml(d.day)}</span></div><div class="pr-ad">${adLabel(start, i)}${offBadge}</div></th>
      ${cells}
    </tr>`;
}

let simpleToday = -1;

export function printRoster(todayIdx, style = 'simple') {
  triggerHaptic(40);
  const el = document.getElementById('print-area');
  if (!el) return;
  const roster = getRoster();
  const meta = getMeta();
  const start = getStart();
  simpleToday = typeof todayIdx === 'number' ? todayIdx : -1;

  let html;
  if (style === 'name') html = renderNameFirst(roster, meta, start);
  else if (style === 'date') html = renderDateFirst(roster, meta, start);
  else html = renderSimple(roster, meta, start);

  el.innerHTML = html;
  setTimeout(() => window.print(), 120);
}

function pageHeader(meta, from, to, pageNo, totalPages) {
  return `
    <header class="pr-top">
      <div>
        <div class="pr-title">Pediatrics Duty Roster</div>
        <div class="pr-sub">${escapeHtml(meta.month)} · KIOCH-Kathmandu Children’s Hospital</div>
      </div>
      <div class="pr-range"><b>${escapeHtml(from)} → ${escapeHtml(to)}</b><span>Page ${pageNo} of ${totalPages}</span></div>
    </header>`;
}

function simpleHead() {
  return `<thead><tr>
      <th class="pr-hd pr-hdate">Date</th>
      ${SIMPLE_COLS.map((c) => `<th class="pr-hd pr-h${c.cls.replace('pr-', '-')}">${c.label}${c.small ? `<small>${c.small}</small>` : ''}</th>`).join('')}
    </tr></thead>`;
}

function renderSimple(roster, meta, start) {
  const total = Math.ceil(roster.length / CHUNK);
  const pages = [];
  for (let p = 0; p < total; p++) {
    const from = p * CHUNK;
    const to = Math.min(from + CHUNK - 1, roster.length - 1);
    const rows = [];
    for (let i = from; i <= to; i++) rows.push(simpleRow(roster[i], i, start));
    pages.push(`<section class="pr-page">
      ${pageHeader(meta, roster[from].date, roster[to].date, p + 1, total)}
      <table class="pr-sim">
        <colgroup><col class="pr-cd">${SIMPLE_COLS.map(() => '<col>').join('')}</colgroup>
        ${simpleHead()}
        <tbody>${rows.join('')}</tbody>
      </table>
    </section>`);
  }
  return pages.join('');
}

/* ------------------------------------------------------------------ */
/* MATRIX — per-person, per-day cells (print2 + print3 share this)    */
/* ------------------------------------------------------------------ */
const ROLE_ORDER = ['picu', 'nicu', 'ward', 'er', 'opd', 'nagarHospital', 'second'];

const ROLE_CELL = {
  ward:   { label: '24h Ward/ER', line: ['24h', 'Ward'], cls: 'k-ward24' },
  nicu:   { label: '24h NICU',    line: ['24h', 'NICU'], cls: 'k-nicu24' },
  picu:   { label: '24h PICU',    line: ['24h', 'PICU'], cls: 'k-picu24' },
  er:     { label: 'Day ER',      line: ['Day', 'ER'],   cls: 'k-dayer' },
  opd:    { label: 'OPD',         line: ['OPD'],         cls: 'k-opd' },
  nagarHospital: { label: 'Nagar Hosp', line: ['Nagar'], cls: 'k-nagar' },
  second: { label: '2nd call',    line: ['2nd', 'call'], cls: 'k-second' },
  postOff: { label: 'Post-duty',  line: ['Post', 'duty'], cls: 'k-post' },
  off:    { label: 'OFF',         line: ['OFF'],         cls: 'k-off' },
};

function wordMatches(v, person) {
  if (!v || !String(v).trim() || v === '—') return false;
  return String(v).split(/,\s*/).map((s) => s.trim()).includes(person);
}

/* One coloured chip per person-day: a duty role wins, then the recovery
   "Post-duty" after a 24h shift, then OFF on off days (residents only). */
function dayCell(roster, i, person, isResident) {
  const d = roster[i];
  const roles = [];
  for (const f of ROLE_ORDER) {
    if (d[f] != null && wordMatches(d[f], person)) roles.push(f);
  }
  if (roles.length) {
    const mainF = roles[0];
    const hasSecond = roles.includes('second') && mainF !== 'second';
    return { cell: ROLE_CELL[mainF], tag: hasSecond ? '2nd' : '' };
  }
  const prev = roster[i - 1];
  if (prev && (wordMatches(prev.ward, person) || wordMatches(prev.nicu, person) || wordMatches(prev.picu, person))) {
    return { cell: ROLE_CELL.postOff, tag: '' };
  }
  if (d.type === 'off' || d.type === 'post-off') {
    return isResident ? { cell: ROLE_CELL.off, tag: '' } : null;
  }
  return null;
}

function collectPeople(roster) {
  const stats = {};
  const add = (p, field) => {
    if (!p || !String(p).trim() || p === '—') return;
    stats[p] = stats[p] || { n: 0, second: 0 };
    stats[p].n += 1;
    if (field === 'second') stats[p].second += 1;
  };
  roster.forEach((d) => {
    ['ward', 'nicu', 'picu', 'er', 'second', 'nagarHospital'].forEach((f) => add(d[f], f));
    if (d.opd && String(d.opd).trim()) String(d.opd).split(/,\s*/).forEach((n) => add(n.trim(), 'opd'));
  });
  const residents = [];
  const consultants = [];
  Object.keys(stats).forEach((n) => {
    const s = stats[n];
    /* On-call consultants = people who mostly hold the "2nd call" role, or
       barely appear outside full-time rotation this month. */
    const onCall = s.n < 8 || (s.second / s.n >= 0.4);
    (onCall ? consultants : residents).push(n);
  });
  const sortWithOwner = (arr) => {
    arr.sort((a, b) => a.localeCompare(b));
    const i = arr.findIndex(isMe);
    if (i > 0) arr.unshift(arr.splice(i, 1)[0]);
  };
  sortWithOwner(residents);
  sortWithOwner(consultants);
  return { residents, consultants };
}

function legend() {
  const chips = [
    ['k-picuday', 'PICU Day'], ['k-dayer', 'Day ER'], ['k-opd', 'OPD'],
    ['k-picu24', '24h PICU'], ['k-nicu24', '24h NICU'], ['k-ward24', '24h Ward/ER'],
    ['k-post', 'Post-duty'], ['k-nagar', 'Nagar Hospital'], ['k-off', 'Sat/Holiday OFF'], ['k-second', '2nd call'],
  ].map(([cls, txt]) => `<span class="pr-chip ${cls}">${txt}</span>`).join('');
  return `<div class="pr-legend">${chips}<span class="pr-lg"><i class="pr-t2 pr-t2-legend">2nd</i><span class="pr-lg-note">also second on call</span></span></div>`;
}

function matrixCellHtml(name, i, isResident, roster, twoLine) {
  const c = dayCell(roster, i, name, isResident);
  if (!c) return '<td class="pr-c blank"></td>';
  const me = isMe(name) ? ' pr-me' : '';
  const has2 = c.tag ? ' pr-has2' : '';
  const inner = twoLine
    ? `<div class="pr-tx">${c.cell.line.map((l) => `<b>${l}</b>`).join('')}</div>${c.tag ? '<i class="pr-t2">2nd</i>' : ''}`
    : `<span>${c.cell.label}</span>${c.tag ? '<i class="pr-t2">2nd</i>' : ''}`;
  return `<td class="pr-c ${c.cell.cls}${me}${has2}">${inner}</td>`;
}

/* ------------------------------------------------------------------ */
/* NAME FIRST — whole team as rows (print2 format)                     */
/* ------------------------------------------------------------------ */
function renderNameFirst(roster, meta, start) {
  const { residents, consultants } = collectPeople(roster);
  const people = residents.concat(consultants);
  const total = Math.ceil(roster.length / CHUNK);
  const pages = [];
  for (let p = 0; p < total; p++) {
    const from = p * CHUNK;
    const to = Math.min(from + CHUNK - 1, roster.length - 1);
    const heads = [];
    for (let i = from; i <= to; i++) {
      const d = roster[i];
      const off = d.type === 'off' || d.type === 'post-off';
      heads.push(`<th class="pr-dh${off ? ' pr-offday' : ''}${i === simpleToday ? ' pr-today' : ''}"><b>${escapeHtml(d.date)}</b><span>${escapeHtml(d.day)}</span><small>${adLabel(start, i)}</small></th>`);
    }
    const dayCols = to - from + 1;
    const rows = [];
    people.forEach((name, idx) => {
      /* Insert the group divider IN ADDITION to the person rows — replacing the
         row here would swallow the first consultant (idx === residents.length). */
      if (idx === residents.length) {
        rows.push(`<tr class="pr-grprow"><th class="pr-grp" colspan="${dayCols + 1}"><span>Consultants &amp; on-call</span></th></tr>`);
      }
      const isRes = idx < residents.length;
      const cells = [];
      for (let i = from; i <= to; i++) cells.push(matrixCellHtml(name, i, isRes, roster, false));
      const nmCls = `pr-nm${isMe(name) ? ' pr-nm-me' : ''}`;
      rows.push(`<tr><th class="${nmCls}">Dr. ${escapeHtml(name)}</th>${cells.join('')}</tr>`);
    });
    pages.push(`<section class="pr-page">
      ${pageHeader(meta, roster[from].date, roster[to].date, p + 1, total)}
      <table class="pr-mx">
        <colgroup><col class="pr-c0">${new Array(dayCols).fill('<col>').join('')}</colgroup>
        <thead><tr><th class="pr-corner2">Who’s where</th>${heads.join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <footer class="pr-foot">${legend()}</footer>
    </section>`);
  }
  return pages.join('');
}

/* ------------------------------------------------------------------ */
/* DATE FIRST — whole team as vertical columns (print3 format)         */
/* ------------------------------------------------------------------ */
function renderDateFirst(roster, meta, start) {
  const { residents, consultants } = collectPeople(roster);
  const total = Math.ceil(roster.length / CHUNK);
  const gapCol = consultants.length ? '<col class="pr-cg">' : '';
  const gapCell = consultants.length ? '<th class="pr-gapcol"></th>' : '';
  const pages = [];
  for (let p = 0; p < total; p++) {
    const from = p * CHUNK;
    const to = Math.min(from + CHUNK - 1, roster.length - 1);
    const pn = (name) => `<th class="pr-pn${isMe(name) ? ' pr-me' : ''}"><div>${escapeHtml(name)}</div></th>`;
    const headRow = `<tr class="pr-grhead"><th></th><th colspan="${residents.length}">Residents</th>${gapCell}<th colspan="${consultants.length}">Consultants &amp; on-call</th></tr>
      <tr><th class="pr-corner">Date</th>${residents.map(pn).join('')}${gapCell}${consultants.map(pn).join('')}</tr>`;
    const rows = [];
    for (let i = from; i <= to; i++) {
      const d = roster[i];
      const off = d.type === 'off' || d.type === 'post-off';
      const cellsNew = residents.map((n) => matrixCellHtml(n, i, true, roster, true)).join('');
      const cellsCons = consultants.map((n) => matrixCellHtml(n, i, false, roster, true)).join('');
      rows.push(`<tr class="${i === simpleToday ? 'pr-today' : ''}">
        <th class="pr-dt${off ? ' pr-offday' : ''}"><div class="pr-dl"><b>${escapeHtml(d.date)}</b><span>${escapeHtml(d.day)}</span><small>${adLabel(start, i)}</small></div></th>
        ${cellsNew}${gapCell}${cellsCons}
      </tr>`);
    }
    pages.push(`<section class="pr-page">
      ${pageHeader(meta, roster[from].date, roster[to].date, p + 1, total)}
      <table class="pr-mx">
        <colgroup><col class="pr-c0">${new Array(residents.length).fill('<col>').join('')}${gapCol}${consultants.length ? new Array(consultants.length).fill('<col>').join('') : ''}</colgroup>
        <thead>${headRow}</thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      <footer class="pr-foot">${legend()}</footer>
    </section>`);
  }
  return pages.join('');
}