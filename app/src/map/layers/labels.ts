/* Neighborhood labels as DOM markers, NOT symbol layers. Symbol text
   comes out of a 24px SDF glyph atlas, so once the size curve blows it
   up in-world it reads soft/low-res next to the crisp DOM text of the
   pin labels. Rendering both through the same DOM `.map-label` system
   (one font, one halo, one inversion rule, one scale law) makes them
   cohesive — and drops the glyph fetch entirely. Trade accepted: no
   collision culling; SF neighborhoods are large enough that anchors
   don't crowd at the zooms where each tier is visible. */

import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import { LABEL_BEND_AT, LABEL_INVERT_DENS, NHOOD_DISPLAY, NHOOD_MAJORS } from '../../config';
import type { NhoodFeature } from '../../data/geometry';
import { labelPointOf } from '../../model/geo';
import { sampleField } from '../../model/density';
import type { DensityField } from '../../model/types';

const MINOR_FROM = 12.6; /* the long tail reveals over 12.6→13.1 */
const MINOR_FADE = 0.5;

interface LabelRow {
  name: string;
  point: [number, number];
  area: number;
}

/* curated majors surface first at the citywide framing; the rest rank by
   polygon area and appear as you zoom past z12.6 */
export function toLabelRows(features: NhoodFeature[]): LabelRow[] {
  const rows: LabelRow[] = [];
  for (const f of features) {
    const name = f.properties?.nhood;
    if (!name || !f.geometry || !('coordinates' in f.geometry)) continue;
    const lp = labelPointOf(f.geometry);
    if (!lp?.point) continue;
    rows.push({ name, point: lp.point, area: lp.area });
  }
  const majors = NHOOD_MAJORS as readonly string[];
  rows.sort((a, b) => {
    const ia = majors.indexOf(a.name);
    const ib = majors.indexOf(b.name);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return b.area - a.area;
  });
  return rows;
}

export function addLabelMarkers(map: MLMap, features: NhoodFeature[], field: DensityField): void {
  const items: Array<{ el: HTMLElement; minor: boolean }> = [];
  toLabelRows(features).forEach((r, idx) => {
    const minor = idx + 1 > NHOOD_MAJORS.length;
    const root = document.createElement('div');
    root.className = 'nhood';
    const el = document.createElement('span');
    el.className = 'map-label nhood-label';
    /* density under the anchor — labels on the hotspot ink invert to
       paper-on-graphite so they stay readable */
    if (sampleField(field, r.point[0], r.point[1]) >= LABEL_INVERT_DENS) el.classList.add('on-dark');
    el.textContent = NHOOD_DISPLAY[r.name] ?? r.name;
    root.appendChild(el);
    new maplibregl.Marker({ element: root, anchor: 'center' })
      .setLngLat(r.point)
      .addTo(map);
    items.push({ el, minor });
  });
  /* symbol layers faded labels in on first placement (~300ms); mirror
     that on the marker roots so the names don't pop in when the
     geometry lands. Runs a frame after insertion so the 0→1 transition
     actually plays. The per-zoom minor reveal lives on the inner label
     element, so the two opacities compose instead of fighting. */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const n of document.querySelectorAll<HTMLElement>('.nhood')) n.classList.add('nhood-in');
  }));

  /* same law as the pins: constant screen size to the bend, then fixed
     world size, scaling about the anchor */
  const update = (): void => {
    const z = map.getZoom();
    const s = z <= LABEL_BEND_AT ? 1 : Math.pow(2, z - LABEL_BEND_AT);
    const t = `translate(-50%,-50%) scale(${s.toFixed(3)})`;
    const minorOpacity = Math.min(1, Math.max(0, (z - MINOR_FROM) / MINOR_FADE));
    for (const it of items) {
      it.el.style.transform = t;
      if (it.minor) {
        it.el.style.opacity = String(minorOpacity);
        it.el.style.display = minorOpacity > 0 ? '' : 'none';
      }
    }
  };
  map.on('zoom', update);
  update();
}
