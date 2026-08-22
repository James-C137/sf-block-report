import { describe, expect, it } from 'vitest';
import { applyFilters, isPristine } from '../src/model/filters';
import { aggregateSpots } from '../src/model/aggregate';
import type { Filters, Incident } from '../src/model/types';

const inc = (day: string, category: string, lng = -122.4, lat = 37.76): Incident => ({
  day, category, neighborhood: '', intersection: '', lng, lat,
});

const SET: Incident[] = [
  inc('2026-08-01', 'Larceny Theft'),
  inc('2026-08-02', 'Larceny Theft'),
  inc('2026-08-02', 'Assault'),
  inc('2026-08-05', 'Burglary'),
  inc('2026-08-05', ''), /* uncategorized */
];

describe('filters', () => {
  it('all-active + full window is the identity', () => {
    const f: Filters = { dateSel: null, activeCats: new Set(['Larceny Theft', 'Assault', 'Burglary']) };
    expect(applyFilters(SET, f)).toEqual(SET);
    expect(isPristine(f, 3)).toBe(true);
  });

  it('date window slices inclusively by ISO day', () => {
    const f: Filters = { dateSel: { from: '2026-08-02', to: '2026-08-05' }, activeCats: null };
    expect(applyFilters(SET, f)).toHaveLength(4);
    expect(isPristine(f, 3)).toBe(false);
  });

  it('category filter drops inactive categories', () => {
    const f: Filters = { dateSel: null, activeCats: new Set(['Assault']) };
    const out = applyFilters(SET, f);
    /* Assault + the uncategorized row (shown while ≥1 chip is active) */
    expect(out.map((i) => i.category).sort()).toEqual(['', 'Assault']);
  });

  it('uncategorized follows the all-chips state: empty set hides everything (§6.1)', () => {
    const f: Filters = { dateSel: null, activeCats: new Set() };
    expect(applyFilters(SET, f)).toHaveLength(0);
  });

  it('invariant: filtered count equals the sum of aggregated spot counts', () => {
    const f: Filters = { dateSel: { from: '2026-08-01', to: '2026-08-02' }, activeCats: new Set(['Larceny Theft']) };
    const filtered = applyFilters(SET, f);
    const spots = aggregateSpots(filtered);
    expect(spots.reduce((a, s) => a + s.n, 0)).toBe(filtered.length);
  });
});
