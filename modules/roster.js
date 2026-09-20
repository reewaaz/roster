/* Built-in roster shipped as a JS module (not .json) so the app also runs when
   static hosts like GitHub Pages serve the raw source tree — browsers reject
   native `.json` ES-module imports ("MIME type ... is not a JavaScript module"). */
import defaultRosterData from './roster-data.js';

export const ROSTER_KEY = 'mrinalRosterData';
export const VALID_TYPES = ['picu-day', 'picu-24', 'opd', 'er-day', 'off', 'post-off'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const FIELDS = [
  { key: 'ward', label: 'ER/Ward 24h' },
  { key: 'nicu', label: 'NICU 24h' },
  { key: 'picu', label: 'PICU 24h' },
  { key: 'er', label: 'Day ER' },
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
      "type": "picu-day | picu-24 | opd | er-day | off | post-off",
      "title": "PICU Day | 24hr PICU | OPD | Day ER | Saturday OFF | Post 24h OFF | <Festival Name>",
      "ward": "Person on ER/Ward 24h duty or empty string",
      "nicu": "Person on NICU 24h duty or empty string",
      "picu": "Person on PICU 24h duty or empty string",
      "er": "Person on Day ER or empty string",
      "second": "2nd on call or empty string",
      "opd": "Comma-separated OPD names or empty string",
      "nagarHospital": "Person posted at Nagar Hospital or empty string"
    }
  ]
}

RULES
- The roster image may have columns: Date, Day, ER/Ward, NICU 24h, PICU 24h, Day ER, 2nd On Call, OPD, Nagar Hospital.
- Map ER/Ward column -> "ward", NICU 24h -> "nicu", PICU 24h -> "picu", Day ER -> "er", 2nd On Call -> "second", OPD -> "opd", Nagar Hospital -> "nagarHospital".
- date uses the month number and day number you see in the image, e.g. "06-01".
- day must match the real weekday of that calendar date.
- For Saturday / public holidays use type "off". For a day after a 24h shift use type "post-off".
- If a festival or occasion is written instead of a shift label (e.g. Ghatasthapana, Dashain), keep it as the title.
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
      "type": "picu-day",
      "title": "PICU Day",
      "ward": "Nischal",
      "nicu": "Krishna",
      "picu": "Aayoush",
      "er": "Salina",
      "second": "Prerana",
      "opd": "Saurav Singh, Prerana, Sinda, Pritha, Devaki",
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
      roster = raw.days;
      return { meta: rosterMeta, days: roster };
    }
  } catch (e) { /* ignore */ }
  rosterMeta = { month: defaultRosterData.meta.month, startDate: defaultRosterData.meta.startDate };
  roster = defaultRosterData.days.slice();
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
  localStorage.setItem(ROSTER_KEY, JSON.stringify({ meta, days }));
  rosterMeta = meta;
  roster = days;
}

export function resetToDefault() {
  localStorage.removeItem(ROSTER_KEY);
  rosterMeta = { month: defaultRosterData.meta.month, startDate: defaultRosterData.meta.startDate };
  roster = defaultRosterData.days.slice();
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
    if (!VALID_TYPES.includes(d.type)) return `${label}: invalid "type" "${d.type}" (allowed: ${VALID_TYPES.join(', ')}).`;
    if (typeof d.title !== 'string' || !d.title.trim()) return `${label}: missing "title".`;
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

/* Get the person(s) on duty for an off/post-off day (all non-empty roles) */
export function getOffDutyPeople(day) {
  const roles = [];
  const map = [
    { key: 'ward', label: 'ER/Ward' },
    { key: 'nicu', label: 'NICU' },
    { key: 'picu', label: 'PICU' },
    { key: 'er', label: 'Day ER' },
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