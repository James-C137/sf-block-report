/* Incidents are parsed ONCE at the data boundary into this shape; no raw
   Socrata rows or parallel GeoJSON representations flow through the app. */
export interface Incident {
  day: string; /* ISO date, e.g. '2026-08-01' */
  category: string; /* raw dataset category; '' when uncategorized */
  group: string; /* curated filter group (config CATEGORY_GROUPS); '' iff category is '' */
  neighborhood: string;
  intersection: string;
  lng: number;
  lat: number;
}

/* An aggregated dot. `kind` says what one dot stands for at each LoD:
   an exact geocoded location or a whole neighborhood. */
export type SpotKind = 'spot' | 'nhood';

export interface Spot {
  lng: number;
  lat: number;
  n: number;
  w: number; /* normalized weight (ink), the shared scaling law */
  r: number; /* resolved radius in px (see aggregate.ts for the size law) */
  intersection: string; /* nhood level: the neighborhood name */
  cats: Record<string, number>;
  kind: SpotKind;
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
