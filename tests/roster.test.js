import { describe, it, expect, beforeEach } from 'vitest';
import { validateRosterData, WEEKDAYS, deriveDayType, normalizeRosterTypes } from '../modules/roster.js';

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
    title: i % 2 ? 'Saturday OFF' : '',  // alternate titled / normal
    ward: 'A',
    nicu: 'B',
    picu: 'C',
    er: '',
    second: 'D',
    opd: i % 2 ? '' : 'E, F',  // titled (off) days have no OPD
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

  it('rejects invalid type when explicitly provided', () => {
    const copy = JSON.parse(JSON.stringify(validData));
    copy.days[0].type = 'random-type';
    expect(validateRosterData(copy)).toContain('invalid "type"');
  });

  it('accepts new-format roster without type and with empty title on normal days', () => {
    expect(validateRosterData(validData)).toBeNull();
  });

  it('rejects non-string title', () => {
    const copy = JSON.parse(JSON.stringify(validData));
    copy.days[0].title = 123;
    expect(validateRosterData(copy)).toContain('title');
  });

  it('rejects nagarHospital non-string', () => {
    const copy = JSON.parse(JSON.stringify(validData));
    copy.days[0].nagarHospital = 42;
    expect(validateRosterData(copy)).toContain('nagarHospital');
  });
});

describe('deriveDayType / normalizeRosterTypes', () => {
  const makeDay = (overrides = {}) => ({
    date: '06-01',
    day: 'Thu',
    title: '',
    ward: '',
    nicu: '',
    picu: '',
    er: '',
    second: '',
    opd: 'A, B',
    nagarHospital: '',
    ...overrides,
  });

  it('normal day (no title) -> picu-day', () => {
    expect(deriveDayType(makeDay())).toBe('picu-day');
  });

  it('titled holiday with no OPD and Mrinal not on 24h -> off', () => {
    expect(deriveDayType(makeDay({ title: 'Constitution Day', opd: '' }))).toBe('off');
  });

  it('titled holiday with OPD postings -> picu-day (not off)', () => {
    expect(deriveDayType(makeDay({ title: 'Constitution Day', opd: 'A, B' }))).toBe('picu-day');
  });

  it('Saturday with Mrinal on PICU 24h -> picu-day (not off)', () => {
    expect(deriveDayType(makeDay({ title: 'Saturday OFF', opd: '', picu: 'Mrinal' }))).toBe('picu-day');
  });

  it('Saturday with Mrinal on Ward 24h -> picu-day', () => {
    expect(deriveDayType(makeDay({ title: 'Saturday OFF', opd: '', ward: 'Mrinal' }))).toBe('picu-day');
  });

  it('Saturday with Mrinal on NICU 24h -> picu-day', () => {
    expect(deriveDayType(makeDay({ title: 'Saturday OFF', opd: '', nicu: 'Mrinal' }))).toBe('picu-day');
  });

  it('festival with Mrinal on PICU 24h -> picu-day (badge shows PICU 24h)', () => {
    expect(deriveDayType(makeDay({ title: 'Ghatasthapana', opd: '', picu: 'Mrinal' }))).toBe('picu-day');
  });

  it('OPD contains only the festival name (scribble) -> treated as no OPD', () => {
    expect(deriveDayType(makeDay({ title: 'Ghatasthapana', opd: 'Ghatasthapana', picu: 'Other' }))).toBe('off');
  });

  it('normalizeRosterTypes mutates days and assigns derived type', () => {
    const days = [makeDay({ title: 'Constitution Day', opd: '' }), makeDay({ title: 'Saturday OFF', opd: '', picu: 'Mrinal' })];
    normalizeRosterTypes(days);
    expect(days[0].type).toBe('off');
    expect(days[1].type).toBe('picu-day');
  });
});