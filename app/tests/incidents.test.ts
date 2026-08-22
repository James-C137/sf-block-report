import { describe, expect, it } from 'vitest';
import { incidentsUrl, makeFakeIncidents, parseRows, reportWindow, sfDayISO } from '../src/data/incidents';
import { INCIDENT_CAP, WINDOW_DAYS } from '../src/config';

describe('report window (SF calendar)', () => {
  it('spans exactly WINDOW_DAYS ending yesterday, SF time', () => {
    /* 2026-08-22 18:00 UTC = 11:00 PDT */
    const now = Date.UTC(2026, 7, 22, 18, 0, 0);
    const win = reportWindow(now);
    expect(win.endDayExclusive).toBe('2026-08-22');
    expect(win.endDay).toBe('2026-08-21');
    expect(win.startDay).toBe('2026-07-23');
    expect(win.days).toHaveLength(WINDOW_DAYS);
    expect(win.days[0]).toBe('2026-07-23');
    expect(win.days[WINDOW_DAYS - 1]).toBe('2026-08-21');
  });

  it('handles UTC-midnight straddle: late UTC evening is still the same SF day', () => {
    /* 2026-08-23 05:00 UTC = 2026-08-22 22:00 PDT */
    expect(sfDayISO(0, Date.UTC(2026, 7, 23, 5, 0, 0))).toBe('2026-08-22');
  });

  it('crosses the DST fall-back boundary without duplicating or skipping days', () => {
    /* Nov 15 2026: the window spans the Nov 1 fall-back */
    const win = reportWindow(Date.UTC(2026, 10, 15, 20, 0, 0));
    expect(new Set(win.days).size).toBe(WINDOW_DAYS);
    expect(win.days.every((d, i, a) => i === 0 || d > a[i - 1]!)).toBe(true);
  });
});

describe('socrata query', () => {
  it('builds the one capped, newest-first, geocoded-only request', () => {
    const win = reportWindow(Date.UTC(2026, 7, 22, 18, 0, 0));
    const url = incidentsUrl(win);
    expect(url).toContain('wg3w-h783.json');
    expect(url).toContain(encodeURIComponent(`incident_date >= '2026-07-23'`));
    expect(url).toContain(encodeURIComponent(`incident_date < '2026-08-22'`));
    expect(url).toContain(encodeURIComponent('latitude IS NOT NULL'));
    expect(url).toContain(`$limit=${INCIDENT_CAP}`);
    expect(url).toContain(encodeURIComponent('incident_datetime DESC'));
    expect(url).toContain(encodeURIComponent('intersection'));
  });
});

describe('row parsing', () => {
  it('parses once at the boundary, dropping bad coords and out-of-bbox rows', () => {
    const out = parseRows([
      { incident_date: '2026-08-01T00:00:00.000', incident_category: 'Assault', latitude: '37.78', longitude: '-122.41' },
      { incident_date: '2026-08-01T00:00:00.000', latitude: 'nope', longitude: '-122.41' },
      { incident_date: '2026-08-01T00:00:00.000', latitude: '0', longitude: '0' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ day: '2026-08-01', category: 'Assault', lng: -122.41, lat: 37.78 });
  });
});

describe('simulated fallback', () => {
  it('is deterministic, in-bbox, and dated inside the window', () => {
    const win = reportWindow(Date.UTC(2026, 7, 22, 18, 0, 0));
    const a = makeFakeIncidents(win);
    const b = makeFakeIncidents(win);
    expect(a.length).toBeGreaterThan(1500);
    expect(a).toEqual(b);
    for (const i of a.slice(0, 50)) {
      expect(win.days).toContain(i.day);
    }
  });
});
