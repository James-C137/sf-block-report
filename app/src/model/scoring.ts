/* Score the block mosaic against a density field: sample at cached
   centroids, then normalize against the 99th-percentile block so one
   peak block can't flatten the rest of the ramp. Pure — the caller owns
   pushing scores into the map source. */

import { BLOCK_NORM_PERCENTILE } from '../config';
import { sampleField } from './density';
import type { DensityField } from './types';

export function scoreBlocks(
  cents: ReadonlyArray<readonly [number, number] | null>,
  field: DensityField,
): number[] {
  const raw = cents.map((c) => (c ? sampleField(field, c[0], c[1]) : 0));
  const sorted = [...raw].sort((a, b) => a - b);
  let p99 = sorted.length ? sorted[Math.floor(sorted.length * BLOCK_NORM_PERCENTILE)]! : 1;
  if (!(p99 > 0)) p99 = 1;
  return raw.map((v) => +Math.min(1, v / p99).toFixed(4));
}
