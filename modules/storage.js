const GIST_ID_KEY = 'mrinalGistId';
const GIST_TOKEN_KEY = 'mrinalGistToken';
const GIST_LAST_SYNC_KEY = 'mrinalLastSync';
const DEFAULT_GIST_FILE = 'roster-history.json';

let cachedHistory = null;

export function getToken() {
  return localStorage.getItem(GIST_TOKEN_KEY) || '';
}

export function setToken(token) {
  const t = (token || '').trim();
  if (t) localStorage.setItem(GIST_TOKEN_KEY, t);
  else localStorage.removeItem(GIST_TOKEN_KEY);
}

export function getGistId() {
  return localStorage.getItem(GIST_ID_KEY) || '';
}

export function setGistId(id) {
  if (id) localStorage.setItem(GIST_ID_KEY, id);
  else localStorage.removeItem(GIST_ID_KEY);
}

export function getLastSync() {
  return localStorage.getItem(GIST_LAST_SYNC_KEY) || '';
}

function monthKeyFromMeta(meta) {
  const name = meta.month.split(' ').join('_').replace(/[^a-zA-Z0-9_]/g, '');
  return name || 'roster';
}

async function gistFetch(url, opts) {
  const token = getToken();
  if (!token) throw new Error('No GitHub PAT configured. Add it in Settings → Cloud Sync.');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    let msg = `GitHub error ${res.status}`;
    try { const j = await res.json(); if (j.message) msg = j.message; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

/* Load the persistent history gist: { rosters: { "Ashwin 2083": {meta, days} }, prevDay: {...} } */
export async function loadHistory() {
  if (cachedHistory) return cachedHistory;
  const gistId = getGistId();
  const fallback = { rosters: {}, prevDay: null };
  if (!gistId) return fallback;
  try {
    const g = await gistFetch(`https://api.github.com/gists/${gistId}`);
    const file = g.files && g.files[DEFAULT_GIST_FILE];
    if (file && file.content) {
      try {
        cachedHistory = typeof file.content === 'string' ? JSON.parse(file.content) : file.content;
      } catch (e) { cachedHistory = fallback; }
    } else {
      cachedHistory = fallback;
    }
  } catch (e) {
    console.warn('loadHistory failed', e);
    cachedHistory = fallback;
  }
  return cachedHistory;
}

export async function saveHistory(history) {
  const token = getToken();
  if (!token) throw new Error('No GitHub PAT configured.');
  cachedHistory = history;
  const content = JSON.stringify(history, null, 2);
  const payload = {
    files: { [DEFAULT_GIST_FILE]: { content } },
    description: 'Duty Roster History — Dr. Mrinal',
  };
  let gistId = getGistId();
  if (gistId) {
    await gistFetch(`https://api.github.com/gists/${gistId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    const created = await gistFetch('https://api.github.com/gists', {
      method: 'POST',
      body: JSON.stringify({ ...payload, public: false }),
    });
    setGistId(created.id);
    gistId = created.id;
  }
  localStorage.setItem(GIST_LAST_SYNC_KEY, new Date().toISOString());
  return gistId;
}

/* Store current month's roster into history and push previous month's last day as prevDay */
export async function persistCurrentRoster(metaVal, daysVal) {
  const history = await loadHistory();
  const key = metaVal.month;
  history.rosters = history.rosters || {};
  history.rosters[key] = { meta: metaVal, days: daysVal };
  history.prevDay = { meta: metaVal, day: daysVal[daysVal.length - 1] };
  await saveHistory(history);
  const gistId = getGistId();
  return { key, gistId };
}

/* Fetch a previous month's roster by its month+year string. Falls back to history.prevDay. */
export async function fetchMonthRoster(monthName) {
  const history = await loadHistory();
  if (history.rosters && history.rosters[monthName]) return history.rosters[monthName].days;
  if (history.prevDay) return [history.prevDay.day];
  return null;
}

export function monthKeyFromMetaExport() {
  return localStorage.getItem(GIST_LAST_SYNC_KEY);
}