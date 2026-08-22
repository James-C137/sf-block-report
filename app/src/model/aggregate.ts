/* Reports pile up at repeated addresses (the dataset geocodes to
   intersections), so the dots overlay draws ONE spot per location. The
   LoD ladder reuses the same machinery with coarser keys: exact
   coordinate → grid cell (~a few blocks, standing in for a major
   intersection) → neighborhood. Every level shares the weight law:
   normalize against the 99.5th-percentile member of ITS OWN level
   (floored at 4 so an all-unique set doesn't render every dot at full
   strength), then sqrt. Positions of combined dots are the mean of
   their member reports, so a cluster's dot sits where its reports do. */

import { DOTS_GRID_STEP, SPOT_REF_FLOOR, SPOT_REF_PERCENTILE } from '../config';
import type { Incident, Spot, SpotKind } from './types';

interface Bucket {
  spot: Spot;
  sumLng: number;
  sumLat: number;
  /* per-bucket intersection tally, so a combined dot names its most
     reported member intersection */
  xTally: Map<string, number>;
}

function aggregate(
  incidents: ReadonlyArray<Incident>,
  kind: SpotKind,
  keyOf: (i: Incident) => string,
  labelOf?: (i: Incident) => string,
): Spot[] {
  const byKey = new Map<string, Bucket>();
  for (const inc of incidents) {
    const key = keyOf(inc);
    let b = byKey.get(key);
    if (!b) {
      b = {
        spot: { lng: 0, lat: 0, n: 0, w: 0, intersection: labelOf?.(inc) ?? '', cats: {}, kind },
        sumLng: 0,
        sumLat: 0,
        xTally: new Map(),
      };
      byKey.set(key, b);
    }
    b.spot.n += 1;
    b.sumLng += inc.lng;
    b.sumLat += inc.lat;
    if (inc.category) b.spot.cats[inc.category] = (b.spot.cats[inc.category] ?? 0) + 1;
    if (!labelOf && inc.intersection) b.xTally.set(inc.intersection, (b.xTally.get(inc.intersection) ?? 0) + 1);
  }
  const spots: Spot[] = [];
  for (const b of byKey.values()) {
    b.spot.lng = b.sumLng / b.spot.n;
    b.spot.lat = b.sumLat / b.spot.n;
    if (!labelOf) {
      let best = 0;
      for (const [x, c] of b.xTally) if (c > best) { best = c; b.spot.intersection = x; }
    }
    spots.push(b.spot);
  }
  const counts = spots.map((s) => s.n).sort((a, b) => a - b);
  const pctl = counts.length
    ? counts[Math.min(counts.length - 1, Math.floor(counts.length * SPOT_REF_PERCENTILE))]!
    : 1;
  const ref = Math.max(SPOT_REF_FLOOR, pctl);
  for (const s of spots) s.w = +Math.min(1, Math.sqrt(s.n / ref)).toFixed(3);
  return spots;
}

/* finest level: one dot per exact geocoded coordinate */
export function aggregateSpots(incidents: ReadonlyArray<Incident>): Spot[] {
  return aggregate(incidents, 'spot', (i) => `${i.lng.toFixed(6)},${i.lat.toFixed(6)}`);
}

/* mid level: DOTS_GRID_STEP cells — nearby intersections combine into
   one dot at their reports' mean position */
export function aggregateAreas(incidents: ReadonlyArray<Incident>): Spot[] {
  const cell = (v: number): number => Math.floor(v / DOTS_GRID_STEP);
  return aggregate(incidents, 'area', (i) => `${cell(i.lng)},${cell(i.lat)}`);
}

/* coarsest level: one dot per neighborhood (reports without one fall
   back to their grid cell so nothing silently disappears) */
export function aggregateNhoods(incidents: ReadonlyArray<Incident>): Spot[] {
  const cell = (v: number): number => Math.floor(v / DOTS_GRID_STEP);
  return aggregate(
    incidents,
    'nhood',
    (i) => i.neighborhood || `@${cell(i.lng)},${cell(i.lat)}`,
    (i) => i.neighborhood,
  );
}
