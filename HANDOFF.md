# Block Report — Session Handoff

_Last updated: 2026-08-21_

## What this is

A crime heat map of San Francisco built on DataSF data. One view: a monochrome
3D map where incident density is painted onto real city geometry, with a
date-range selector (max 30-day span) planned for the real build.

**Live site:** https://james-c137.github.io/sf-block-report/ (GitHub Pages,
`main` branch root, repo is public). The root `index.html` redirects to the
final mockup.

## Current state

The design phase is complete. The winning design is
`mockups/23-buildings-blocks.html` — a self-contained no-build page, currently
serving as the product while collecting feedback. Everything else in
`mockups/` is the exploration trail (23 iterations; the gallery page was
deleted from the deploy, individual files remain reachable by URL).

### The winning design, in short

- **Aesthetic** ("Graphite", from mockup 07): CARTO Positron-nolabels basemap
  desaturated to gray, single graphite ink `#1A1A1A`, Inter type, slim floating
  control column (desktop) / map-first-viewport with panel scrolled below
  (mobile). Tilted camera (pitch 57, bearing −30), rotation interactive.
- **Density rendering**: census-block choropleth + inked street segments at
  citywide zoom, crossfading (z13→14.5) into per-building inked extrusions —
  curves overlap so total ink stays constant through the handoff (no mid-fade
  wash-out; validated by sampled hotspot darkness). Buildings enter via the
  "Both" treatment (opacity leads, height rises) and are minzoom-culled below.
- **Streets** render through deck.gl PathLayer with `blendEquation: MAX`
  (premultiplied alpha over constant hue) so intersections don't alpha-stack
  darker; a MapLibre butt-cap/miter fallback exists and is what mobile uses.
- **Neighborhood labels**: DataSF Analysis Neighborhoods (41), curated majors
  at citywide zoom, rest reveal past z12.6, pole-of-inaccessibility anchors,
  density-aware inversion (paper-white text over dark ink).
- **Points overlay** (not a separate view): On/Off switch, dots with a faint
  paper halo, drawn above extrusions. The only remaining control — all tuning
  dials were removed with defaults baked in: ink 100%, contrast 1.20, blocks
  85%, height 100%, entrance "Both", streets on.
- **Incident data is still fake**: ~2k seeded points (mulberry32) in Gaussian
  clusters over Tenderloin/SoMa, Mission, Bayview. The panel's period/count/
  histogram/categories/ranking are static props.

### Data

All map geometry is snapshotted in `mockups/data/` (pages load local-first
with remote Socrata fallback):

| File | Source (data.sfgov.org) | Contents |
|---|---|---|
| `blocks.geojson` | `p2fw-hsrv` Census 2020 Blocks | 5,986 polygons |
| `streets.geojson` | `3psu-pn9h` Streets – Active and Retired | 14,596 segments |
| `buildings-0..3.json` | `ynuv-fyni` Building Footprints | 75,634 footprints, core bbox, simplified |
| `buildings-mobile.json` | same, tighter bbox + coarser simplify | 35,674 footprints |
| `neighborhoods.geojson` | `j2bu-swwd` Analysis Neighborhoods | 41 polygons |

The exact Socrata queries are in the mockup files next to each fetch.

### Mobile

Was crashing (WebGL memory kill). Fixed and confirmed on-device: mobile path
(narrow viewport / touch) loads the reduced building snapshot, clamps
`pixelRatio` to 1.5, and skips deck.gl entirely. Desktop path verified
pixel-identical to before.

## Decisions on record

- **Stack for the real build**: Vite + **vanilla TypeScript, no React** (the
  original Vite+React choice was revisited; the mockups proved the panel
  doesn't need a framework). No-build version ships first for feedback —
  that's what's live now.
- **Data architecture**: all map geometry fetched at **build time** and served
  static; only **incident data** hits the Socrata API at **run time**
  (browser-direct, CORS is open; register a free Socrata app token for rate
  limits — it's fine to ship in the client).
- **Time model**: free date range, capped at a 30-day span.
- **V1 scope**: heat + date range + category filter + neighborhood ranking +
  points overlay.
- **Design taste** (hard-won): minimal, monochrome, map is the centerpiece.
  Abstract data overlays (smooth heat, contours, 3D hex/grid columns) all
  failed — density must be painted onto real geometry, below the buildings.
  Street ink should match block ink strength, never exceed it.

## Next steps

1. Collect feedback on the live mockup.
2. Real build: Vite + vanilla TS scaffold; port 23 as modules; replace seeded
   fake points with live Socrata incident queries (dataset: Police Department
   Incident Reports 2018–present, `wg3w-h783`); wire the date-range brush,
   category chips, count/histogram, and neighborhood ranking to real data.
3. Build-time geometry fetch script (reproduce the queries above) + GitHub
   Actions deploy of `dist/` to Pages, with Vite `base: '/sf-block-report/'`.
4. Watch CARTO basemap usage terms if traffic grows (OpenFreeMap is the
   drop-in alternative).

## Dev notes

- Serve mockups over http, not `file://` (local data fetches): any static
  server in `mockups/`, e.g. `python3 -m http.server 8791`.
- Known MapLibre gotcha (bit us twice): in `line-width` expressions the zoom
  `interpolate` must be the OUTER expression — `['zoom']` nested inside `['*']`
  silently rejects the whole layer.
- deck.gl layers cannot be slotted beneath MapLibre fill-extrusions
  (interleaved `beforeId` under an extrusion layer drops 2D layers entirely);
  ground-under-buildings effects must live in MapLibre's own layer stack.
