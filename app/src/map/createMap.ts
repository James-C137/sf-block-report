import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import {
  BASEMAP_STYLE, BEARING, CENTER_NARROW, CENTER_WIDE, MAX_PITCH,
  MOBILE_PIXEL_RATIO_CAP, PITCH, SOFT_BOUNDS, SOFT_MIN_ZOOM, SPRING_MS,
  SUBSTREET_DELAY, SUBSTREET_FADE, SUBSTREET_MINZOOM_FLOOR,
  ZOOM_NARROW, ZOOM_WIDE,
} from '../config';
import { desaturateBasemap } from './desaturate';

export interface MapEnv {
  map: MLMap;
  narrow: boolean;
  mobile: boolean;
}

export function createMap(container: HTMLElement): MapEnv {
  const narrow = window.innerWidth < 900;
  /* phones and tablets get the reduced-budget path — iOS and Android kill
     the tab well before desktop GPU/heap budgets are reached */
  const mobile = narrow || (navigator.maxTouchPoints || 0) > 1;

  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE,
    /* default framing: full-city tilted view — the block mosaic carries
       the citywide read; buildings resolve out of it as you zoom in */
    center: narrow ? CENTER_NARROW : CENTER_WIDE,
    zoom: narrow ? ZOOM_NARROW : ZOOM_WIDE,
    pitch: PITCH,
    bearing: BEARING,
    maxPitch: MAX_PITCH,
    attributionControl: { compact: true },
    /* DPR-3 phones quadruple the framebuffer versus DPR 1.5 — clamp it */
    ...(mobile ? { pixelRatio: Math.min(window.devicePixelRatio || 1, MOBILE_PIXEL_RATIO_CAP) } : {}),
    /* on narrow layouts the map owns the whole first viewport with the
       panel scrolled below, so one-finger drags must keep scrolling the
       PAGE — cooperative gestures reserve the map for two fingers */
    ...(narrow ? { cooperativeGestures: true } : {}),
  });

  installRubberBand(map);
  map.on('load', () => {
    /* the basemap's flat building fills draw above the block choropleth
       at z14+ — hide them (our own extrusions replace them) */
    for (const id of ['building', 'building-top']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    }
    desaturateBasemap(map);
    delaySubStreets(map);
  });

  return { map, narrow, mobile };
}

/* ---------- rubber-band camera constraints ----------
   Soft limits keep the framing on SF and the Bay. NO hard walls
   (minZoom/maxBounds stay unset — a hard stop mid-gesture felt wrong):
   pull as far as you like; on release the camera springs back. */
function installRubberBand(map: MLMap): void {
  const rubberBand = (): void => {
    const z = map.getZoom();
    const c = map.getCenter();
    const tz = Math.max(z, SOFT_MIN_ZOOM);
    const lng = Math.min(Math.max(c.lng, SOFT_BOUNDS.w), SOFT_BOUNDS.e);
    const lat = Math.min(Math.max(c.lat, SOFT_BOUNDS.s), SOFT_BOUNDS.n);
    if (Math.abs(tz - z) < 0.01 && Math.abs(lng - c.lng) < 1e-4 && Math.abs(lat - c.lat) < 1e-4) return;
    /* fires on moveend, so it never fights an active gesture; a new grab
       mid-spring cancels the ease and the next release re-snaps */
    map.easeTo({
      zoom: tz,
      center: [lng, lat],
      duration: SPRING_MS,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  };
  map.on('moveend', rubberBand);
}

/* ---------- sub-streets ----------
   Positron pops its small road layers (minor/service/path) in abruptly
   at their own style minzoom, mid-handoff. Delay them by SUBSTREET_DELAY
   and fade them in over ~0.4 zoom instead. (The mockup also composed a
   street-ink road-dim into this curve; street ink was dropped entirely,
   so only the entrance remains.) */
function delaySubStreets(map: MLMap): void {
  for (const l of map.getStyle().layers ?? []) {
    if (l.type !== 'line') continue;
    if (!/minor|service|track|path|pedestrian/i.test(l.id)) continue;
    const mz = ('minzoom' in l ? l.minzoom : 0) ?? 0;
    if (mz < SUBSTREET_MINZOOM_FLOOR) continue; /* early layers never pop */
    const orig = map.getPaintProperty(l.id, 'line-opacity');
    const hi = typeof orig === 'number' ? orig : 1;
    const from = mz + SUBSTREET_DELAY;
    try {
      map.setPaintProperty(l.id, 'line-opacity', [
        'interpolate', ['linear'], ['zoom'],
        from, 0,
        from + SUBSTREET_FADE, hi,
      ]);
    } catch {
      /* leave the layer alone if the style rejects the expression */
    }
  }
}
