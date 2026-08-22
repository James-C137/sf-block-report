/* Static geometry snapshots — a one-time full download committed to the
   repo (decision on record: no refetch per build, no remote fallback;
   same-origin static, so a 404 means the deploy is broken). */

import {
  BLOCKS_URL, BUILDINGS_MOBILE_URL, BUILDING_CHUNKS, NHOODS_URL,
  BLDG_DEFAULT_HEIGHT_M, buildingChunkUrl,
} from '../config';
import type { Geometry } from '../model/geo';
import { centroidOf } from '../model/geo';

export interface BlockFeature {
  type: 'Feature';
  properties: { v: number };
  geometry: Geometry;
}
export interface BlocksData {
  gj: { type: 'FeatureCollection'; features: BlockFeature[] };
  cents: Array<readonly [number, number] | null>;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

interface RawBlockFeature {
  geometry?: Geometry | null;
  properties?: { aland20?: string; awater20?: string } | null;
}

export async function loadBlocks(): Promise<BlocksData> {
  const raw = await getJSON<{ features: RawBlockFeature[] }>(BLOCKS_URL);
  const features: BlockFeature[] = [];
  const cents: Array<readonly [number, number] | null> = [];
  for (const f of raw.features) {
    if (!f.geometry || !('coordinates' in f.geometry)) continue;
    const p = f.properties ?? {};
    /* water-dominant blocks stay unpainted — the bay is not a crime scene */
    const water = parseFloat(p.awater20 ?? '0') > parseFloat(p.aland20 ?? '0');
    features.push({ type: 'Feature', properties: { v: 0 }, geometry: f.geometry });
    cents.push(water ? null : centroidOf(f.geometry));
  }
  return { gj: { type: 'FeatureCollection', features }, cents };
}

export interface NhoodFeature {
  properties?: { nhood?: string } | null;
  geometry?: Geometry | null;
}

export async function loadNeighborhoods(): Promise<NhoodFeature[]> {
  const raw = await getJSON<{ features?: NhoodFeature[] }>(NHOODS_URL);
  return raw.features ?? [];
}

interface BuildingRow {
  g?: Geometry | null;
  hgt_median_m?: string;
}

export interface BuildingFeature {
  type: 'Feature';
  properties: { d: number; h: number };
  geometry: Geometry;
}

/* build the extrusion FC: centroid (outer-ring average of the first
   polygon — plenty for coloring) scored against the PRISTINE field */
export function toBuildingFC(
  rowsPerChunk: BuildingRow[][],
  densityAt: (lng: number, lat: number) => number,
): { type: 'FeatureCollection'; features: BuildingFeature[] } {
  const feats: BuildingFeature[] = [];
  for (const rows of rowsPerChunk) {
    for (const r of rows) {
      const g = r.g;
      if (!g || !('coordinates' in g)) continue;
      const ring = g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : g.coordinates[0];
      if (!ring || !ring.length) continue;
      let m = ring.length - 1; /* ring is closed */
      if (m < 1) m = ring.length;
      let sx = 0, sy = 0;
      for (let i = 0; i < m; i++) {
        sx += ring[i]![0]!;
        sy += ring[i]![1]!;
      }
      let h = parseFloat(r.hgt_median_m ?? '');
      if (!isFinite(h) || h <= 0) h = BLDG_DEFAULT_HEIGHT_M;
      feats.push({
        type: 'Feature',
        properties: { d: +densityAt(sx / m, sy / m).toFixed(4), h: +h.toFixed(1) },
        geometry: g,
      });
    }
  }
  return { type: 'FeatureCollection', features: feats };
}

export async function loadBuildingRows(
  mobile: boolean,
  onChunk: (rows: number) => void,
): Promise<BuildingRow[][]> {
  if (mobile) {
    const rows = await getJSON<BuildingRow[]>(BUILDINGS_MOBILE_URL);
    onChunk(rows.length);
    return [rows];
  }
  return Promise.all(
    Array.from({ length: BUILDING_CHUNKS }, async (_, i) => {
      const rows = await getJSON<BuildingRow[]>(buildingChunkUrl(i));
      onChunk(rows.length);
      return rows;
    }),
  );
}
