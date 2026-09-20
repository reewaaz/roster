/* Built-in roster shipped as a JS module (not .json) so the app also runs when
   static hosts like GitHub Pages serve the raw source tree — browsers reject
   native `.json` ES-module imports ("MIME type ... is not a JavaScript module"). */
import defaultRosterData from './roster-data.js';

export const ROSTER_KEY = 'mrinalRosterData';
export const VALID_TYPES = ['picu-day', 'picu-24', 'opd', 'er-day', 'off', 'post-off'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const FIELDS = [
  { key: 'ward', label: 'Ward/ER 24h' },
  { key: 'nicu', label: 'NICU 24h' },
  { key: 'picu', label: 'PICU 24h' },
  { key: 'er', label: 'ER Day' },
  { key: 'second', label: '2nd On Call' },
  { key: 'opd', label: 'OPD' },
  { key: 'nagarHospital', label: 'Nagar Hospital' },
];

export const TYPE_COLORS = {
  'picu-day': { bg: '#f6efff', tx: '#9a5cf0' },
  'picu-24': { bg: '#ffe9ec', tx: '#f4617f' },
  'opd': { bg: '#e6f4ff', tx: '#32a4e1' },
  'er-day': { bg: '#fff3e2', tx: '#f0823f' },
  'off': { bg: '#e3fbef', tx: '#2fb872' },
  'post-off': { bg: '#f4f7fb', tx: '#7c8ea5' },
};

export const ROSTER_TEMPLATE = `You are converting a hospital duty roster image into JSON. Output ONLY valid JSON, no markdown, no extra text.

Use exactly this shape:
{
  "month": "<Month Name> <Year e.g. 2083>",
  "startDate": "<YYYY-MM-DD of the first day of the roster>",
  "days": [
    {
      "date": "MM-DD",
      "day": "Sun | Mon | Tue | Wed | Thu | Fri | Sat",
      "title": "<\"\" for a normal working day | \"Saturday OFF\" | <Festival Name>>",
      "ward": "Person on Ward/ER 24h duty or empty string",
      "nicu": "Person on NICU 24h duty or empty string",
      "picu": "Person on PICU 24h duty or empty string",
      "er": "Person on ER Day duty or empty string",
      "second": "2nd on call or empty string",
      "opd": "Comma-separated OPD names or empty string",
      "nagarHospital": "Person posted at Nagar Hospital or empty string"
    }
  ]
}

RULES
- The roster image may have columns: Date, Day, Ward/ER, NICU 24h, PICU 24h, ER Day, 2nd On Call, OPD, Nagar Hospital.
- Map Ward/ER column -> "ward", NICU 24h -> "nicu", PICU 24h -> "picu", ER Day -> "er", 2nd On Call -> "second", OPD -> "opd", Nagar Hospital -> "nagarHospital".
- date uses the month number and day number you see in the image, e.g. "06-01".
- day must match the real weekday of that calendar date.
- There is NO "type" field — never output one. The app derives it automatically.
- "title" describes the DAY, not a shift:
  - a normal working day gets the empty string "";
  - a Saturday gets "Saturday OFF";
  - a public holiday or festival written in the image (e.g. Constitution Day, Ghatasthapana, Dashain) keeps that exact name as the title.
- Holidays (Saturday or festival) have no OPD postings — set "opd" to "" on those days.
- Empty cells become "". OPD names are a comma + space separated list.
- Keep every name spelled exactly as it appears in the image. Do not invent or correct names.
- Include EVERY day of the month in order, starting at day 01.

EXAMPLE — follow this exact shape (replace the values):
{
  "month": "Ashwin 2083",
  "startDate": "2026-09-17",
  "days": [
    {
      "date": "06-01",
      "day": "Thu",
      "title": "",
      "ward": "Nischal",
      "nicu": "Krishna",
      "picu": "Aayoush",
      "er": "Salina",
      "second": "Prerana",
      "opd": "Saurav Singh, Prerana, Sinda, Pritha, Devaki",
      "nagarHospital": ""
    },
    {
      "date": "06-03",
      "day": "Sat",
      "title": "Constitution Day",
      "ward": "Deepmala",
      "nicu": "Subas",
      "picu": "Devaki",
      "er": "",
      "second": "Dilip",
      "opd": "",
      "nagarHospital": ""
    }
  ]
}`;

let rosterMeta = { month: 'Ashwin 2083', startDate: '2026-09-17' };
let roster = defaultRosterData.days.slice();

export function loadRoster() {
  try {
    const raw = JSON.parse(localStorage.getItem(ROSTER_KEY));
    if (raw && raw.meta && raw.meta.month && raw.meta.startDate && Array.isArray(raw.days) && raw.days.length > 0) {
      rosterMeta = raw.meta;
      roster = normalizeRosterTypes(raw.days);
      return { meta: rosterMeta, days: roster };
    }
  } catch (e) { /* ignore */ }
  rosterMeta = { month: defaultRosterData.meta.month, startDate: defaultRosterData.meta.startDate };
  roster = normalizeRosterTypes(defaultRosterData.days.slice());
  return { meta: rosterMeta, days: roster };
}

export function getMeta() { return rosterMeta; }
export function getRoster() { return roster; }
export function getStart() { return new Date(rosterMeta.startDate + 'T00:00:00'); }
export function getEnd() {
  return new Date(getStart().getTime() + (roster.length - 1) * 86400000);
}
export function isExpired() { return new Date() > getEnd(); }

export function recomputeToday() {
  const diffTime = new Date() - getStart();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(Math.min(diffDays, roster.length - 1), 0);
}

export function dateKeyToIndex(dateKey) {
  return roster.findIndex((d) => d.date === dateKey);
}

export function saveRoster(meta, days) {
  localStorage.setItem(ROSTER_KEY, JSON.stringify({ meta, days: normalizeRosterTypes(days) }));
  rosterMeta = meta;
  roster = days;
}

export function resetToDefault() {
  localStorage.removeItem(ROSTER_KEY);
  rosterMeta = { month: defaultRosterData.meta.month, startDate: defaultRosterData.meta.startDate };
  roster = normalizeRosterTypes(defaultRosterData.days.slice());
  return { meta: rosterMeta, days: roster };
}

export function validateRosterData(data) {
  if (!data || typeof data !== 'object') return 'Top level of the JSON must be an object.';
  if (typeof data.month !== 'string' || !data.month.trim()) return 'Missing "month" (e.g. "Ashwin 2083").';
  if (typeof data.startDate !== 'string' || isNaN(new Date(data.startDate).getTime())) return 'Missing or invalid "startDate" (use YYYY-MM-DD, e.g. "2026-09-17").';
  if (!Array.isArray(data.days) || data.days.length < 28 || data.days.length > 31) {
    return `"days" must be an array of 28–31 day objects (got ${data.days ? data.days.length : 'none'}).`;
  }
  const base = new Date(data.startDate + 'T00:00:00');
  const seen = {};
  for (let i = 0; i < data.days.length; i++) {
    const d = data.days[i];
    const label = `Day ${i + 1}`;
    if (!d || typeof d !== 'object') return `${label}: not an object.`;
    if (typeof d.date !== 'string' || !/^\d{2}-\d{2}$/.test(d.date)) return `${label}: "date" must be MM-DD (e.g. "06-01").`;
    const dom = parseInt(d.date.split('-')[1], 10);
    if (dom !== i + 1) return `${label}: wrong "date" — expected day-of-month "${('0' + (i + 1)).slice(-2)}", got "${dom}".`;
    if (seen[d.date]) return `Duplicate date ${d.date}.`;
    seen[d.date] = true;
    const expectedWeekday = WEEKDAYS[(base.getDay() + i) % 7];
    if (typeof d.day !== 'string' || !WEEKDAYS.includes(d.day)) return `${label}: invalid "day" "${d.day}".`;
    if (d.day !== expectedWeekday) return `${label}: weekday mismatch — the calendar says ${expectedWeekday}, you wrote ${d.day}.`;
    if (d.type !== undefined && !VALID_TYPES.includes(d.type)) return `${label}: invalid "type" "${d.type}" (allowed: ${VALID_TYPES.join(', ')}).`;
    if (d.title !== undefined && typeof d.title !== 'string') return `${label}: "title" must be a string.`;
    if (d.nagarHospital !== undefined && typeof d.nagarHospital !== 'string') return `${label}: "nagarHospital" must be a string.`;
  }
  return null;
}

/* 24h handover — who was on PICU 24h the previous day (supports cross-month via prevDayData) */
export function findHandoverName(index, prevRosterExtra = null) {
  const targetVersion = roster.slice();
  for (let i = index - 1; i >= 0; i--) {
    if (targetVersion[i] && (targetVersion[i].type === 'picu-24' || targetVersion[i].picu)) return targetVersion[i].picu;
  }
  if (prevRosterExtra && Array.isArray(prevRosterExtra)) {
    for (let i = prevRosterExtra.length - 1; i >= 0; i--) {
      if (prevRosterExtra[i] && (prevRosterExtra[i].type === 'picu-24' || prevRosterExtra[i].picu)) return prevRosterExtra[i].picu;
    }
  }
  return null;
}

export function getHandover(idx) {
  if (idx <= 0) return null;
  return findHandoverName(idx);
}

function personIn(v, person) {
  if (!v || !String(v).trim() || v === '—') return false;
  return String(v).split(/,\s*/).some((s) => s.trim() === person);
}

/* Roster JSONs no longer store a per-day "type" — it is derived. A day counts
   as an OFF day only when ALL of these hold:
     • it carries a holiday/festival title (Saturday or otherwise), and
     • it has no OPD postings that day (holidays have none — unless the source
       scribbled the festival name into the OPD cell instead of people), and
     • Dr. Mrinal is not on a 24h duty (Ward/ER, NICU or PICU).
   Every other day is a normal working day. */
export function deriveDayType(d) {
  if (!d) return 'picu-day';
  const hasTitle = !!(d.title && String(d.title).trim());
  if (!hasTitle) return 'picu-day';
  if (hasOpdPostings(d)) return 'picu-day';
  if (personIn(d.ward, 'Mrinal') || personIn(d.nicu, 'Mrinal') || personIn(d.picu, 'Mrinal')) return 'picu-day';
  return 'off';
}

/* True when a day's OPD cell lists actual people. A holiday file sometimes
   repeats the festival name into the OPD column instead of names — that is not
   an OPD posting. */
function hasOpdPostings(d) {
  const v = d ? d.opd : null;
  if (!v || !String(v).trim() || v === '—') return false;
  const t = d.title ? String(d.title).trim().toUpperCase() : '';
  return String(v).split(/,\s*/).some((n) => {
    const name = n.trim().toUpperCase();
    return name && name !== t;
  });
}

/* Backfill a derived day type onto every day (mutates in place, returns the
   array). New-format rosters omit "type" entirely; older files carry a legacy
   one we always recompute so every consumer sees the same rule. */
export function normalizeRosterTypes(days) {
  if (!Array.isArray(days)) return days;
  for (const d of days) {
    if (d && typeof d === 'object') d.type = deriveDayType(d);
  }
  return days;
}

/* The duty a person actually performs on a given day, using the same rules as
   the reference print2/print3 matrices:
     1. any explicit placement wins — ward/nicu/picu = 24h, er = Day ER, opd,
        nagarHospital, second (a second-on-call person who also holds a main
        role reports hasSecond);
     2. else the day after a 24h shift is "postOff" (recovery day) — for day 1 of
        a month this looks at the previous month's last day (prevDayExtra, e.g.
        the last day of 208305.json) so Mrinal is Post 24h OFF when she was on a
        24h shift the night before the new month started;
     3. else off days (Saturdays / public holidays / JSON post-off) are "off";
     4. else a resident defaults to "picuDay" (Day PICU duty).
   Shared by the day cards, month calendar and the print matrices. */
export function dayRole(roster, i, person, prevDayExtra = null) {
  const d = roster[i];
  if (!d) return { key: 'off', hasSecond: false };
  const fields = ['picu', 'nicu', 'ward', 'er', 'opd', 'nagarHospital', 'second'];
  const roles = [];
  for (const f of fields) {
    if (personIn(d[f], person)) roles.push(f);
  }
  if (roles.length) {
    return { key: roles[0], hasSecond: roles.includes('second') && roles[0] !== 'second' };
  }
  const prev = i > 0 ? roster[i - 1] : (prevDayExtra || null);
  if (prev && (personIn(prev.ward, person) || personIn(prev.nicu, person) || personIn(prev.picu, person))) {
    return { key: 'postOff', hasSecond: false };
  }
  const dayType = (d.type && VALID_TYPES.includes(d.type)) ? d.type : deriveDayType(d);
  if (dayType === 'off' || dayType === 'post-off') return { key: 'off', hasSecond: false };
  return { key: 'picuDay', hasSecond: false };
}

/* Get the person(s) on duty for an off/post-off day (all non-empty roles) */
export function getOffDutyPeople(day) {
  const roles = [];
  const map = [
    { key: 'ward', label: 'Ward/ER' },
    { key: 'nicu', label: 'NICU' },
    { key: 'picu', label: 'PICU' },
    { key: 'er', label: 'ER Day' },
    /* 'second' is intentionally omitted here — the day card already shows the
       "2nd On Call" person in the bottom .second-call block, so listing it again
       under "People On Duty" would duplicate the same information. */
    { key: 'nagarHospital', label: 'Nagar Hospital' },
  ];
  for (const m of map) {
    const v = day[m.key];
    if (v && String(v).trim() && v !== '—') roles.push({ label: m.label, value: v });
  }
  return roles;
}