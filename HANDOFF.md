# Block Report — Session Handoff

_Last updated: 2026-08-22_

## What this is

A crime heat map of San Francisco built on DataSF data. One view: a monochrome
3D map where incident density is painted onto real city geometry, with a
date-range selector (max 30-day span) planned for the real build.

**Live site:** https://james-c137.github.io/sf-block-report/ (GitHub Pages,
`main` branch root, repo is public). The root serves the **built app** —
`app/` (Vite + vanilla TypeScript) built and committed to the root via
`npm run deploy:root` (root `index.html` + `assets/`; pushing main
publishes). The mockup archive stays reachable at
`mockups/23-buildings-blocks.html`.

## Current state

**The port is DONE (2026-08-22).** `app/` is the product: the full V1
feature set from the mockup, restructured into typed modules per
`PORT_PLAN.md` (street ink dropped entirely per user call; deck.gl
dropped; quirk fixes §6 applied). 31 spec-driven unit tests + a 25-check
playwright-core e2e smoke (`app/e2e/run.mjs`, all external services
mocked) are green; the mockup is a reference only — no test reads or
executes it.

The reference design is `mockups/23-buildings-blocks.html` — a
self-contained no-build page, feature-frozen. Everything else in
`mockups/` is the exploration trail (23 iterations; the gallery page was
deleted from the deploy, individual files remain reachable by URL).

### The winning design, in short

- **Aesthetic** ("Graphite" chrome, from mockup 07, with a heat-ramp density
  by user request 2026-08-22): CARTO Positron-nolabels basemap, Inter type,
  slim floating control column (desktop) / map-first-viewport with panel
  scrolled below (mobile). Tilted camera (pitch 57, bearing −30), rotation
  interactive. Density is WARM CHARCOAL — intensity carries the data, the
  hue is near-neutral with a subtle warm-taupe tint (deliberately NOT full
  desaturation): paper white → warm gray → deep charcoal (`#877A70` light
  anchor → `#26201D` at hotspot cores). Palette history (all tried, all
  rejected 2026-08-22): saturated red/yellow ("McDonald's"), muted
  terracotta→dark brick ("dried blood"), diverging green→cream→red,
  monochrome orange — color gradients per se didn't work; slightly-tinted
  charcoal is the settled decision. Ground layers slide the hue along the
  alpha ramp (paper white comes from transparency), buildings carry the
  full ramp in surface color. Scaling stays generous from the color era so
  ink reaches the whole city: sqrt gamma on the normalized density grid,
  CONTRAST 1.0 (was 1.2), and a near-linear alpha ramp (a return to the
  original soft-toe/1.2 look is a two-line change if the wash feels heavy
  in gray). Labels are strictly black/white — graphite text on white halo,
  inverting to white on graphite halo over hotspot cores (threshold 0.8 on
  the lifted field). NOTE: the
  basemap's `saturate(0)` CSS filter had to go — it would grayscale the
  heat layers in the same canvas — so `desaturateBasemap()` grays the
  Positron style's own paint colors at load instead (keeps the bay/parks
  gray under the colored density). It deep-walks ANY paint value shape —
  plain strings, expression arrays, legacy {stops} functions — graying
  every string that parses as a color (the greenery layers color via
  expressions and slipped through the original strings-only pass). Panel UI stays monochrome graphite.
- **Accent color** (added with the charcoal ramp; user wants "minimal
  colors, esp. on mobile"): one burnt orange, `--accent: #B7470A`, kept
  from the rejected orange ramp. Used ONLY in tiny doses: the wordmark
  square, the loading pip, the scroll-hint arrow, the histogram's peak
  bar, the compass needle's north tip, and the incident points overlay
  dots. Everything else stays graphite. Building extrusion opacity is
  capped at 0.85 (was 0.96) — full-strength charcoal volumes read too
  intense.
- **Rubber-band camera limits**: soft limits keep the framing on SF and
  the Bay — `SOFT_MIN_ZOOM 10` (≈ Bay Area view) and a soft center box
  around the city (lng −122.75..−122.15, lat 37.55..37.98). NO hard
  walls (minZoom/maxBounds deliberately unset — a hard stop mid-gesture
  felt wrong): pull as far as you like, and on gesture release
  (`moveend`) an ease-out `easeTo` springs the camera back.
- **Compass** (top-right on the map): a bare needle living directly on
  the page — no chip, no border, no caption (a chipped version with a
  2D/3D press-toggle was tried and stripped back). Needle counter-rotates
  to track true north (accent-orange tip), foreshortens with camera pitch
  via CSS rotateX so it sits in the scene, and carries a whisper of paper
  drop-shadow for legibility over dark ink. Pressing it eases bearing back
  to north; pitch stays a map gesture.
- **Points overlay dots** keep their faint paper outline — a blurred
  no-stroke variant stacked too intensely; the outline is what gives the
  dots their softness. Color is the accent orange (a signal-red pass was
  tried; the real complaint turned out to be the stroke popping — see the
  gotcha below). Reports are aggregated
  to ONE dot per location (repeat addresses stack on the same spot), and
  each dot's opacity scales with its report count through the SAME law as
  blocks/buildings: normalize to the p99.5 spot, sqrt gamma, the shared
  ramp with a HIGH floor (a lone report paints ~0.4 — small dots stay
  clearly visible), capped at 0.85; repeat addresses build toward full
  ink. Radius also grows with the weight (0.6x singles → 1.35x hot
  addresses) and the paper stroke thins at citywide zoom (it read as
  measles at full width there).
- **Density rendering**: census-block choropleth + inked street segments at
  citywide zoom, crossfading (z14→15.5; pushed up a level so the dots own a
  z12–14 phase over the mosaic first) into per-building inked extrusions —
  curves overlap so total ink stays constant through the handoff (no mid-fade
  wash-out; validated by sampled hotspot darkness). Buildings enter via the
  "Both" treatment (opacity leads, height rises) and are minzoom-culled below.
- **Streets** render through deck.gl PathLayer with `blendEquation: MAX`
  (premultiplied alpha over constant hue) so intersections don't alpha-stack
  darker; a MapLibre butt-cap/miter fallback exists and is what mobile uses.
- **Neighborhood labels**: DataSF Analysis Neighborhoods (41), curated majors
  at citywide zoom, rest reveal past z12.6, pole-of-inaccessibility anchors,
  density-aware inversion (paper-white text over dark ink). ONE size
  law, two regimes: constant screen-space px up to z14, then — just
  before the buildings enter at 14.5 — doubling per zoom level (fixed
  world size), so the names scale with the city. In the app
  (2026-08-22) these are DOM markers, NOT symbol layers: symbol text
  comes from a 24px SDF glyph atlas and went soft once the size law
  blew it up in-world, reading low-res next to the crisp DOM pin
  labels. Pins and neighborhoods now share one DOM `.map-label` system
  (Inter, same halo, same inversion rule, same scale law in
  `layers/labels.ts` / `pings.ts`), which also drops the glyph fetch
  and the symbol-bucket warm-up jump. Trade accepted: no collision
  culling (anchors are sparse enough per visibility tier). Upright
  camera-facing text reads as standing billboards. Dead ends on
  record: a ground-plane variant (`pitch-alignment: map`) looked
  knocked over, and a separate timed-crossfade "world" layer was
  scrapped as redundant.
- **Points overlay** (not a separate view, no toggle): dots draw above
  the extrusions and enter via a TIMED fade at the z12.5 threshold —
  crossing it in either direction runs a fixed 300ms opacity transition
  (`updateDotRegime`), not a zoom-interpolated entrance (a zoom-scaled
  snap-in existed and was replaced on request). GOTCHA that shapes the
  implementation: data-driven paint props aren't transitionable, so the
  per-spot strength lives in the COLOR's alpha (an `['rgba',...]`
  expression) and circle-opacity / circle-stroke-opacity stay plain
  constants the watcher flips. Minzoom cull sits half a level below the
  threshold so the fade finishes before the cut. Related GOTCHA (bit us
  earlier): `circle-opacity` fades the FILL only; the stroke rides a
  separate `circle-stroke-opacity` (default 1) — the watcher flips both.
  If BOTH density layers fail, the degrade path un-gates the dots' zoom
  range so they can carry the map alone.
- **LOCKED-IN LOOK (2026-08-22, tuned by eye via panel sliders that have
  since been REMOVED — the panel is a pure report again)**: street ink
  OFF (the block mosaic carries the ground alone; the deck.gl MAX-blend
  street apparatus survives in code behind `STREETS_ON`), handoff
  z14.5→16, sub-streets delay +0.5z, dots fade in at z12.5 / strength
  85% (= blocks) / size 150%. The pipelines stay parameterized
  (`STREETS_*`, `DOTS_*`, `SUBSTREET_DELAY`, `shiftStops`) so re-tuning
  is a constants change; the slider/segment/reset UI and wiring were
  deleted after lock-in. Other baked values: ink 100%, contrast 1.0,
  blocks 85%, height 100%, entrance "Both".
- **Sub-streets** (baked +0.5z): the basemap's small road layers
  (minor/service/path, ids matched at load with their own minzoom ≥ 11)
  popped in abruptly mid-handoff. Their entrance is managed: delayed
  past their style minzoom and faded in over ~0.4 zoom, pre-multiplied
  with the street-ink road-dim into a single numeric zoom curve
  (MapLibre allows only one top-level ['zoom'] interpolate per property).
- **Filters drive EVERYTHING (live data)**: the category chips and the
  histogram's date brush filter one row set that re-derives the density
  grids, block mosaic, street ink, dots + details, report count, and
  neighborhood ranking (`commitFilters` → `refreshPanel` +
  `recomputeMapData`; blocks/streets re-score from cached geometry —
  `blocksCache`/`streetsCache`/`streetPaths`). BUILDINGS are the
  exception: scored once at load from the pristine grids (which are
  never overwritten — filtered grids live in `gridMainF`/`gridStreetF`),
  they HIDE while any filter is active and the block mosaic carries all
  zooms flat (`blockOpacityFlatExpr`); clearing filters restores them,
  still valid. Approved trade: re-scoring 76k footprints per toggle is
  seconds; blocks-only high zoom is fine.
- **Date-range brush**: drag across the histogram (it doubles as the
  brush track; `touch-action:none`) to select a sub-range of the fetched
  30-day window — single tap = one day, whole track or the period-row
  Reset link = full window. Out-of-selection bars dim; the histogram
  itself always shows category-filtered daily counts over the FULL
  window so the track stays stable while brushing.
- **Legend** (panel): charcoal ramp swatch (fewer→more per block), the
  orange dot (darker/larger with repeat reports), and the pin glyph.
- **Dot details + category filter (live data)**: tapping a dot opens a
  house-styled popup (`.ink-pop`) with the spot's intersection (the
  dataset geocodes incidents to intersections; backslash separator
  rendered as "&"), report count, and category breakdown —
  aggregatePoints carries `n`, `x` (intersection), and a stringified
  per-spot `cats` tally. The panel's category chips are FILTER TOGGLES —
  EVERY category gets its own chip, sorted by count (an "Other"
  aggregate existed and was removed on request; uncategorized rows have
  no chip and are always shown). All on by default; tapping one off
  fades the chip and re-aggregates the dots overlay from only the
  active categories (raw points kept as `incidentData.rawFC`). All/None
  master buttons sit in the Category header (live mode only) — None
  also hides the uncategorized stragglers, All brings everything back.
  The heat surface deliberately stays all-categories — it's the ambient
  layer. Fallback (simulated) chips stay static.
- **Map pings (by address)**: a "Pins" panel section — type an address
  (geocoded by OpenStreetMap Nominatim, browser-direct, bounded to an SF
  viewbox) to drop a graphite teardrop pin and see where home/work land
  on the density. Pins scale under the SAME law as the neighborhood
  labels (constant screen size to z14, then fixed world size, growing
  about the tip). Removal ONLY via the × in the panel list — pins are
  pointer-events:none on the map so a stray tap can't delete home/work
  (tap-to-remove existed and was removed on request); persisted per
  device in localStorage (`block-report-pings`,
  {a,lng,lat} objects; the earliest bare-pair saves still restore).
  MapLibre DOM Markers own their element's transform, so the scalable
  pin lives on an inner span. Tap-to-drop was replaced by
  address-entry on request. Each pin carries its label text on the map
  (added 2026-08-22), centered ABOVE the teardrop inside the scaled
  span (a beside-the-head placement read awkward and was moved on
  request); shares the `.map-label` system with the neighborhood
  labels, inverting over hotspot cores under the same
  LABEL_INVERT_DENS rule (sampled once from the pristine field at add
  time).
- **Incident data is LIVE**: the page fetches the last 30 full days of SFPD
  Incident Reports (`wg3w-h783`) from Socrata at runtime — one browser-direct
  request, `$limit=25000` (~2x a typical month of geocoded reports; SODA 2.1
  takes any `$limit`, and tokenless clients share a throttled per-IP pool, so
  one capped request beats paging; ordered newest-first so a cap-hit keeps
  the freshest rows and the panel says so). The window ends yesterday —
  the dataset refreshes daily with a day or two of reporting lag. Density is
  the real points binned into a ~40m grid, box-blurred (≈ Gaussian, sigma
  ≈190m; streets sample a wider ≈280m blur), normalized to the p99.5 cell and
  clamped (single-address spikes would flatten a max-normal). The panel —
  period, count, 30-day histogram, top-5 category chips, neighborhood
  ranking — is computed from the same rows. If the fetch fails or times out
  (20s), the old ~2k seeded points return as a fallback with a visible
  notice and the footnote flips to "simulated".

### Data

All map geometry is snapshotted in `mockups/data/` (pages load local-first
with remote Socrata fallback):

| File | Source (data.sfgov.org) | Contents |
|---|---|---|
| `blocks.geojson` | `p2fw-hsrv` Census 2020 Blocks | 5,986 polygons |
| `streets.geojson` | `3psu-pn9h` Streets – Active and Retired | 14,596 segments |
| `buildings-0..3.json` | `ynuv-fyni` Building Footprints | 75,634 footprints, core bbox, simplified |
| `buildings-mobile.json` | same, tighter bbox + coarser simplify | 35,674 footprints |

KNOWN LIMITATION: the building snapshots are bbox-cropped (mobile:
−122.438..−122.390 / 37.745..37.800; desktop: −122.443..−122.380 /
37.720..37.805), so buildings visibly cut off at the bbox edge — e.g.
north of Russian Hill (~lat 37.80) on phones. Deliberate iOS-memory
trade from the crash fix. Fix path: regenerate the snapshots with a
wider bbox (needs Socrata access at build time) or accept until the
real build's build-time fetch.
| `neighborhoods.geojson` | `j2bu-swwd` Analysis Neighborhoods | 41 polygons |

Incidents are the exception: `wg3w-h783` Police Department Incident Reports
2018–present is queried at **runtime** (no local snapshot — it's the live
data), last 30 days, capped at 25k rows in a single request.

The exact Socrata queries are in the mockup files next to each fetch.

### Mobile

Was crashing (WebGL memory kill). Fixed and confirmed on-device: mobile path
(narrow viewport / touch) loads the reduced building snapshot, clamps
`pixelRatio` to 1.5, and skips deck.gl entirely. Desktop path verified
pixel-identical to before.

Narrow viewports also run `cooperativeGestures` (one finger scrolls the
page, two fingers move the map) — without it the full-viewport map captured
every touch and the panel below was unreachable — and the "Details below"
pill is a real button that scrolls to the panel.

## Decisions on record

- **Stack for the real build**: Vite + **vanilla TypeScript, no React** (the
  original Vite+React choice was revisited; the mockups proved the panel
  doesn't need a framework). No-build version ships first for feedback —
  that's what's live now.
- **Data architecture**: map geometry is a **one-time full download**
  committed to the repo (user's call, 2026-08-22: do NOT refetch per
  build/CI — geometry is near-static; refresh manually if ever needed,
  and widen the building bboxes in that same one-time refresh). Only
  **incident data** hits the Socrata API at **run time** (browser-direct,
  CORS is open; register a free Socrata app token for rate limits — it's
  fine to ship in the client).
- **Time model**: free date range, capped at a 30-day span. Implemented
  in the mockup as a sub-range of the fetched 30-day window (histogram
  brush); ranges reaching further back than 30 days would need a refetch
  and are left for the real build.
- **V1 scope**: heat + date range + category filter + neighborhood ranking +
  points overlay.
- **Design taste** (hard-won): minimal, monochrome, map is the centerpiece.
  Abstract data overlays (smooth heat, contours, 3D hex/grid columns) all
  failed — density must be painted onto real geometry, below the buildings.
  Street ink should match block ink strength, never exceed it.

## Next steps

**The port shipped 2026-08-22** — see `PORT_PLAN.md` (kept as the
architecture record, with as-built amendments in §2.1 and §4). Dev loop:
`cd app && npm install && npm run dev`; verify with `npm run typecheck`,
`npm test`, `npm run e2e` (build + `deploy:root` first — the e2e serves
the deployed repo-root layout); ship with `npm run deploy:root` and push
main.

1. Collect feedback on the live app.
2. Register a Socrata app token (→ `VITE_SODA_APP_TOKEN` at build) to
   move off the tokenless throttle pool.
3. One-time geometry refresh with widened building bboxes (fixes the
   Russian Hill cutoff), committed to the repo — needs a
   network-enabled machine; the deploy does NOT refetch geometry
   (decision above).
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
