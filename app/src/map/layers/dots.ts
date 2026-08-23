import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import {
  DOTS_FADE_MS, DOTS_LOD_SPOT_AT, DOT_STROKE_MAX, NHOOD_DISPLAY,
} from '../../config';
import type { Spot } from '../../model/types';
import type { LodSpots } from '../../state';
import { dotColorExpr, dotRadiusExpr, dotStrokeWidthExpr } from '../expressions';

/* Two mirrored circle layers so LoD changes CROSSFADE: the incoming
   level fades in on the idle layer while the outgoing one fades out,
   over DOTS_FADE_MS. (One layer + setData would snap.) */
export const DOTS_LAYER = 'points';
const DOTS_LAYER_B = 'points-b';
const LAYERS = [DOTS_LAYER, DOTS_LAYER_B] as const;

type Level = keyof LodSpots;

/* the LoD ladder: what one dot MEANS at each zoom band */
function levelFor(z: number): Level {
  if (z < DOTS_LOD_SPOT_AT) return 'nhood';
  return 'spot';
}

function spotsFC(spots: ReadonlyArray<Spot>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots.map((s) => ({
      type: 'Feature',
      properties: { w: s.w, n: s.n, x: s.intersection, kind: s.kind, cats: JSON.stringify(s.cats) },
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    })),
  };
}

export interface DotsHandle {
  setSpots(spots: LodSpots): void;
  /* degrade path: no density layers, so individual dots carry the map
     alone at every zoom */
  forceAlwaysOn(): void;
  closePopup(): void;
  /* e2e/debug: which level is showing, and how many dots it holds */
  lodState(): { level: Level; count: number };
}

/* MapLibre gotchas that shape this file: data-driven paint props aren't
   transitionable, so per-spot strength lives in the color's alpha (see
   dotColorExpr) and the two opacity props stay plain constants the
   watcher flips; and circle-opacity fades the FILL only — the stroke
   rides its own circle-stroke-opacity, so both are always flipped
   together. */
export function addDotsLayer(map: MLMap): DotsHandle {
  const setTransition = map.setPaintProperty.bind(map) as (id: string, name: string, v: unknown) => void;
  for (const id of LAYERS) {
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id,
      type: 'circle',
      source: id,
      paint: {
        'circle-radius': dotRadiusExpr(),
        'circle-color': dotColorExpr(),
        'circle-opacity': 0,
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-opacity': 0,
        /* the stroke thins at citywide zoom: a full-width ring around a
           ~1.6px dot outweighed the fill and read as measles */
        'circle-stroke-width': dotStrokeWidthExpr(),
      },
    });
    /* -transition props are runtime-valid but absent from the typed
       paint spec, so they go in via setPaintProperty */
    setTransition(id, 'circle-opacity-transition', { duration: DOTS_FADE_MS });
    setTransition(id, 'circle-stroke-opacity-transition', { duration: DOTS_FADE_MS });
  }

  let data: LodSpots = { nhood: [], spot: [] };
  let active = 0; /* index into LAYERS currently showing */
  let level: Level | null = null;
  let forced = false;
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  const src = (i: number): GeoJSONSource | undefined => map.getSource(LAYERS[i]!) as GeoJSONSource | undefined;

  const updateRegime = (): void => {
    const want = forced ? 'spot' : levelFor(map.getZoom());
    if (want === level) return;
    const from = active;
    const to = level === null ? active : 1 - active; /* first show needs no swap */
    src(to)?.setData(spotsFC(data[want]) as never);
    map.setPaintProperty(LAYERS[to]!, 'circle-opacity', 1);
    map.setPaintProperty(LAYERS[to]!, 'circle-stroke-opacity', DOT_STROKE_MAX);
    if (to !== from) {
      map.setPaintProperty(LAYERS[from]!, 'circle-opacity', 0);
      map.setPaintProperty(LAYERS[from]!, 'circle-stroke-opacity', 0);
      /* once the fade-out lands, empty the idle layer so its invisible
         circles stop catching clicks */
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        if (from !== active) src(from)?.setData({ type: 'FeatureCollection', features: [] } as never);
      }, DOTS_FADE_MS + 50);
    }
    active = to;
    level = want;
  };
  map.on('zoom', updateRegime);

  /* ---- details popup: tap a dot for what it stands for at this level —
     a neighborhood or one intersection — plus report count and category
     breakdown ---- */
  let popup: maplibregl.Popup | null = null;
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
  const onDotClick = (layerIdx: number) => (e: maplibregl.MapLayerMouseEvent): void => {
    if (layerIdx !== active) return; /* the fading-out twin still hit-tests */
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties as { n: number; x?: string; kind?: string; cats?: string };
    let cats: Record<string, number> = {};
    try {
      cats = JSON.parse(p.cats ?? '{}') as Record<string, number>;
    } catch {
      /* malformed tally — show the count alone */
    }
    const rows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    /* the dataset separates cross streets with a backslash */
    const cross = p.x ? String(p.x).replace(/\s*\\\s*/g, ' & ') : '';
    const loc = p.kind === 'nhood' ? (NHOOD_DISPLAY[p.x ?? ''] ?? p.x ?? '') : cross;
    const html =
      (loc ? `<div class="pop-loc">${esc(loc)}</div>` : '') +
      `<div class="pop-count num">${p.n}${p.n === 1 ? ' report' : ' reports'}</div>` +
      rows.slice(0, 6)
        .map(([k, v]) => `<div class="pop-row"><span>${esc(k)}</span><span class="num">${v}</span></div>`)
        .join('');
    popup?.remove();
    popup = new maplibregl.Popup({ closeButton: false, className: 'ink-pop', maxWidth: '260px', offset: 10 })
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(html)
      .addTo(map);
  };
  LAYERS.forEach((id, i) => {
    map.on('click', id, onDotClick(i));
    map.on('mouseenter', id, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', id, () => {
      map.getCanvas().style.cursor = '';
    });
  });

  return {
    setSpots(spots) {
      data = spots;
      if (level === null) updateRegime(); /* first data: show the zoom's level */
      else src(active)?.setData(spotsFC(data[level]) as never);
    },
    forceAlwaysOn() {
      forced = true;
      updateRegime();
    },
    closePopup() {
      popup?.remove();
      popup = null;
    },
    lodState() {
      return { level: level ?? levelFor(map.getZoom()), count: level ? data[level].length : 0 };
    },
  };
}
