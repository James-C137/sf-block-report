/* Incidents are parsed ONCE at the data boundary into this shape; no raw
   Socrata rows or parallel GeoJSON representations flow through the app. */
export interface Incident {
  day: string; /* ISO date, e.g. '2026-08-01' */
  category: string; /* '' when the report is uncategorized */
  neighborhood: string;
  intersection: string;
  lng: number;
  lat: number;
}

/* An aggregated dot: one per unique location. */
export interface Spot {
  lng: number;
  lat: number;
  n: number;
  w: number; /* normalized weight, the shared scaling law */
  intersection: string;
  cats: Record<string, number>;
}

export interface DensityField {
  grid: Float32Array;
  w: number;
  h: number;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export interface DateSel {
  from: string; /* ISO day, inclusive */
  to: string; /* ISO day, inclusive */
}

export interface Filters {
  dateSel: DateSel | null;
  /* Category names whose chips are ON. null = chips not initialized yet
     (treated as everything active). Uncategorized reports are shown iff
     at least one chip is active — the '__other' asymmetry of the mockup
     was resolved this way (PORT_PLAN §6.1). */
  activeCats: Set<string> | null;
}

export type LngLat = readonly [number, number];
