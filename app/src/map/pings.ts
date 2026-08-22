/* Map pings (home / work / anywhere), added by address in the panel.
   Pins scale under the same law as the labels — constant screen size to
   z14, then fixed world size (2^(z-14)), growing about their tip.
   Display-only on the map (pointer-events:none in CSS): removal happens
   only via the panel list, so a stray tap can't delete home/work.
   Persisted per device in localStorage; the earliest saves were bare
   [lng,lat] pairs and still restore. */

import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import { LABEL_INVERT_DENS, PING_SCALE_AT, PING_STORAGE_KEY } from '../config';
import { labelHaloWidthExpr, labelSizeExpr } from './expressions';

export interface Ping {
  label: string;
  lng: number;
  lat: number;
}

interface Live extends Ping {
  marker: maplibregl.Marker;
  pinEl: HTMLElement;
  dark: boolean; /* label sits on hotspot ink — inverted like the nhood labels */
}

export interface PingsHandle {
  add(p: Ping): void;
  remove(index: number): void;
  list(): Ping[];
  hasLabel(label: string): boolean;
  onChange(fn: () => void): void;
}

/* densityAt samples the pristine field: like the neighborhood labels, a
   pin label over a hotspot core inverts to white-on-graphite so it stays
   legible on the dark ink */
export function createPings(map: MLMap, densityAt?: (lng: number, lat: number) => number): PingsHandle {
  const pings: Live[] = [];
  const changeFns: Array<() => void> = [];
  const notify = (): void => changeFns.forEach((f) => f());

  /* Pin labels are a SYMBOL layer, not DOM — all map text goes through
     the library so type, halo, collision, and fading stay one system
     (user call after the DOM experiment). The layer sits above the
     nhood label layers (labels.ts inserts beneath it), so pins out-place
     the wayfinding; allow-overlap keeps a pin's own label from ever
     being culled. The em-based offset clears the head at every zoom
     because text size and pin both follow the same doubling law. */
  const LABELS_SRC = 'pin-labels';
  const labelsFC = (): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: pings.map((p) => ({
      type: 'Feature',
      properties: { label: p.label, dark: p.dark },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  });
  const syncLabels = (): void => {
    (map.getSource(LABELS_SRC) as GeoJSONSource | undefined)?.setData(labelsFC() as never);
  };
  map.addSource(LABELS_SRC, { type: 'geojson', data: labelsFC() as never });
  map.addLayer({
    id: LABELS_SRC,
    type: 'symbol',
    source: LABELS_SRC,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Montserrat Medium', 'Noto Sans Regular'],
      'text-size': labelSizeExpr(),
      'text-anchor': 'bottom',
      'text-offset': [0, -1.9], /* ems above the tip ≈ just over the head */
      'text-max-width': 12,
      'text-allow-overlap': true,
    } as never,
    paint: {
      'text-color': ['case', ['get', 'dark'], '#FFFFFF', '#3A3A3A'],
      'text-halo-color': ['case', ['get', 'dark'], 'rgba(26,26,26,0.9)', '#FFFFFF'],
      'text-halo-width': labelHaloWidthExpr(),
      'text-halo-blur': 0.2,
    } as never,
  });

  const scale = (): number => {
    const z = map.getZoom();
    return z <= PING_SCALE_AT ? 1 : Math.pow(2, z - PING_SCALE_AT);
  };
  const updateScales = (): void => {
    const s = `scale(${scale().toFixed(3)})`;
    for (const p of pings) p.pinEl.style.transform = s;
  };
  map.on('zoom', updateScales);

  const save = (): void => {
    try {
      localStorage.setItem(
        PING_STORAGE_KEY,
        JSON.stringify(pings.map((p) => ({ a: p.label, lng: +p.lng.toFixed(6), lat: +p.lat.toFixed(6) }))),
      );
    } catch {
      /* storage unavailable — pins just don't persist */
    }
  };

  const addLive = (p: Ping, skipSave: boolean): void => {
    const el = document.createElement('div');
    el.className = 'ping';
    el.title = p.label;
    const pinEl = document.createElement('span');
    pinEl.className = 'pin';
    el.appendChild(pinEl);
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([p.lng, p.lat])
      .addTo(map);
    const dark = (densityAt?.(p.lng, p.lat) ?? 0) >= LABEL_INVERT_DENS;
    pings.push({ ...p, marker, pinEl, dark });
    updateScales();
    syncLabels();
    if (!skipSave) save();
    notify();
  };

  /* restore */
  try {
    const raw = JSON.parse(localStorage.getItem(PING_STORAGE_KEY) ?? '[]') as unknown[];
    for (const c of raw) {
      if (Array.isArray(c) && isFinite(c[0] as number) && isFinite(c[1] as number)) {
        addLive({ label: 'Pin', lng: c[0] as number, lat: c[1] as number }, true);
      } else if (c && typeof c === 'object' && 'lng' in c && 'lat' in c) {
        const o = c as { a?: unknown; lng: number; lat: number };
        if (isFinite(o.lng) && isFinite(o.lat)) {
          addLive({ label: String(o.a ?? 'Pin'), lng: o.lng, lat: o.lat }, true);
        }
      }
    }
  } catch {
    /* corrupt storage — start empty */
  }

  return {
    add: (p) => addLive(p, false),
    remove(index) {
      const p = pings[index];
      if (!p) return;
      p.marker.remove();
      pings.splice(index, 1);
      syncLabels();
      save();
      notify();
    },
    list: () => pings.map(({ label, lng, lat }) => ({ label, lng, lat })),
    hasLabel: (label) => pings.some((p) => p.label.toLowerCase() === label.toLowerCase()),
    onChange: (fn) => changeFns.push(fn),
  };
}
