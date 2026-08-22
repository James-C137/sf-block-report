import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { TOTAL_BLDG_ROWS_DESKTOP, TOTAL_BLDG_ROWS_MOBILE } from './config';
import { loadIncidents, reportWindow } from './data/incidents';
import { loadBlocks, loadBuildingRows, loadNeighborhoods, toBuildingFC } from './data/geometry';
import { createMap } from './map/createMap';
import { addBlocksLayer, updateBlocks } from './map/layers/blocks';
import { addBuildingsLayer, setBuildingsVisible } from './map/layers/buildings';
import { addDotsLayer } from './map/layers/dots';
import { addLabelMarkers } from './map/layers/labels';
import { createPings } from './map/pings';
import { buildField, sampleField } from './model/density';
import { categoryCounts, sortedCounts } from './model/stats';
import { Store, type AppState } from './state';
import { initCompass, initLoading, initScrollHint } from './ui/chrome';
import { initPanel, showNotice } from './ui/panel';
import { initPinsUI } from './ui/pins';

async function boot(): Promise<void> {
  const { map, mobile } = createMap(document.getElementById('map')!);
  const mapLoaded = new Promise<void>((resolve) => map.on('load', () => resolve()));
  const loading = initLoading(mobile ? TOTAL_BLDG_ROWS_MOBILE : TOTAL_BLDG_ROWS_DESKTOP);
  initScrollHint();
  initCompass(map);

  /* geometry and incidents download in parallel; everything that scores
     against the density field joins on the incidents promise */
  const win = reportWindow();
  const incidentsP = loadIncidents(win);
  const blocksP = loadBlocks();
  const nhoodsP = loadNeighborhoods();
  const buildingsRowsP = loadBuildingRows(mobile, (n) => loading.bumpRows(n));

  const { incidents, live, capped } = await incidentsP;
  const pristineField = buildField(incidents);
  const allCats = sortedCounts(categoryCounts(incidents));
  const state: AppState = {
    win,
    incidents,
    live,
    capped,
    allCats,
    filters: { dateSel: null, activeCats: null },
    pristineField,
    load: { blocks: 'pending', buildings: 'pending' },
  };
  const store = new Store(state);
  initPanel(store);
  /* debug/e2e handle — the smoke suite drives assertions through it */
  (window as unknown as Record<string, unknown>).__blockReport = { map, store };

  await mapLoaded;
  const dots = addDotsLayer(map);
  dots.setSpots(store.derive().spots);
  const pings = createPings(map, (lng, lat) => sampleField(pristineField, lng, lat));
  initPinsUI(pings);

  const degradeIfBothFailed = (): void => {
    if (state.load.blocks === 'failed' && state.load.buildings === 'failed') {
      showNotice('Density layers could not be loaded — showing incident points instead.');
      /* the dots normally hold back below their threshold; with no
         density layers they're all we have, so un-gate the zoom */
      dots.forceAlwaysOn();
    }
  };

  let settleCount = 0;
  const settle = (): void => {
    settleCount += 1;
    if (settleCount >= 2) loading.settle();
  };

  const blocksReady = blocksP
    .then((data) => {
      addBlocksLayer(map, data, store.derive().activeField);
      state.load.blocks = 'ok';
      loading.setBlocksDone();
      settle();
      return data;
    })
    .catch((err) => {
      console.warn('Block load failed, buildings will carry it alone:', err);
      state.load.blocks = 'failed';
      settle();
      if (state.load.buildings !== 'failed') {
        showNotice('Block geometry could not be loaded — density shown per building only.');
      }
      degradeIfBothFailed();
      return null;
    });

  buildingsRowsP
    .then((rowsPerChunk) => {
      /* buildings score once, from the PRISTINE field */
      const fc = toBuildingFC(rowsPerChunk, (lng, lat) => sampleField(state.pristineField, lng, lat));
      addBuildingsLayer(map, fc, store.derive().pristine);
      state.load.buildings = 'ok';
      settle();
    })
    .catch((err) => {
      console.warn('Footprint load failed, blocks will carry it alone:', err);
      state.load.buildings = 'failed';
      settle();
      if (state.load.blocks !== 'failed') {
        showNotice('Building footprints could not be loaded — density shown per block only.');
      }
      degradeIfBothFailed();
    });

  /* labels are decorative — they load quietly and never touch the
     progress pill or the degrade ladder */
  nhoodsP
    .then((features) => {
      const labels = addLabelMarkers(map, features, state.pristineField);
      /* a new pin blocks label space — re-place without waiting for the
         next camera move */
      pings.onChange(() => labels.refresh());
    })
    .catch((err) => console.warn('Neighborhood names could not be loaded — map stays unlabeled:', err));

  /* ---- the commit path: every filter change re-derives the page ---- */
  store.subscribe((d) => {
    dots.closePopup(); /* a filtered-away dot must not keep a stale popup (§6.3) */
    dots.setSpots(d.spots);
    setBuildingsVisible(map, d.pristine);
    void blocksReady.then((data) => {
      if (data) updateBlocks(map, data, d.activeField, d.pristine);
    });
  });
}

void boot();
