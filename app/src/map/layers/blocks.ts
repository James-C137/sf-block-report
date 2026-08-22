import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import type { BlocksData } from '../../data/geometry';
import type { DensityField } from '../../model/types';
import { scoreBlocks } from '../../model/scoring';
import { blockColorExpr, blockOpacityExpr, blockOpacityFlatExpr } from '../expressions';

export const BLOCKS_LAYER = 'blocks';

function rescore(data: BlocksData, field: DensityField): void {
  const scores = scoreBlocks(data.cents, field);
  data.gj.features.forEach((f, i) => {
    f.properties.v = scores[i] ?? 0;
  });
}

export function addBlocksLayer(map: MLMap, data: BlocksData, field: DensityField): void {
  rescore(data, field);
  map.addSource(BLOCKS_LAYER, { type: 'geojson', data: data.gj as never });
  /* slid UNDER the basemap's roads so the street grid carves through */
  let beforeId: string | undefined;
  for (const l of map.getStyle().layers ?? []) {
    if (/^(tunnel|road|bridge|rail|aeroway)/.test(l.id)) {
      beforeId = l.id;
      break;
    }
  }
  map.addLayer(
    {
      id: BLOCKS_LAYER,
      type: 'fill',
      source: BLOCKS_LAYER,
      paint: {
        'fill-color': blockColorExpr(),
        'fill-opacity': blockOpacityExpr(),
        'fill-antialias': false,
      },
    },
    beforeId,
  );
}

/* re-score against the current (filtered or pristine) field; in filtered
   mode the buildings hide, so blocks carry all zooms flat */
export function updateBlocks(map: MLMap, data: BlocksData, field: DensityField, pristine: boolean): void {
  const src = map.getSource(BLOCKS_LAYER) as GeoJSONSource | undefined;
  if (!src) return;
  rescore(data, field);
  src.setData(data.gj as never);
  map.setPaintProperty(BLOCKS_LAYER, 'fill-opacity', pristine ? blockOpacityExpr() : blockOpacityFlatExpr());
}
