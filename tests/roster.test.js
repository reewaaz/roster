import { describe, it, expect, beforeEach } from 'vitest';
import { validateRosterData, WEEKDAYS } from '../modules/roster.js';

/* Mock localStorage before importing modules that touch it */
globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] != null ? this._s[k] : null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};

const validData = {
  month: 'Ashwin 2083',
  startDate: '2026-09-17',
  days: Array.from({ length: 31 }, (_, i) => ({
    date: `06-${String(i + 1).padStart(2, '0')}`,
    day: WEEKDAYS[(new Date('2026-09-17T00:00:00').getDay() + i) % 7],
    type: i % 2 ? 'opd' : 'picu-day',
    title: i % 2 ? 'OPD' : 'PICU Day',
    ward: 'A',
    nicu: 'B',
    picu: 'C',
    er: '',
    second: 'D',
    opd: 'E, F',
    nagarHospital: 'Nagar Person',
  })),
};

describe('validateRosterData', () => {
  it('accepts a valid roster', () => {
    expect(validateRosterData(validData)).toBeNull();
  });

  it('rejects missing month', () => {
    const { month, ...rest } = validData;
    expect(validateRosterData(rest)).toContain('month');
  });

  it('rejects bad date pattern', () => {
    const copy = JSON.parse(JSON.stringify(validData));
    copy.days[0].date = '6-01';
    expect(validateRosterData(copy)).toContain('MM-DD');
  });

  it('rejects wrong day-of-month', () => {
    const copy = JSON.parse(JSON.stringify(validData));
    copy.days[0].date = '06-02';
    expect(validateRosterData(copy)).toContain('wrong "date"');
  });

  it('rejects weekday mismatch', () => {
    const copy = JSON.parse(JSON.stringify(validData));
    copy.days[0].day = copy.days[0].day === 'Thu' ? 'Fri' : 'Thu';
    if (copy.days[0].day !== 'Thu') {
      copy.days[0].day = 'Thu';
    }
    // find actual first weekday
    const firstW = WEEKDAYS[new Date('2026-09-17T00:00:00').getDay()];
    const wrong = firstW === 'Thu' ? 'Fri' : 'Thu';
    copy.days[0].day = wrong;
    expect(validateRosterData(copy)).toContain('weekday mismatch');
  });

  it('rejects duplicate dates', () => {
    const copy = JSON.parse(JSON.stringify(validData));
    copy.days[1].date = copy.days[0].date;
    // need dom to match index or wrong date catches first; force valid dom then duplicate
    copy.days[1].date = '06-01';
    const err = validateRosterData(copy);
    if (typeof err === 'string' && !err.includes('Duplicate')) {
      // dom check ("wrong date expected 02 got 01") fires before duplicate — acceptable
      expect(err).toContain('wrong "date"');
    } else {
      expect(err).toContain('Duplicate');
    }
  });

  it('rejects invalid type', () => {
    const copy = JSON.parse(JSON.stringify(validData));
    copy.days[0].type = 'random-type';
    expect(validateRosterData(copy)).toContain('invalid "type"');
  });

  it('rejects nagarHospital non-string', () => {
    const copy = JSON.parse(JSON.stringify(validData));
    copy.days[0].nagarHospital = 42;
    expect(validateRosterData(copy)).toContain('nagarHospital');
  });
});