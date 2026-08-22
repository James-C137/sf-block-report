import { describe, expect, it } from 'vitest';
import { aggregateSpots } from '../src/model/aggregate';
import type { Incident } from '../src/model/types';

const inc = (lng: number, lat: number, category = '', intersection = ''): Incident => ({
  day: '2026-08-01', category, neighborhood: '', intersection, lng, lat,
});

describe('spot aggregation', () => {
  it('dedupes by exact coordinate and tallies categories + intersection', () => {
    const spots = aggregateSpots([
      inc(-122.41, 37.78, 'Larceny Theft', 'MISSION ST \\ 24TH ST'),
      inc(-122.41, 37.78, 'Larceny Theft'),
      inc(-122.41, 37.78, 'Assault'),
      inc(-122.42, 37.76, 'Burglary'),
    ]);
    expect(spots).toHaveLength(2);
    const hot = spots.find((s) => s.n === 3)!;
    expect(hot.cats).toEqual({ 'Larceny Theft': 2, Assault: 1 });
    expect(hot.intersection).toBe('MISSION ST \\ 24TH ST');
  });

  it('w follows sqrt(n/ref) with the ref floored at 4 for all-unique sets', () => {
    /* 300 unique singles: percentile ref = 1, floored to 4 → w = sqrt(1/4) = 0.5 */
    const singles = Array.from({ length: 300 }, (_, i) => inc(-122.4 - i * 1e-4, 37.76 + i * 1e-4));
    const spots = aggregateSpots(singles);
    for (const s of spots) expect(s.w).toBeCloseTo(0.5, 3);
  });

  it('repeat addresses build toward full ink; the percentile spot saturates at 1', () => {
    const feats: Incident[] = [];
    const at = (lng: number, lat: number, n: number): void => {
      for (let i = 0; i < n; i++) feats.push(inc(lng, lat));
    };
    for (let i = 0; i < 290; i++) at(-122.4 - i * 1e-4, 37.76 + i * 1e-4, 1);
    at(-122.41, 37.783, 5);
    at(-122.414, 37.784, 12);
    at(-122.412, 37.781, 30);
    at(-122.4136, 37.7825, 60);
    const spots = aggregateSpots(feats);
    const ws = spots.map((s) => s.w).sort((a, b) => b - a);
    expect(ws[0]).toBe(1); /* 60-report spot */
    expect(ws[1]).toBe(1); /* 30 = the p99.5 ref itself */
    expect(ws[2]).toBeCloseTo(Math.sqrt(12 / 30), 2);
    expect(ws[3]).toBeCloseTo(Math.sqrt(5 / 30), 2);
    expect(ws[ws.length - 1]).toBeCloseTo(Math.sqrt(1 / 30), 2);
  });

  it('empty input yields no spots', () => {
    expect(aggregateSpots([])).toEqual([]);
  });
});
