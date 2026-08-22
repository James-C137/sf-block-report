import type { Map as MLMap } from 'maplibre-gl';
import { LABEL_INVERT_DENS, NHOOD_DISPLAY, NHOOD_MAJORS } from '../../config';
import type { NhoodFeature } from '../../data/geometry';
import { labelPointOf } from '../../model/geo';
import { sampleField } from '../../model/density';
import type { DensityField } from '../../model/types';
import { labelHaloWidthExpr, labelSizeExpr } from '../expressions';

interface LabelRow {
  name: string;
  point: [number, number];
  area: number;
}

/* curated majors surface first at the citywide framing; the rest rank by
   polygon area and appear as you zoom past z12.6 */
export function toLabelFC(features: NhoodFeature[], field: DensityField): GeoJSON.FeatureCollection {
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
  return {
    type: 'FeatureCollection',
    features: rows.map((r, idx) => ({
      type: 'Feature',
      properties: {
        label: NHOOD_DISPLAY[r.name] ?? r.name,
        rank: idx + 1,
        /* density under the anchor — labels on the hotspot ink invert to
           paper-on-graphite so they stay readable */
        dens: +sampleField(field, r.point[0], r.point[1]).toFixed(3),
      },
      geometry: { type: 'Point', coordinates: r.point },
    })),
  };
}

export function addLabelLayers(map: MLMap, fc: GeoJSON.FeatureCollection): void {
  map.addSource('nhoods', { type: 'geojson', data: fc as never });
  const layout = {
    'text-field': ['get', 'label'],
    /* Inter glyphs aren't served by the CARTO stack; Montserrat Medium is
       the closest grotesque it has */
    'text-font': ['Montserrat Medium', 'Noto Sans Regular'],
    'text-size': labelSizeExpr(),
    'text-transform': 'uppercase',
    'text-letter-spacing': 0.14,
    'text-line-height': 1.4,
    'text-max-width': 7,
    'text-padding': 6,
    'symbol-sort-key': ['get', 'rank'], /* majors win collisions */
  };
  const onDark = ['>=', ['get', 'dens'], LABEL_INVERT_DENS];
  const paint = {
    /* strictly black/white type: graphite halo under white text on the
       hotspot cores, white halo under graphite text everywhere else */
    'text-color': ['case', onDark, '#FFFFFF', '#3A3A3A'],
    'text-halo-color': ['case', onDark, 'rgba(26,26,26,0.9)', '#FFFFFF'],
    'text-halo-width': labelHaloWidthExpr(),
    'text-halo-blur': 0.2,
  };
  map.addLayer({
    id: 'nhood-labels-major',
    type: 'symbol',
    source: 'nhoods',
    filter: ['<=', ['get', 'rank'], NHOOD_MAJORS.length],
    layout: layout as never,
    paint: paint as never,
  });
  map.addLayer({
    id: 'nhood-labels-minor',
    type: 'symbol',
    source: 'nhoods',
    minzoom: 12.6,
    filter: ['>', ['get', 'rank'], NHOOD_MAJORS.length],
    layout: layout as never,
    paint: {
      ...paint,
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 12.6, 0, 13.1, 1],
    } as never,
  });
}
