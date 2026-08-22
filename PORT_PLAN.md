# Block Report — Port Plan (mockup → Vite + vanilla TypeScript)

_Written 2026-08-22. The mockup (`mockups/23-buildings-blocks.html`, ~2,770
lines, one file, two inline ES5 scripts) is feature-complete for V1 and is
NOT to be touched during the port — it is the reference implementation and
the test oracle. This document is the full plan: target architecture,
simplifications, testing strategy, sequencing, known bugs to fix in
transit, and open decisions._

Standing decisions this plan honors (see HANDOFF.md):

- Vite + **vanilla TypeScript, no React**.
- Geometry is a **one-time full download committed to the repo** — CI/deploy
  never fetches from Socrata.
- Only incident data is fetched at runtime (one capped request).
- The locked-in look is sacred: the port must be visually and behaviorally
  faithful. Every tuned constant survives verbatim.

---

## 1. Target architecture

Layered, with a hard rule: **everything below `map/` and `ui/` is pure**
(no DOM, no MapLibre, no fetch) — that is what makes the math testable and
is the single biggest structural win over the mockup.

```
src/
  config.ts            all locked-in constants, typed + frozen
  main.ts              boot: load → build state → wire map + ui
  state.ts             AppState + ~30-line store (subscribe/commit)

  data/
    socrata.ts         query builder, fetch w/ timeout+abort, typed rows
    incidents.ts       window calc (SF calendar), fetch→Incident[], fake fallback
    geometry.ts        static snapshot loaders (blocks/streets/buildings/nhoods)

  model/               ← pure, unit-tested
    types.ts           Incident, Spot, DensityField, Filters, ...
    geo.ts             centroid, arc-length midpoint, label point (PoI),
                       shoelace, pointInRing
    density.ts         grid bin/blur/normalize/gamma + bilinear sample
    aggregate.ts       spot aggregation (n, cats, intersection, w-law)
    filters.ts         Filters type + applyFilters(incidents, filters)
    stats.ts           daily counts, category counts, hood ranking
    scoring.ts         block + street scoring against a DensityField

  map/
    createMap.ts       init, camera constraints (rubber band), cooperative
                       gestures, basemap desaturation, road-dim/sub-streets
    paint.ts           THE visual laws: ramp anchors, alpha stops, entrance
                       curves — single source (see §2, unification)
    expressions.ts     typed expression builders (zoomCurve, ramps)
    layers/blocks.ts   add/update per visual system; each owns its layer
    layers/buildings.ts
    layers/streets.ts  (MapLibre renderer only — see §2, deck.gl)
    layers/dots.ts     threshold fade regime + details popup
    layers/labels.ts   two-regime size curve, inversion
    pings.ts           markers + scale law

  ui/
    panel.ts           assembles the widgets
    histogram.ts       render + date brush
    chips.ts           category filters + All/None
    ranking.ts, legend.ts, notice.ts, loading.ts
    pins.ts            address form, Nominatim client, list
    compass.ts, scrollHint.ts
  styles/              extracted CSS (tokens stay CSS custom props)
public/
  data/                geometry snapshots (moved from mockups/data)
```

### The state model (replaces ~40 module globals)

One `AppState`, one commit path — formalizing what the mockup's
`commitFilters → refreshPanel + recomputeMapData` does informally:

```
AppState {
  incidents: Incident[] | null      // parsed ONCE at the boundary
  live: boolean                     // vs simulated fallback
  filters: { dateSel: {a,b} | null, activeCats: Set<string> | null }
  pristineField: DensityField       // never overwritten
  activeField: DensityField         // = pristine when filters are pristine
  loadStatus: per-source enum       // replaces six booleans + cross-checks
}
```

- UI events mutate `filters` → `commit()` → derive (filtered incidents,
  fields, spots, stats) → notify subscribers (layer modules, panel
  widgets). Unidirectional; no framework, no pub-sub library.
- `Incident` carries `{date, category, neighborhood, intersection, lngLat}`
  — the mockup's parallel `rows` + `rawFC` representations (and the
  duplicated `activeRows`/`activeFeats` filter logic) collapse into one
  array with one filter function. GeoJSON is derived only at the MapLibre
  boundary. This kills a whole class of drift bugs.
- The degrade ladder (block/street/building failures, dots-carry-alone)
  becomes a pure function of `loadStatus` instead of scattered flags.

---

## 2. Simplifications (changes I want to make in transit)

Ordered by conviction.

1. **Drop deck.gl entirely.** The deck street renderer (MAX-blend
   premultiplied canvas, label clearing radii, canvas-opacity syncing, the
   conditional `document.write` loader) exists to serve street ink — which
   is OFF in the locked look. Port only the MapLibre street renderer
   (already what mobile uses), behind a `STREETS_ON` config flag, default
   off. Saves ~1MB of library, a second WebGL context, and the single
   hairiest subsystem. Revisit only if street ink ever comes back strong.
   _Needs sign-off — it deletes a working renderer._

2. **Drop the remote Socrata fallbacks for geometry.** Snapshots are
   committed and served same-origin; if they 404 the deploy is broken and
   a live-query fallback masks it. Incidents keep their fallback (the
   simulated set) — that one earns its keep.

3. **Unify the paint laws.** The near-linear alpha ramp stops currently
   exist in three places (block opacity expr, `STREET_ALPHA_STOPS`, street
   color stops) and the charcoal anchors in three more (HEAT array, block
   color expr, building color expr). `map/paint.ts` becomes the single
   source; expressions and any JS-side lerp both read from it.

4. **Delete vestiges.** `HANDOFF_SHIFT`/`shiftStops` (permanently 0),
   `INK`/`CONTRAST` (both 1.0 — fold them out of the formulas or keep as
   named constants in config, but stop threading them through every
   expression), the `renderChips` static variant if fallback chips can
   share the filter-chip renderer in disabled state.

5. **Modern TypeScript.** `strict`, `noUncheckedIndexedAccess`, ES2020
   target, `const`/arrow/template literals; typed
   `ExpressionSpecification` builders so the zoom-outer-interpolate rule
   (the twice-bitten MapLibre gotcha) is enforced by a helper rather than
   a comment.

6. **Do NOT worker-ize the recompute yet.** Grid blur + block rescore +
   re-tiling measured fast on desktop; a Web Worker adds transfer and
   lifecycle complexity. Profile on-device first; the plan reserves it as
   a follow-up only if the brush commit janks on phones.

7. **Do NOT repack the building snapshots.** GitHub Pages compresses JSON
   at the edge; the 18MB/6.3MB split and the mobile budget work are
   validated on-device. A compact binary coord format is listed as a
   later optimization, not part of the port.

### Explicitly NOT changing

- Any tuned constant: zoom choreography (dots z12.5 timed fade 300ms,
  handoff z14.5→16, sub-streets +0.5), charcoal ramp, alpha toe, gamma,
  p99/p99.5 normalizations, dot w-law and floors, camera soft limits,
  accent usage, label size-curve bend at z14.
- The one-request Socrata pattern and 25k cap rationale.
- The mobile path decisions (reduced snapshot, pixelRatio clamp).
- localStorage keys (`block-report-pings`) — existing pins must survive.

---

## 3. Testing

### 3.1 Golden-oracle parity tests (the port's safety net)

Before porting any math, extend the existing Node stub harness
(`scratchpad/harness.js` pattern — promote it into `tools/oracle/`) to run
the UNTOUCHED mockup script against fixed fixtures and dump goldens:

- density field samples on a lat/lng probe grid (Tenderloin ≈ 1, ocean 0,
  the filtered/pristine pair),
- aggregated spots (w, n, cats, intersection) for a crafted address mix,
- panel numbers (count/histogram/ranking) pristine + filtered + restored,
- block scores for fixture geometry.

Ported modules must reproduce these goldens bit-for-bit (or within 1e-6).
This is how the port proves it didn't drift from the mockup without the
mockup ever changing.

### 3.2 Unit tests (Vitest) — the pure layer

- `density`: binning edges, blur behavior, percentile normalization,
  gamma, bilinear sampling continuity, empty-input (all-zero field).
- `geo`: centroids (polygon/multipolygon/closed rings), arc-length
  midpoint, label point inside concave polygons and polygons with holes.
- `aggregate`: dedupe by coordinate, category tallies, first-intersection,
  the w-law incl. the ref-floor-of-4 fallback case, empty set.
- `filters`/`stats`: date-window + category filtering, `__other` bucket
  semantics, All/None, count/ranking/histogram derivations.
- `incidents`: window math around DST changes and UTC midnight
  (`sfDayISO`), query URL construction, cap detection, timeout/abort
  (mocked fetch), fallback engagement.
- `expressions`: builders emit expected stop arrays (snapshots); a guard
  test that no builder ever nests `['zoom']` inside an arithmetic op.
- `desaturation`: `grayValue` over plain strings, match expressions,
  legacy `{stops}` (port of the ad-hoc tests already run).
- `paint`: single-source ramps — assert block/street/building ramps all
  derive from the same anchors.

### 3.3 Integration/E2E (Playwright, real MapLibre, mocked network)

Route-mock Socrata + Nominatim with fixtures; serve snapshots locally.
(Infrastructure exists in embryo: `scratchpad/overflow-test.js`.)

- Smoke: load, all layers present, zero console errors, panel matches
  fixture numbers.
- Filter flows: chip toggle / All / None → count, dots, blocks mode
  (buildings hidden, flat block opacity) all change and restore.
- Brush: drag → dim bars + period label + Reset link; commit updates
  everything; tap = single day; full-track drag = reset.
- Dots: absent below z12.5, present above (timed fade — assert end
  states), popup content (intersection, count, categories) from fixture.
- Pins: add by address (mocked geocoder), list, remove via ×, reload →
  localStorage restore, legacy bare-pair format restore.
- Fallback: Socrata route aborted → simulated density + notice + static
  chips + brush disabled.
- Mobile viewport: cooperative gestures active, `scrollWidth ==` viewport
  (port the overflow test as a permanent regression test), scroll-hint
  scrolls to panel.
- Camera: rubber-band spring-back after programmatic overscroll.

### 3.4 Visual regression (the parity gate for the flip)

Screenshot at pinned camera states — citywide z11.85, dots regime z13,
mid-handoff z15, close-in z16, plus the 390px mobile framing — and diff
against baselines **captured from the mockup first**.

Honest caveat: the basemap comes from CARTO at runtime, which makes
pixel-diffs nondeterministic. Two-step approach:

1. Start with our-layers-only shots (initialize with a blank style;
   deterministic today, covers 90% of drift risk).
2. Optionally vendor a small tile/style fixture set for full-scene shots
   later.

### 3.5 Manual on-device checklist (things automation can't judge)

Gesture feel (cooperative gestures, brush vs. scroll), the 300ms dot fade
and label bend at real pinch speeds, iOS memory stability (the original
crash class), brush-commit latency on a mid phone, thermals.

---

## 4. Build, CI, deploy

- Vite `vanilla-ts` template, `base: '/sf-block-report/'`; ESLint +
  Prettier; Vitest; Playwright.
- Snapshots move to `public/data/` (the mockup keeps its own copy in
  `mockups/data/` untouched — accept the 31MB duplication until the flip,
  then decide whether the mockup archive keeps data or gets a note).
- Socrata app token: repo secret → `VITE_SODA_APP_TOKEN` at build (public
  in the client by design; the secret is just hygiene). Register the
  token as part of this phase.
- GitHub Actions on push to main: typecheck → lint → unit → build → E2E
  (smoke + layers-only visual) → deploy `dist/` to Pages via
  `actions/deploy-pages`. **No geometry fetching anywhere in CI** (decision
  on record).
- Pages layout during the port: root redirect keeps pointing at the
  mockup; the app deploys under `/app/`. The flip (§5 phase 6) is a
  one-line redirect change, trivially revertible.

---

## 5. Sequencing (each phase lands green and deployable)

0. **Scaffold** — Vite/TS/lint/test/CI skeleton, deployed to `/app/`
   (hello-map). Root untouched.
1. **Oracle + pure domain** — promote the stub harness to
   `tools/oracle/`, capture goldens from the mockup; port
   `model/*` verbatim with unit tests pinning the goldens.
2. **Data layer** — `socrata`/`incidents`/`geometry` + `config.ts`;
   window math + fallback under test.
3. **Map shell** — `createMap` (desaturation, camera, constraints,
   sub-streets), then layers in dependency order: blocks → dots →
   buildings → labels → (streets, flag-off). Visual baselines per layer.
4. **UI + store** — widgets, the commit path, degrade ladder as state.
5. **Parity gate** — full E2E + visual diff against mockup baselines;
   burn down drift; on-device checklist.
6. **Flip** — root redirect → app; `mockups/` stays deployed as the
   archive. Watch feedback; revert is one line.
7. **Post-port (separate tasks)**: one-time geometry refresh with widened
   building bboxes (fixes the Russian Hill cutoff; needs Socrata access
   from a network-enabled machine), then delete this plan's caveats from
   HANDOFF.

---

## 6. Known quirks/bugs in the mockup — fix during port (with tests)

1. **`__other` asymmetry**: toggling every chip off individually still
   shows uncategorized dots; the None button hides them. Decide one
   semantic (recommend: uncategorized follows "are ALL chips off?") and
   test it.
2. **All/None don't touch the date brush**: "All" after a brush leaves the
   date filter active. Probably correct (orthogonal controls) — but
   document it, and consider a single "Clear filters" affordance.
3. **Stale popup**: a dot's details popup stays open when a filter change
   removes that dot underneath it. Close popups on commit.
4. **Duplicate pins**: the same address can be pinned twice. Dedupe by
   geocode result or label.
5. **`Updated` date** shows the fetch window's end, not the dataset's true
   max date; on a reporting-lag day it overstates freshness. Derive from
   max(incident_date) instead.
6. **Fallback brush**: silently inert in simulated mode. Fine, but add
   `aria-disabled` and skip the crosshair cursor.
7. **Label first-crossing size jump** (MapLibre symbol-bucket warm-up):
   not fixable in-engine; document in code where the size curve bends.
8. **Histogram peak bar** highlights the max of the category-filtered full
   window even when a brush selection excludes it — harmless, but decide
   whether "peak" means window-peak or selection-peak.

---

## 7. Open decisions (need sign-off before/during port)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Drop deck.gl + the MAX-blend street renderer | Yes — dead weight behind an off-flag |
| 2 | Drop remote geometry fallbacks | Yes — same-origin static now |
| 3 | Streets: port the MapLibre renderer behind a flag, or drop street ink entirely (git history keeps it) | Port behind flag — cheap, preserves the option |
| 4 | `__other` semantics (quirk #1) | Uncategorized follows the all-chips state |
| 5 | Mockup archive: keep `mockups/` + its 31MB data deployed after the flip | Keep — it's the design record; revisit if repo size hurts |
| 6 | Worker-ize recompute | Only if on-device profiling says so |

---

_When the port starts, work from this document top-down; keep HANDOFF.md
as the living state doc and update it per phase. The mockup file itself
does not change — any bug found in it during the port gets fixed in the
port and listed in §6, not backported._
