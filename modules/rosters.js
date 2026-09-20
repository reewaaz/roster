/* GitHub-hosted monthly roster store.
   Each roster is stored as a JSON file named <BS-year><BS-month>.json on GitHub,
   e.g. 208306.json = year 2083, month 06 (Asoj / Ashwin). The user uploads one file
   per month (208306.json, 208307.json, … 208312.json, 208401.json, …) as the next
   month's roster becomes available; the app picks the stored roster that covers
   today's date and displays it.

   Reading a public repo needs no PAT. Writing / deleting uses the CONTENTS API with
   the PAT the user saves in Settings → Cloud Sync (needs "repo" scope for classic
   tokens, or fine-grained Contents "read and write"). */

import { saveRoster, validateRosterData, getMeta, getRoster, getStart, getEnd } from './roster.js';
import { getToken } from './storage.js';

const STORE_KEY = 'mrinalRosterStoreCfg';

const DEFAULT_STORE = {
  owner: 'reewaaz',
  repo: 'roster',
  branch: 'main',
  folder: 'rosters',
  apiBase: 'https://api.github.com',
  rawBase: 'https://raw.githubusercontent.com',
};

/* Nepali month name(s) → month index 1..12 (Asoj = Ashwin = 06). */
export const NEPALI_MONTHS = {
  'baisakh': 1, 'baishakh': 1, 'baisak': 1,
  'jestha': 2, 'jeth': 2,
  'asar': 3, 'ashad': 3, 'ashadh': 3,
  'shrawan': 4, 'sravan': 4,
  'bhadra': 5, 'bhadau': 5,
  'asoj': 6, 'ashwin': 6, 'ashvin': 6, 'ashoj': 6,
  'kartik': 7, 'kartick': 7,
  'mangsir': 8, 'mangshir': 8, 'marga': 8,
  'poush': 9, 'paush': 9,
  'magh': 10,
  'falgun': 11, 'phalgun': 11, 'fagun': 11,
  'chaitra': 12, 'chait': 12,
};

const DAY_MS = 86400000;
let listCache = { at: 0, items: [] };
const contentCache = new Map(); // name -> { at, data }

export function getStoreConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return { ...DEFAULT_STORE, ...(saved || {}) };
  } catch (e) {
    return { ...DEFAULT_STORE };
  }
}

/* Parse "Ashwin 2083" → { name, year, index } or null. */
export function parseMonthYear(monthStr) {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(String(monthStr || '').trim());
  if (!m) return null;
  const index = NEPALI_MONTHS[m[1].toLowerCase()];
  if (!index) return null;
  return { name: m[1], year: m[2], index };
}

/* File name for a roster: "Ashwin 2083" → "208306.json". Null when unparseable. */
export function rosterFileName(meta) {
  const p = parseMonthYear(meta && meta.month);
  return p ? `${p.year}${String(p.index).padStart(2, '0')}.json` : null;
}

export function isRosterFileName(name) {
  return /^\d{6}\.json$/.test(name || '');
}

/* Gregorian range a roster covers (from its own startDate + day count). */
export function rangeOf(data) {
  const start = new Date(data.startDate + 'T00:00:00').getTime();
  return { start, end: start + (data.days.length - 1) * DAY_MS };
}

export function coversDate(data, date = new Date()) {
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const r = rangeOf(data);
  return t >= r.start && t <= r.end;
}

function apiHeaders(json) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

/* CORS-safe headers for raw.githubusercontent.com. The raw CDN does not answer
   OPTIONS preflights for the custom X-GitHub-Api-Version header, so every browser
   fetch to raw shipped that header and died with "Failed to fetch". Raw requests
   therefore carry only safelisted headers (plus Authorization for private repos). */
function rawHeaders() {
  const headers = { Accept: 'application/vnd.github+json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/* List roster files in the store: the rosters/ folder first, then any NNNNNN.json
   sitting at the repo root (the user may upload either place). [{ name, sha, size, path }]. */
export async function listStoreRosters(force = false) {
  const now = Date.now();
  if (!force && listCache.at && now - listCache.at < 60000) return listCache.items;
  const cfg = getStoreConfig();
  try {
    const results = [];
    /* Folder (rosters/) — preferred. */
    try {
      const url = `${cfg.apiBase}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.folder}`;
      const res = await fetch(url, { headers: apiHeaders(false) });
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items)) {
          results.push(...items.filter((i) => i.type === 'file' && isRosterFileName(i.name))
            .map((i) => ({ name: i.name, sha: i.sha, size: i.size, path: i.path, root: false })));
        }
      }
    } catch (e) { console.warn('listStoreRosters folder failed', e); }
    /* Repo root — user may drop 208307.json next to index.html. */
    try {
      const url = `${cfg.apiBase}/repos/${cfg.owner}/${cfg.repo}/contents`;
      const res = await fetch(url, { headers: apiHeaders(false) });
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items)) {
          results.push(...items.filter((i) => i.type === 'file' && isRosterFileName(i.name))
            .map((i) => ({ name: i.name, sha: i.sha, size: i.size, path: i.path, root: true })));
        }
      }
    } catch (e) { console.warn('listStoreRosters root failed', e); }
    /* Dedupe by name, folder entries win. */
    const byName = new Map();
    for (const f of results) if (!byName.has(f.name) || !f.root) byName.set(f.name, f);
    const files = [...byName.values()];
    listCache = { at: now, items: files };
    return files;
  } catch (e) {
    console.warn('listStoreRosters failed', e);
    return [];
  }
}

/* Fetch + validate one roster file's JSON: { month, startDate, days }.
   Tries rosters/ first, then the repo root; for private repos (or when raw is
   blocked) falls back to the API contents endpoint, which honours the PAT the
   user saved in Settings → Cloud Sync. */
export async function fetchStoreRoster(name) {
  const cached = contentCache.get(name);
  if (cached && Date.now() - cached.at < 30 * 60000) return cached.data;
  const cfg = getStoreConfig();
  const candidates = [
    `${cfg.rawBase}/${cfg.owner}/${cfg.repo}/${cfg.branch}/${cfg.folder}/${encodeURIComponent(name)}`,
    `${cfg.rawBase}/${cfg.owner}/${cfg.repo}/${cfg.branch}/${encodeURIComponent(name)}`,
  ];
  let lastErr = null;
  for (const url of candidates) {
    const res = await fetch(url, { headers: rawHeaders() });
    if (res.status === 404) { lastErr = new Error(`Not found: ${name}`); continue; }
    if (!res.ok) { lastErr = new Error(`GitHub ${res.status}`); continue; }
    const data = await res.json();
    const validation = validateRosterData(data);
    if (validation) throw new Error(`Invalid roster ${name}: ${validation}`);
    contentCache.set(name, { at: Date.now(), data });
    return data;
  }
  /* Private repo fallback via the API (only when a PAT is configured). */
  if (getToken()) {
    const url = `${cfg.apiBase}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.folder}/${encodeURIComponent(name)}`;
    try {
      const res = await fetch(url, { headers: apiHeaders(false) });
      if (!res.ok) { lastErr = new Error(`GitHub ${res.status}`); }
      else {
        const j = await res.json();
        const text = atob(String(j.content || '').replace(/\s+/g, ''));
        const data = JSON.parse(text);
        const validation = validateRosterData(data);
        if (validation) throw new Error(`Invalid roster ${name}: ${validation}`);
        contentCache.set(name, { at: Date.now(), data });
        return data;
      }
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(`Invalid roster ${name}: JSON parse failed`);
      lastErr = e;
    }
  }
  throw lastErr || new Error(`Not found: ${name}`);
}

/* Best-effort fetch → null on failure (used by listers). */
export async function fetchStoreRosterSafe(name) {
  try { return await fetchStoreRoster(name); } catch (e) { return null; }
}

/* The stored roster whose date range covers today, or null. */
export async function findCurrentMonthRoster(date = new Date()) {
  const files = await listStoreRosters();
  if (!files.length) return null;
  for (const f of files) {
    const data = await fetchStoreRosterSafe(f.name);
    if (data && coversDate(data, date)) return { name: f.name, data };
  }
  return null;
}

/* Previous month roster: largest range ending before `meta`'s start (for day-1 handover). */
export async function findPreviousMonthRoster(meta) {
  const files = await listStoreRosters();
  if (!files.length) return null;
  const targetStart = new Date(meta.startDate + 'T00:00:00').getTime();
  let best = null;
  for (const f of files) {
    const data = await fetchStoreRosterSafe(f.name);
    if (!data) continue;
    const r = rangeOf(data);
    if (r.end < targetStart && (!best || r.end > best.range.end)) best = { name: f.name, data, range: r };
  }
  return best ? { name: best.name, data: best.data } : null;
}

function base64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

/* Resolve the sha of an existing file with the same name (null = new file). */
async function fileSha(name) {
  const cfg = getStoreConfig();
  const url = `${cfg.apiBase}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.folder}/${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: apiHeaders(false) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const j = await res.json();
  return j.sha || null;
}

/* Upload (create or update) a roster file. Requires a PAT with repo contents access. */
export async function uploadStoreRoster(fileName, data) {
  const cfg = getStoreConfig();
  if (!getToken()) throw new Error('No GitHub PAT configured. Add it in Settings → Cloud Sync.');
  const sha = await fileSha(fileName);
  const body = {
    message: `Upload roster ${fileName}${sha ? ' (update)' : ''}`,
    content: base64(JSON.stringify(data, null, 2)),
  };
  if (sha) body.sha = sha;
  const url = `${cfg.apiBase}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.folder}/${encodeURIComponent(fileName)}`;
  const res = await fetch(url, { method: 'PUT', headers: apiHeaders(true), body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `GitHub ${res.status}`;
    try { const j = await res.json(); if (j.message) msg = j.message; } catch (e) { /* keep status message */ }
    throw new Error(msg);
  }
  contentCache.delete(fileName);
  listCache = { at: 0, items: [] };
  return sha ? 'updated' : 'created';
}

/* Upload the CURRENT in-app roster, named from its month (e.g. Ashwin 2083 → 208306.json). */
export async function uploadCurrentRoster() {
  const meta = getMeta();
  const days = getRoster();
  const fileName = rosterFileName(meta);
  if (!fileName) throw new Error(`Cannot map "${meta.month}" to a roster file name.`);
  const data = { month: meta.month, startDate: meta.startDate, days };
  return { fileName, result: await uploadStoreRoster(fileName, data) };
}

/* Delete one roster file from the store. Requires a PAT. */
export async function deleteStoreRoster(fileName) {
  const cfg = getStoreConfig();
  if (!getToken()) throw new Error('No GitHub PAT configured. Add it in Settings → Cloud Sync.');
  const sha = await fileSha(fileName);
  if (!sha) throw new Error(`Not found in store: ${fileName}`);
  const url = `${cfg.apiBase}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.folder}/${encodeURIComponent(fileName)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: apiHeaders(true),
    body: JSON.stringify({ message: `Delete roster ${fileName}`, sha }),
  });
  if (!res.ok) {
    let msg = `GitHub ${res.status}`;
    try { const j = await res.json(); if (j.message) msg = j.message; } catch (e) { /* keep status message */ }
    throw new Error(msg);
  }
  contentCache.delete(fileName);
  listCache = { at: 0, items: [] };
  return true;
}

/* Best-effort cross-month handover: remember the previous month's last day so day 1
   of the current month can become "Post 24h OFF" when its person was on a 24h shift
   the previous night. Returns true when a previous roster was resolved. */
async function attachPreviousMonthData(data) {
  try {
    const prev = await findPreviousMonthRoster(data);
    if (prev) {
      window.__prevDayData = {
        meta: { month: prev.data.month, startDate: prev.data.startDate },
        day: prev.data.days[prev.data.days.length - 1],
      };
      return true;
    }
  } catch (e) { /* keep existing prevDay */ }
  return false;
}

/* Load a stored roster into the app (validate, save, set cross-month handover). */
export async function loadRosterFromStore(fileName) {
  const data = await fetchStoreRoster(fileName);
  // fetchStoreRoster already validates; normalize meta.
  const meta = { month: data.month.trim(), startDate: data.startDate };
  const wasCurrent = getMeta().month === meta.month;
  saveRoster(meta, data.days);
  // Cross-month handover for day 1: previous month's last day from the store.
  await attachPreviousMonthData(data);
  return { meta, days: data.days, loaded: true, wasCurrent };
}

/* Boot-time auto-select: the /rosters/ GitHub file for the current month is the
   authoritative source, so whenever a stored roster covers today and differs from
   the cached local roster, load the stored one. Swaps/notes are stored separately
   and survive the reload. Only when the store is unreachable/empty does the app
   keep whatever is cached locally (or the bundled fallback). */
export async function autoSelectRoster() {
  try {
    const local = getMeta();
    const localCovers = coversDate({ startDate: local.startDate, days: getRoster() });
    let storeCurrent = null;
    try { storeCurrent = await findCurrentMonthRoster(); } catch (e) { /* store unreachable */ }

    /* Can't reach the store or nothing stored → keep what we have. */
    if (!storeCurrent) return { loaded: false, reason: 'no-store' };

    /* The month's file is authoritative: adopt it whenever it differs from the
       cached local copy (a user-generated same-month roster no longer wins). */
    const localHash = JSON.stringify({ meta: { month: local.month, startDate: local.startDate }, days: getRoster() });
    const storeHash = JSON.stringify({ meta: { month: storeCurrent.data.month, startDate: storeCurrent.data.startDate }, days: storeCurrent.data.days });
    if (localHash === storeHash) {
      /* Keep the identical local copy, but still resolve cross-month handover so
         day 1 of a new month can show "Post 24h OFF" right after a fresh load. */
      const prevReady = await attachPreviousMonthData(storeCurrent.data);
      if (prevReady && window.__recomputeAndRender) window.__recomputeAndRender();
      return { loaded: false, reason: 'identical' };
    }

    const { meta, days } = await loadRosterFromStore(storeCurrent.name);
    if (window.__recomputeAndRender) window.__recomputeAndRender();
    return { loaded: true, name: storeCurrent.name, meta, days };
  } catch (e) {
    console.warn('autoSelectRoster failed', e);
    return { loaded: false, reason: 'error' };
  }
}

/* True when the built-in/loaded roster end date already passed (next month due). */
export function isCurrentRosterExpired() {
  return new Date() > getEnd();
}

export { getStart, getEnd };

/* Debug probes for the verification harness (harmless in production). */
if (typeof window !== 'undefined') {
  window.__storeDebug = {
    getConfig: getStoreConfig,
    list: () => listStoreRosters(true),
    fetch: fetchStoreRoster,
    current: () => findCurrentMonthRoster(),
    autoSelect: () => autoSelectRoster(),
    clearCaches: () => { contentCache.clear(); listCache = { at: 0, items: [] }; },
  };
}