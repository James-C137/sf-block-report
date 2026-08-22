import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import { DOTS_FADE_AT, DOTS_FADE_MS, DOT_STROKE_MAX } from '../../config';
import type { Spot } from '../../model/types';
import { dotColorExpr, dotRadiusExpr, dotStrokeWidthExpr } from '../expressions';

export const DOTS_LAYER = 'points';

function spotsFC(spots: ReadonlyArray<Spot>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: spots.map((s) => ({
      type: 'Feature',
      properties: { w: s.w, n: s.n, x: s.intersection, cats: JSON.stringify(s.cats) },
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    })),
  };
}

export interface DotsHandle {
  setSpots(spots: ReadonlyArray<Spot>): void;
  /* degrade path: dots carry the map alone at every zoom */
  forceAlwaysOn(): void;
  closePopup(): void;
}

/* Dots enter via a TIMED fade at the z12.5 threshold — crossing it in
   either direction runs a fixed-duration opacity transition, not a
   zoom-interpolated entrance. MapLibre gotcha that shapes this:
   data-driven paint props aren't transitionable, so per-spot strength
   lives in the color's alpha (see dotColorExpr) and the two opacity
   props stay plain constants the watcher flips. The related earlier
   bite: circle-opacity fades the FILL only — the stroke rides its own
   circle-stroke-opacity, so the watcher flips both. */
export function addDotsLayer(map: MLMap): DotsHandle {
  map.addSource(DOTS_LAYER, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: DOTS_LAYER,
    type: 'circle',
    source: DOTS_LAYER,
    minzoom: DOTS_FADE_AT - 0.5, /* culled well below the threshold — far
                                    enough down that the timed fade
                                    finishes before the cut */
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
  /* -transition props are runtime-valid but absent from the typed paint
     spec, so they go in via setPaintProperty */
  const setTransition = map.setPaintProperty.bind(map) as (id: string, name: string, v: unknown) => void;
  setTransition(DOTS_LAYER, 'circle-opacity-transition', { duration: DOTS_FADE_MS });
  setTransition(DOTS_LAYER, 'circle-stroke-opacity-transition', { duration: DOTS_FADE_MS });

  let shown = false;
  let forced = false;
  const updateRegime = (): void => {
    const want = forced || map.getZoom() >= DOTS_FADE_AT;
    if (want === shown) return;
    shown = want;
    map.setPaintProperty(DOTS_LAYER, 'circle-opacity', want ? 1 : 0);
    map.setPaintProperty(DOTS_LAYER, 'circle-stroke-opacity', want ? DOT_STROKE_MAX : 0);
  };
  map.on('zoom', updateRegime);
  updateRegime();

  /* ---- details popup: tap a dot for its spot's intersection, report
     count, and category breakdown ---- */
  let popup: maplibregl.Popup | null = null;
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
  map.on('click', DOTS_LAYER, (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties as { n: number; x?: string; cats?: string };
    let cats: Record<string, number> = {};
    try {
      cats = JSON.parse(p.cats ?? '{}') as Record<string, number>;
    } catch {
      /* malformed tally — show the count alone */
    }
    const rows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    /* the dataset separates cross streets with a backslash */
    const loc = p.x ? String(p.x).replace(/\s*\\\s*/g, ' & ') : '';
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
  });
  map.on('mouseenter', DOTS_LAYER, () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', DOTS_LAYER, () => {
    map.getCanvas().style.cursor = '';
  });

  return {
    setSpots(spots) {
      (map.getSource(DOTS_LAYER) as GeoJSONSource | undefined)?.setData(spotsFC(spots) as never);
    },
    forceAlwaysOn() {
      map.setLayerZoomRange(DOTS_LAYER, 0, 24);
      forced = true;
      updateRegime();
    },
    closePopup() {
      popup?.remove();
      popup = null;
    },
  };
}
