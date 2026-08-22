/* Map pings (home / work / anywhere), added by address in the panel.
   Pins scale under the same law as the labels — constant screen size to
   z14, then fixed world size (2^(z-14)), growing about their tip.
   Display-only on the map (pointer-events:none in CSS): removal happens
   only via the panel list, so a stray tap can't delete home/work.
   Persisted per device in localStorage; the earliest saves were bare
   [lng,lat] pairs and still restore. */

import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import { LABEL_INVERT_DENS, PING_SCALE_AT, PING_STORAGE_KEY } from '../config';

export interface Ping {
  label: string;
  lng: number;
  lat: number;
}

interface Live extends Ping {
  marker: maplibregl.Marker;
  pinEl: HTMLElement;
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
    /* the label rides inside the scaled element, so it grows in-world
       with the pin under the same 2^(z-14) law as the map labels */
    const labelEl = document.createElement('span');
    labelEl.className = 'pin-label';
    if ((densityAt?.(p.lng, p.lat) ?? 0) >= LABEL_INVERT_DENS) labelEl.classList.add('on-dark');
    labelEl.textContent = p.label;
    pinEl.appendChild(labelEl);
    el.appendChild(pinEl);
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([p.lng, p.lat])
      .addTo(map);
    pings.push({ ...p, marker, pinEl });
    updateScales();
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
      save();
      notify();
    },
    list: () => pings.map(({ label, lng, lat }) => ({ label, lng, lat })),
    hasLabel: (label) => pings.some((p) => p.label.toLowerCase() === label.toLowerCase()),
    onChange: (fn) => changeFns.push(fn),
  };
}
