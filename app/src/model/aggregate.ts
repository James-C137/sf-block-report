/* Reports pile up at repeated addresses (the dataset geocodes to
   intersections), so the dots overlay draws ONE spot per location,
   weighted by report count through the shared law: normalize against the
   99.5th-percentile spot (floored at 4 so an all-unique set doesn't
   render every dot at full strength), then sqrt. */

import { SPOT_REF_FLOOR, SPOT_REF_PERCENTILE } from '../config';
import type { Incident, Spot } from './types';

export function aggregateSpots(incidents: ReadonlyArray<Incident>): Spot[] {
  const byKey = new Map<string, Spot>();
  for (const inc of incidents) {
    const key = `${inc.lng.toFixed(6)},${inc.lat.toFixed(6)}`;
    let s = byKey.get(key);
    if (!s) {
      s = { lng: inc.lng, lat: inc.lat, n: 0, w: 0, intersection: '', cats: {} };
      byKey.set(key, s);
    }
    s.n += 1;
    if (inc.category) s.cats[inc.category] = (s.cats[inc.category] ?? 0) + 1;
    if (!s.intersection && inc.intersection) s.intersection = inc.intersection;
  }
  const spots = [...byKey.values()];
  const counts = spots.map((s) => s.n).sort((a, b) => a - b);
  const pctl = counts.length
    ? counts[Math.min(counts.length - 1, Math.floor(counts.length * SPOT_REF_PERCENTILE))]!
    : 1;
  const ref = Math.max(SPOT_REF_FLOOR, pctl);
  for (const s of spots) s.w = +Math.min(1, Math.sqrt(s.n / ref)).toFixed(3);
  return spots;
}
