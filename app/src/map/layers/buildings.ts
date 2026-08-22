import type { Map as MLMap } from 'maplibre-gl';
import { BLDG_MINZOOM } from '../../config';
import type { BuildingFeature } from '../../data/geometry';
import { buildingColorExpr, buildingHeightExpr, buildingOpacityExpr } from '../expressions';
import { DOTS_LAYER } from './dots';

export const BUILDINGS_LAYER = 'buildings';

/* Buildings are scored ONCE, from the pristine field, at load. While any
   filter is active they hide and the block mosaic carries all zooms
   (approved trade: re-scoring 76k footprints per toggle costs seconds);
   clearing filters restores them, still valid. */
export function addBuildingsLayer(
  map: MLMap,
  fc: { type: 'FeatureCollection'; features: BuildingFeature[] },
  visible: boolean,
): void {
  map.addSource(BUILDINGS_LAYER, { type: 'geojson', data: fc as never });
  map.addLayer(
    {
      id: BUILDINGS_LAYER,
      type: 'fill-extrusion',
      source: BUILDINGS_LAYER,
      minzoom: BLDG_MINZOOM, /* truly gone when zoomed out — entrance curves
                                are already at zero here, so no pop */
      layout: { visibility: visible ? 'visible' : 'none' },
      paint: {
        'fill-extrusion-color': buildingColorExpr(),
        'fill-extrusion-height': buildingHeightExpr(),
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': buildingOpacityExpr(),
      },
    },
    map.getLayer(DOTS_LAYER) ? DOTS_LAYER : undefined, /* keep dots above the volumes */
  );
}

export function setBuildingsVisible(map: MLMap, visible: boolean): void {
  if (!map.getLayer(BUILDINGS_LAYER)) return;
  map.setLayoutProperty(BUILDINGS_LAYER, 'visibility', visible ? 'visible' : 'none');
}
