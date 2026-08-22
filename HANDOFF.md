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
  gray under the colored density). Panel UI stays monochrome graphite.
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
  curve, two regimes: near-constant screen-space px up to z14, then —
  just before the buildings enter at 14.5 — the law bends to doubling
  per zoom level (exponential base 2 = fixed world size), so the names
  scale with the city; the halo scales in step. The default upright
  camera-facing symbols already read as standing billboards, so no
  separate layer or crossfade is needed. Dead ends on record: a
  ground-plane variant (`pitch-alignment: map`) looked knocked over, and
  a separate timed-crossfade "world" layer was scrapped as redundant; a
  true fixed vertical plane (edge-on from straight above) isn't
  expressible in MapLibre symbols anyway.
- **Points overlay** (not a separate view, no toggle): dots draw above the
  extrusions and SNAP in at z13→13.25, opacity and radius together (they
  scale from a third of their size to full — slower fades felt draggy),
  minzoom-culled below — one level before the z14→15.5 building handoff,
  so the dots get a beat over the block mosaic before the volumes rise. GOTCHA (bit us): `circle-opacity` fades the FILL only;
  the stroke rides a separate `circle-stroke-opacity` (default 1), so it
  must follow the same entrance curve or the borders blink in at full
  strength at the minzoom boundary.
  If BOTH density layers fail, the degrade path un-gates the dots' zoom
  range so they can carry the map alone.
- **Street-ink controls** (panel; the one tuning section that came back
  after the great dial purge — the points On/Off stayed gone): an On/Off
  toggle, a "fades out at" zoom slider (z13–17, default = the building
  handoff end, currently 15.5; the fade keeps the ground-fade's
  held-then-release shape, translated so its endpoint lands on the slider
  value), and a strength slider measured in the SAME dimension as the
  block cap — 85% = `BLOCKS_MAX`, and the readout flags "= blocks" at
  that value. DEFAULT is 15%, tuned in by eye: street ink is a whisper
  under the mosaic, not an equal ground plane.
  All three drive both street renderers (deck.gl canvas +
  MapLibre fallback, via paint + zoom-range updates), and the basemap
  road-dim follows: roads un-dim when the ink is off and return along
  the slider's fade curve. Other defaults remain baked in: ink 100%,
  contrast 1.0, blocks 85%, height 100%, entrance "Both".
- **LOCKED-IN LOOK (2026-08-22, tuned by eye via the panel sliders)**:
  street ink OFF (the block mosaic carries the ground alone — the whole
  deck.gl MAX-blend street apparatus survives behind the toggle for
  experiments), handoff z14.5→16, sub-streets delay +0.5z, dots fade in
  at z12.5 / strength 85% (= blocks) / size 150%. These are the baked
  defaults; the reset button returns to exactly this state.
- **Handoff is baked at z14.5→16** (the crossfade started life at z13 and
  moved up twice). The slider remains for testing (z12.5–16.5 around the
  anchor).
- **Sub-streets delay** (panel slider, 0–2z, default +0.5): the basemap's
  small road layers (minor/service/path, ids matched at load with their
  own minzoom ≥ 11) popped in abruptly mid-handoff. Their entrance is now
  managed: delayed by the slider value past their style minzoom and faded
  in over ~0.4 zoom, pre-multiplied with the street-ink road-dim into a
  single numeric zoom curve (MapLibre allows only one top-level ['zoom']
  interpolate per property, so the two factors are sampled and combined).
- **Handoff slider** (panel, "Buildings in / blocks out", z12.5–16.5): slides
  the ENTIRE building-in/blocks-out crossfade along the zoom axis —
  entrance opacity + height curves, the ground fade, and the buildings'
  minzoom cull all translate together with their shapes intact
  (`HANDOFF_SHIFT` applied via `shiftStops`). The readout shows the live
  window (e.g. "z14.0–15.5"). Street ink and the dots' entrance have
  their own timing and deliberately do NOT follow this slider.
- **Dots sliders** (panel): "Fade in at" (z11–15, default z13 — moves the
  whole quarter-level snap-in, radius scale-in, stroke fade, and minzoom
  cull together), "Strength" (0–100%, same dimension as the block cap,
  default 85% "= blocks"), and "Size" (40–200% multiplier on the
  weight-scaled radius, default 100%).
- **Reset button** (panel, under the sliders): returns every tuning
  control — street ink, handoff, dots — to the baked defaults captured at
  load (`CONTROL_DEFAULTS`).
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
2. Real build: Vite + vanilla TS scaffold; port 23 as modules. The live
   Socrata incident fetch, density grid, and real-data panel (count,
   histogram, category chips, ranking) are DONE in the no-build page — still
   to wire: the interactive date-range brush and category chip filtering,
   plus a Socrata app token to move off the tokenless throttle pool.
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
