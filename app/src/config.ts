/* Every tuned constant of the locked-in look (2026-08-22), ported
   verbatim from the mockup (mockups/23-buildings-blocks.html — the
   reference implementation). Values here are decisions of record; see
   HANDOFF.md for the rationale trail. */

export const MS_DAY = 86400000;

/* ---- incidents (runtime Socrata) ---- */
export const WINDOW_DAYS = 30;
export const INCIDENT_CAP = 25000; /* ~2x a typical geocoded month; one polite request */
export const INCIDENT_TIMEOUT_MS = 20000;
export const INCIDENTS_DATASET = 'https://data.sfgov.org/resource/wg3w-h783.json';
export const SODA_APP_TOKEN: string = import.meta.env?.VITE_SODA_APP_TOKEN ?? '';

/* ---- density grid ---- */
export const GRID_W = 384;
export const GRID_H = 384;
export const GRID_MIN_LNG = -122.53;
export const GRID_MAX_LNG = -122.34;
export const GRID_MIN_LAT = 37.7;
export const GRID_MAX_LAT = 37.84;
export const BLUR_RADIUS = 4; /* 3 box passes ≈ Gaussian sigma ≈ 190m */
export const BLUR_PASSES = 3;
export const GRID_NORM_PERCENTILE = 0.995;
export const DENSITY_GAMMA = 0.5; /* sqrt lift so color reaches the whole city */

/* ---- spot aggregation (dots) ---- */
export const SPOT_REF_PERCENTILE = 0.995;
export const SPOT_REF_FLOOR = 4;

/* ---- ground / buildings choreography (handoff z14.5→16) ---- */
export const BLOCKS_MAX = 0.85;
export const BLOCK_NORM_PERCENTILE = 0.99;
export const GROUND_FADE: ReadonlyArray<readonly [number, number]> = [
  [14.5, 1.0],
  [15.0, 0.96],
  [15.4, 0.82],
  [15.7, 0.5],
  [16.0, 0.0],
];
export const ENTRANCE_OPACITY: ReadonlyArray<readonly [number, number]> = [
  [14.5, 0],
  [14.8, 0.5],
  [15.15, 0.85],
  [15.5, 1],
];
export const ENTRANCE_HEIGHT: ReadonlyArray<readonly [number, number]> = [
  [14.7, 0],
  [15.1, 0.5],
  [15.55, 0.85],
  [16.0, 1],
];
export const BLDG_MINZOOM = 14.4;
export const BLDG_FULL_OPACITY = 0.85; /* 0.96 read too intense in charcoal */
export const BLDG_DEFAULT_HEIGHT_M = 8;

/* ---- dots ---- */
/* LoD ladder: the dots are always on, but WHAT a dot means refines with
   zoom — one combined dot per neighborhood until the sub-streets are on
   screen, then the individual geocoded intersections to hang off them.
   Level changes crossfade over DOTS_FADE_MS. */
export const DOTS_LOD_SPOT_AT = 14.0; /* nhood → individual: sub-streets have appeared */
/* fallback cell (~450m) for grouping reports with no neighborhood */
export const DOTS_GRID_STEP = 0.005;
export const DOTS_FADE_MS = 300;
export const DOTS_MAX = BLOCKS_MAX; /* strength cap, same dimension as blocks */
/* dot AREA rises linearly with report count within each LoD, from the
   floor radius (an n=0 anchor the lightest spots approach) up to the
   max the level's BIGGEST dot is pinned at (px, constant across zoom) */
export const DOT_RADIUS_FLOOR = 3;
export const DOT_RADIUS_MAX_NHOOD = 16;
export const DOT_RADIUS_MAX_SPOT = 14;
export const DOT_STROKE_RATIO = 0.2; /* stroke width as a fraction of radius */
export const DOT_COLOR_RGB: readonly [number, number, number] = [183, 71, 10]; /* #B7470A */
export const DOT_STROKE_OPACITY = 0.7;
/* per-spot strength ramp on t = w: HIGH floor so singles stay visible */
export const DOT_STRENGTH_RAMP: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.35],
  [0.25, 0.5],
  [0.55, 0.7],
  [1.0, 1.0],
];

/* ---- category taxonomy (decision of record, 2026-08-23) ----
   SFPD's incident_category runs ~45 values; the chips row showed every
   one and read as spam. Two-part fix ("1+3"): administrative/non-crime
   rows are EXCLUDED at the parse boundary (they aren't incidents a
   crime map should paint), and the rest fold into ~10 curated GROUPS
   for filtering. Dot popups keep the raw category names, so no detail
   is lost. Any category missing from both tables lands in 'Other' —
   new dataset values never vanish. */
export const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set([
  'Case Closure',
  'Courtesy Report',
  'Miscellaneous Investigation',
  'Non-Criminal',
  'Recovered Vehicle',
  'Vehicle Impounded',
  'Vehicle Misplaced',
  'Lost Property',
  'Warrant', /* police activity, not an underlying incident at that spot */
  'Traffic Violation Arrest',
  'Traffic Collision',
  'Fire Report',
  'Suicide', /* not a crime; out of place on this map */
  'Missing Person',
]);
export const CATEGORY_GROUPS: Readonly<Record<string, readonly string[]>> = {
  'Theft': ['Larceny Theft', 'Stolen Property', 'Embezzlement'],
  'Burglary': ['Burglary'],
  'Vehicle Theft': ['Motor Vehicle Theft', 'Motor Vehicle Theft?', 'Motorcycle Theft'],
  'Robbery': ['Robbery'],
  'Assault & Violence': [
    'Assault', 'Homicide', 'Rape', 'Sex Offense',
    'Weapons Offense', 'Weapons Carrying Etc', 'Weapons Offence',
    'Offences Against The Family And Children',
    'Human Trafficking (A), Commercial Sex Acts',
    'Human Trafficking (B), Involuntary Servitude',
    'Human Trafficking, Commercial Sex Acts',
  ],
  'Vandalism & Arson': ['Malicious Mischief', 'Vandalism', 'Arson'],
  'Fraud & Forgery': ['Fraud', 'Forgery And Counterfeiting'],
  'Drugs & Vice': ['Drug Offense', 'Drug Violation', 'Prostitution', 'Gambling', 'Liquor Laws'],
  'Disorder': ['Disorderly Conduct', 'Suspicious Occ', 'Suspicious', 'Civil Sidewalks', 'Trespass', 'Juvenile Offenses'],
  /* 'Other' is the runtime catch-all — listed members are just the
     known ones */
  'Other': ['Other', 'Other Miscellaneous', 'Other Offenses'],
};
export const OTHER_GROUP = 'Other';

/* ---- labels ---- */
export const LABEL_BEND_AT = 14; /* screen-space px below, fixed world size above */
export const LABEL_INVERT_DENS = 0.8; /* on the gamma-lifted field */
export const NHOOD_MAJORS = [
  'Tenderloin', 'Mission', 'South of Market', 'Bayview Hunters Point',
  'North Beach', 'Financial District/South Beach', 'Castro/Upper Market',
  'Marina', 'Haight Ashbury', 'Nob Hill', 'Sunset/Parkside',
  'Outer Richmond', 'Excelsior', 'Noe Valley', 'Pacific Heights',
] as const;
export const NHOOD_DISPLAY: Record<string, string> = {
  'South of Market': 'SoMa',
  'Bayview Hunters Point': 'Bayview',
  'Financial District/South Beach': 'Financial District',
  'Castro/Upper Market': 'Castro',
  'Oceanview/Merced/Ingleside': 'Oceanview',
  'Sunset/Parkside': 'Sunset',
  'Lone Mountain/USF': 'Lone Mountain',
};

/* ---- camera ---- */
export const PITCH = 57;
export const BEARING = -30;
export const MAX_PITCH = 70;
export const CENTER_NARROW: [number, number] = [-122.414, 37.762];
export const CENTER_WIDE: [number, number] = [-122.418, 37.768];
export const ZOOM_NARROW = 11.3;
export const ZOOM_WIDE = 11.85;
export const MOBILE_PIXEL_RATIO_CAP = 1.5;
/* rubber band: soft limits only, NO hard walls (decision on record) */
export const SOFT_MIN_ZOOM = 10.0; /* ≈ Bay Area framing */
export const SOFT_BOUNDS = { w: -122.75, e: -122.15, s: 37.55, n: 37.98 } as const;
export const SPRING_MS = 380;

/* ---- basemap ---- */
export const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';
export const SUBSTREET_DELAY = 0.5; /* extra zoom before minor basemap roads appear */
export const SUBSTREET_FADE = 0.4;
export const SUBSTREET_MINZOOM_FLOOR = 11; /* only late-arriving layers get managed */

/* ---- geometry snapshots (one-time download committed to the repo) ---- */
const BASE: string = import.meta.env?.BASE_URL ?? '/';
export const DATA_BASE = `${BASE}mockups/data/`;
export const BLOCKS_URL = `${DATA_BASE}blocks.geojson`;
export const NHOODS_URL = `${DATA_BASE}neighborhoods.geojson`;
export const BUILDING_CHUNKS = 4;
export const buildingChunkUrl = (i: number): string => `${DATA_BASE}buildings-${i}.json`;
export const BUILDINGS_MOBILE_URL = `${DATA_BASE}buildings-mobile.json`;
export const TOTAL_BLDG_ROWS_DESKTOP = 76000;
export const TOTAL_BLDG_ROWS_MOBILE = 35674;

/* ---- pings ---- */
export const PING_STORAGE_KEY = 'block-report-pings'; /* keep — existing pins must survive */
export const PING_SCALE_AT = 14; /* same law as the labels: 2^(z-14) above */
export const NOMINATIM_VIEWBOX = '-122.55,37.85,-122.33,37.70';

/* ---- chrome ---- */
export const ACCENT = '#B7470A';
