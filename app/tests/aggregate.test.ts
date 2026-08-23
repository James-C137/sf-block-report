import { describe, expect, it } from 'vitest';
import { aggregateAreas, aggregateNhoods, aggregateSpots } from '../src/model/aggregate';
import { DOTS_GRID_STEP } from '../src/config';
import type { Incident } from '../src/model/types';

const inc = (lng: number, lat: number, category = '', intersection = '', neighborhood = ''): Incident => ({
  day: '2026-08-01', category, neighborhood, intersection, lng, lat,
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

describe('LoD aggregation', () => {
  it('area level combines nearby intersections into one grid dot at their mean, named for the busiest member', () => {
    /* coords built from the step so the test survives grid retuning:
       three intersections inside one cell, one far away */
    const x0 = Math.ceil(-122.42 / DOTS_GRID_STEP) * DOTS_GRID_STEP;
    const y0 = Math.ceil(37.78 / DOTS_GRID_STEP) * DOTS_GRID_STEP;
    const at = (fx: number, fy: number): [number, number] => [x0 + fx * DOTS_GRID_STEP, y0 + fy * DOTS_GRID_STEP];
    const [ax, ay] = at(0.1, 0.55);
    const [bx, by] = at(0.3, 0.75);
    const [cx, cy] = at(0.2, 0.65);
    const near = [
      inc(ax, ay, 'Assault', 'A ST \\ B ST'),
      inc(ax, ay, 'Assault', 'A ST \\ B ST'),
      inc(bx, by, 'Robbery', 'C ST \\ D ST'),
      inc(cx, cy, '', ''),
    ];
    const far = inc(x0 + 5.5 * DOTS_GRID_STEP, y0 - 9.5 * DOTS_GRID_STEP, 'Burglary', 'E ST \\ F ST');
    const areas = aggregateAreas([...near, far]);
    expect(areas).toHaveLength(2);
    const hot = areas.find((s) => s.n === 4)!;
    expect(hot.kind).toBe('area');
    expect(hot.intersection).toBe('A ST \\ B ST'); /* 2 reports beats 1 */
    expect(hot.lng).toBeCloseTo((ax * 2 + bx + cx) / 4, 9);
    expect(hot.cats).toEqual({ Assault: 2, Robbery: 1 });
  });

  it('area level separates coordinates in different cells', () => {
    const spots = aggregateAreas([inc(-122.4001, 37.76), inc(-122.4001 - 1.5 * DOTS_GRID_STEP, 37.76)]);
    expect(spots).toHaveLength(2);
  });

  it('neighborhood level yields one dot per neighborhood, summed and mean-positioned', () => {
    const set = [
      inc(-122.41, 37.78, 'Assault', '', 'Tenderloin'),
      inc(-122.42, 37.78, 'Robbery', '', 'Tenderloin'),
      inc(-122.42, 37.76, 'Burglary', '', 'Mission'),
    ];
    const spots = aggregateNhoods(set);
    expect(spots).toHaveLength(2);
    const tl = spots.find((s) => s.intersection === 'Tenderloin')!;
    expect(tl.kind).toBe('nhood');
    expect(tl.n).toBe(2);
    expect(tl.lng).toBeCloseTo(-122.415, 9);
    expect(tl.cats).toEqual({ Assault: 1, Robbery: 1 });
  });

  it('reports without a neighborhood fall back to grid cells instead of vanishing', () => {
    const spots = aggregateNhoods([inc(-122.41, 37.78), inc(-122.5, 37.71)]);
    expect(spots).toHaveLength(2);
    expect(spots.reduce((a, s) => a + s.n, 0)).toBe(2);
  });

  it('every level conserves the report count and shares the weight law bounds', () => {
    const set = Array.from({ length: 120 }, (_, i) =>
      inc(-122.4 - (i % 10) * 3e-3, 37.75 + (i % 7) * 3e-3, 'Theft', '', i % 3 ? 'Mission' : 'Tenderloin'));
    for (const spots of [aggregateSpots(set), aggregateAreas(set), aggregateNhoods(set)]) {
      expect(spots.reduce((a, s) => a + s.n, 0)).toBe(set.length);
      for (const s of spots) {
        expect(s.w).toBeGreaterThan(0);
        expect(s.w).toBeLessThanOrEqual(1);
      }
    }
  });
});
