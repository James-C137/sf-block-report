/* Pure planar geometry helpers — plenty accurate at city scale. */

export type Ring = number[][];
export type PolygonCoords = Ring[];
export type Geometry =
  | { type: 'Polygon'; coordinates: PolygonCoords }
  | { type: 'MultiPolygon'; coordinates: PolygonCoords[] };

const COS_LAT = Math.cos((37.76 * Math.PI) / 180); /* lon degrees are shorter */

export function shoelace(ring: Ring): number {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const p = ring[i]!;
    const q = ring[i + 1]!;
    a += p[0]! * q[1]! - q[0]! * p[1]!;
  }
  return a / 2;
}

export function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    const xi = pi[0]!, yi = pi[1]!, xj = pj[0]!, yj = pj[1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* centroid of the largest outer ring — average of vertices (rings close
   on themselves, so the duplicate endpoint is dropped) */
export function centroidOf(geom: Geometry): [number, number] | null {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  let ring: Ring | null = null;
  let area = -1;
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer) continue;
    const a = Math.abs(shoelace(outer));
    if (a > area) {
      ring = outer;
      area = a;
    }
  }
  if (!ring) return null;
  let n = ring.length - 1;
  if (n < 1) n = ring.length;
  let sx = 0, sy = 0;
  for (let j = 0; j < n; j++) {
    sx += ring[j]![0]!;
    sy += ring[j]![1]!;
  }
  return [sx / n, sy / n];
}

/* one label anchor per neighborhood: a pole-of-inaccessibility-ish
   interior point — the grid sample (plus the ring centroid as a
   candidate) inside the largest polygon and farthest from its edges, so
   labels land over their neighborhoods even for concave shapes */
export function labelPointOf(geom: Geometry): { point: [number, number] | null; area: number } | null {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  let poly: PolygonCoords | null = null;
  let area = 0;
  for (const p of polys) {
    const outer = p[0];
    if (!outer) continue;
    const a = Math.abs(shoelace(outer));
    if (a > area) {
      area = a;
      poly = p;
    }
  }
  if (!poly) return null;
  const outer = poly[0]!;
  const holes = poly.slice(1);
  const inside = (x: number, y: number): boolean => {
    if (!pointInRing(x, y, outer)) return false;
    for (const h of holes) if (pointInRing(x, y, h)) return false;
    return true;
  };
  /* edge vertices, decimated for scoring (rings are dense) */
  const verts: number[][] = [];
  for (const ring of poly) {
    const step = Math.max(1, Math.floor(ring.length / 300));
    for (let v = 0; v < ring.length; v += step) verts.push(ring[v]!);
  }
  const edgeDist2 = (x: number, y: number): number => {
    let best = Infinity;
    for (const v of verts) {
      const dx = (x - v[0]!) * COS_LAT;
      const dy = y - v[1]!;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return best;
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outer) {
    if (p[0]! < minX) minX = p[0]!;
    if (p[0]! > maxX) maxX = p[0]!;
    if (p[1]! < minY) minY = p[1]!;
    if (p[1]! > maxY) maxY = p[1]!;
  }
  const cands: Array<[number, number]> = [];
  const c = centroidOf(geom);
  if (c && inside(c[0], c[1])) cands.push(c);
  const N = 17;
  for (let gy = 1; gy < N; gy++) {
    for (let gx = 1; gx < N; gx++) {
      const x = minX + ((maxX - minX) * gx) / N;
      const y = minY + ((maxY - minY) * gy) / N;
      if (inside(x, y)) cands.push([x, y]);
    }
  }
  if (!cands.length) return { point: c, area };
  let bestPt = cands[0]!;
  let bestD = -1;
  for (const cand of cands) {
    const d2 = edgeDist2(cand[0], cand[1]);
    if (d2 > bestD) {
      bestD = d2;
      bestPt = cand;
    }
  }
  return { point: bestPt, area };
}
