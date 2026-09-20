import { describe, it, expect, beforeEach } from 'vitest';
import {
  NEPALI_MONTHS, parseMonthYear, rosterFileName, isRosterFileName, rangeOf, coversDate,
  getLocalRosterCache, cacheRosterLocally, removeLocalRoster,
  findPreviousMonthRoster, loadRosterCachedOrStore,
} from '../modules/rosters.js';

/* Mock localStorage (rosters.js reads it only inside getStoreConfig, not at import). */
globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] != null ? this._s[k] : null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
globalThis.window = globalThis;

beforeEach(() => {
  localStorage._s = {};
});

describe('parseMonthYear', () => {
  it('maps Ashwin / Asoj to month 06 of the given year', () => {
    expect(parseMonthYear('Ashwin 2083')).toEqual({ name: 'Ashwin', year: '2083', index: 6 });
    expect(parseMonthYear('Asoj 2083')).toEqual({ name: 'Asoj', year: '2083', index: 6 });
    expect(parseMonthYear('Kartik 2083')).toEqual({ name: 'Kartik', year: '2083', index: 7 });
    expect(parseMonthYear('Chaitra 2083')).toEqual({ name: 'Chaitra', year: '2083', index: 12 });
    expect(parseMonthYear('Baisakh 2084')).toEqual({ name: 'Baisakh', year: '2084', index: 1 });
  });

  it('returns null for unparseable month strings', () => {
    expect(parseMonthYear('Ashwin')).toBeNull();
    expect(parseMonthYear('2083')).toBeNull();
    expect(parseMonthYear('')).toBeNull();
    expect(parseMonthYear('Foo 2083')).toBeNull();
  });
});

describe('NEPALI_MONTHS', () => {
  it('has all twelve months with aliases', () => {
    expect(NEPALI_MONTHS['baisakh']).toBe(1);
    expect(NEPALI_MONTHS['baishakh']).toBe(1);
    expect(NEPALI_MONTHS['jestha']).toBe(2);
    expect(NEPALI_MONTHS['asar']).toBe(3);
    expect(NEPALI_MONTHS['shrawan']).toBe(4);
    expect(NEPALI_MONTHS['bhadra']).toBe(5);
    expect(NEPALI_MONTHS['asoj']).toBe(6);
    expect(NEPALI_MONTHS['ashwin']).toBe(6);
    expect(NEPALI_MONTHS['kartik']).toBe(7);
    expect(NEPALI_MONTHS['mangsir']).toBe(8);
    expect(NEPALI_MONTHS['poush']).toBe(9);
    expect(NEPALI_MONTHS['magh']).toBe(10);
    expect(NEPALI_MONTHS['falgun']).toBe(11);
    expect(NEPALI_MONTHS['chaitra']).toBe(12);
    const unique = new Set(Object.values(NEPALI_MONTHS));
    expect(unique.size).toBe(12);
    expect(Math.min(...unique)).toBe(1);
    expect(Math.max(...unique)).toBe(12);
  });
});

describe('rosterFileName', () => {
  it('builds YYYYMM.json file names from meta.month', () => {
    expect(rosterFileName({ month: 'Ashwin 2083', startDate: '2026-09-17' })).toBe('208306.json');
    expect(rosterFileName({ month: 'Kartik 2083', startDate: '2026-10-17' })).toBe('208307.json');
    expect(rosterFileName({ month: 'Baisakh 2084', startDate: '2027-04-14' })).toBe('208401.json');
  });

  it('returns null when the month cannot be mapped', () => {
    expect(rosterFileName({ month: 'Foobar 2083' })).toBeNull();
    expect(rosterFileName({})).toBeNull();
  });
});

describe('isRosterFileName', () => {
  it('accepts six-digit .json names', () => {
    expect(isRosterFileName('208306.json')).toBe(true);
    expect(isRosterFileName('208401.json')).toBe(true);
    expect(isRosterFileName('index.html')).toBe(false);
    expect(isRosterFileName('2083.json')).toBe(false);
  });
});

describe('rangeOf / coversDate', () => {
  const data = {
    month: 'Ashwin 2083',
    startDate: '2026-09-17',
    days: Array.from({ length: 31 }, (_, i) => ({ date: `06-${String(i + 1).padStart(2, '0')}` })),
  };

  it('computes an inclusive 31-day range', () => {
    const r = rangeOf(data);
    expect(r.end - r.start).toBe(30 * 86400000);
  });

  it('covers dates inside the range and rejects outliers', () => {
    expect(coversDate(data, new Date(2026, 8, 17))).toBe(true);  // Sep 17
    expect(coversDate(data, new Date(2026, 9, 16))).toBe(true);  // Oct 16
    expect(coversDate(data, new Date(2026, 9, 17))).toBe(true);  // Oct 17 (31st day)
    expect(coversDate(data, new Date(2026, 8, 16))).toBe(false); // day before
    expect(coversDate(data, new Date(2026, 9, 18))).toBe(false); // day after
  });
});

/* Build minimal (already-validated) day lists for cache tests. */
function days(n) {
  return Array.from({ length: n }, (_, i) => ({ date: `06-${String(i + 1).padStart(2, '0')}` }));
}

describe('local roster cache', () => {
  it('starts empty', () => {
    expect(getLocalRosterCache()).toEqual({ files: {} });
  });

  it('stores + reads + removes a validated roster copy', () => {
    const data = { month: 'Kartik 2083', startDate: '2026-10-18', days: days(30) };
    expect(cacheRosterLocally(data)).toBe('208307.json');
    const cache = getLocalRosterCache();
    expect(cache.files['208307.json'].month).toBe('Kartik 2083');
    expect(cache.files['208307.json'].startDate).toBe('2026-10-18');
    expect(cache.files['208307.json'].days).toHaveLength(30);
    expect(removeLocalRoster('208307.json')).toBe(true);
    expect(getLocalRosterCache().files['208307.json']).toBeUndefined();
    expect(removeLocalRoster('missing.json')).toBe(false);
  });

  it('findPreviousMonthRoster resolves from the local cache offline', async () => {
    cacheRosterLocally({ month: 'Shrawan 2083', startDate: '2026-08-17', days: days(31) }); // ends 2026-09-16
    const prev = await findPreviousMonthRoster({ month: 'Ashwin 2083', startDate: '2026-09-17' });
    expect(prev).not.toBeNull();
    expect(prev.name).toBe('208304.json');
    expect(prev.data.month).toBe('Shrawan 2083');
    expect(prev.data.days).toHaveLength(31);
  });

  it('loadRosterCachedOrStore returns the cached copy without network', async () => {
    cacheRosterLocally({ month: 'Kartik 2083', startDate: '2026-10-18', days: days(30) });
    const r = await loadRosterCachedOrStore('208307.json');
    expect(r.cached).toBe(true);
    expect(r.meta.month).toBe('Kartik 2083');
    expect(r.days).toHaveLength(30);
    expect(JSON.parse(localStorage.getItem('mrinalRosterData')).meta.month).toBe('Kartik 2083');
  });
});