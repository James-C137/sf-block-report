/* Smoke suite for the built app. Serves the repository root (the deployed
   layout: index.html + assets/ + mockups/data/) under the GitHub Pages
   path prefix, mocks every external service at the network layer, and
   drives a real Chromium through the page's actual behavior. Spec-driven:
   nothing here reads or executes the mockup.

   Run: npm run build && node scripts/deploy-root.mjs && node e2e/run.mjs */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const PREFIX = '/sf-block-report/';

/* ---------- fixtures ---------- */

/* same SF-calendar window law as src/data/incidents.ts */
const sfDay = (msBack) =>
  new Date(Date.now() - msBack).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const windowDays = [];
for (let i = 30; i >= 1; i--) windowDays.push(sfDay(i * 86400000));

function fixtureRows() {
  const rows = [];
  /* six neighborhoods so the ranking provably shows ALL of them (the
     old top-5 cap would clip one) */
  const spots = [
    { lng: -122.414, lat: 37.783, cat: 'Larceny Theft', n: 40, x: 'MARKET ST \\ 7TH ST', nh: 'Tenderloin' },
    { lng: -122.419, lat: 37.76, cat: 'Assault', n: 25, x: 'MISSION ST \\ 20TH ST', nh: 'Mission' },
    { lng: -122.39, lat: 37.732, cat: 'Burglary', n: 15, x: '3RD ST \\ PALOU AVE', nh: 'Bayview Hunters Point' },
    { lng: -122.44, lat: 37.77, cat: 'Motor Vehicle Theft', n: 10, x: '', nh: 'Castro/Upper Market' },
    { lng: -122.436, lat: 37.8, cat: 'Assault', n: 6, x: 'CHESTNUT ST \\ FILLMORE ST', nh: 'Marina' },
    { lng: -122.407, lat: 37.801, cat: 'Burglary', n: 4, x: 'COLUMBUS AVE \\ GREEN ST', nh: 'North Beach' },
  ];
  let k = 0;
  for (const s of spots) {
    for (let i = 0; i < s.n; i++) {
      rows.push({
        incident_date: `${windowDays[k++ % windowDays.length]}T00:00:00.000`,
        incident_category: s.cat,
        analysis_neighborhood: s.nh,
        intersection: s.x,
        latitude: String(s.lat + (i % 5) * 1e-4),
        longitude: String(s.lng + (i % 7) * 1e-4),
      });
    }
  }
  /* one ungeocodable row the parser must drop */
  rows.push({ incident_date: `${windowDays[0]}T00:00:00.000`, incident_category: 'Fraud' });
  /* administrative rows the parser must exclude despite valid coords */
  for (let i = 0; i < ADMIN_ROWS; i++) {
    rows.push({
      incident_date: `${windowDays[i]}T00:00:00.000`,
      incident_category: i % 2 ? 'Case Closure' : 'Non-Criminal',
      analysis_neighborhood: 'Tenderloin',
      intersection: '',
      latitude: '37.782',
      longitude: '-122.414',
    });
  }
  return rows;
}
const ADMIN_ROWS = 6;
const ROWS = fixtureRows();
const GEOCODED = ROWS.length - 1 - ADMIN_ROWS;

const NOMINATIM_HIT = [{
  lat: '37.7811',
  lon: '-122.4159',
  name: '335 McAllister Street',
  display_name: '335, McAllister Street, Civic Center, San Francisco, California, 94102, United States',
}];

/* ---------- static server for the deployed layout ---------- */

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/json', '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!url.startsWith(PREFIX)) { res.writeHead(404); res.end(); return; }
  let rel = url.slice(PREFIX.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(repoRoot, rel);
  if (!file.startsWith(repoRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const PAGE_URL = `${ORIGIN}${PREFIX}`;

/* ---------- harness ---------- */

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${label}`);
  if (!cond) failures++;
};
const waitFor = async (page, fn, label, timeout = 30000) => {
  try {
    await page.waitForFunction(fn, undefined, { timeout });
    ok(true, label);
    return true;
  } catch {
    ok(false, `${label} (timed out)`);
    return false;
  }
};

async function routeExternals(context) {
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(ORIGIN)) return route.continue();
    if (u.includes('basemaps.cartocdn.com')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          version: 8,
          name: 'test-basemap',
          glyphs: `${ORIGIN}${PREFIX}glyphs/{fontstack}/{range}.pbf`,
          sources: {},
          layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ebe7e2' } }],
        }),
      });
    }
    if (u.includes('data.sfgov.org')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ROWS) });
    }
    if (u.includes('nominatim.openstreetmap.org')) {
      const q = new URL(u).searchParams.get('q') ?? '';
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(/mcallister/i.test(q) ? NOMINATIM_HIT : []),
      });
    }
    return route.abort(); /* fonts etc — the page must survive without them */
  });
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--no-sandbox'],
});

/* ---------- desktop pass ---------- */
{
  console.log('desktop 1440x900');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await routeExternals(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });

  await waitFor(page, () => !!window.__blockReport, 'app booted (store + map handle)');
  await waitFor(page, () => {
    const m = window.__blockReport?.map;
    return !!m && !!m.getLayer('blocks') && !!m.getLayer('buildings') && !!m.getLayer('points');
  }, 'blocks, buildings and dots layers all present');

  /* labels are MapLibre symbol layers — collision, fades, and the minor
     tier's z12.6 reveal are all library behavior; we assert the layers
     and their contract, not the library */
  await waitFor(page, () => {
    const m = window.__blockReport.map;
    return !!m.getLayer('nhood-labels-major') && !!m.getLayer('nhood-labels-minor');
  }, 'neighborhood labels render as symbol layers');
  ok((await page.evaluate(() => window.__blockReport.map.getLayer('nhood-labels-minor').minzoom)) === 12.6, 'minor tier gated to z12.6+');
  ok((await page.evaluate(() => {
    const src = window.__blockReport.map.getSource('nhoods').serialize().data;
    return src.features.length >= 40 && src.features.every((f) => typeof f.properties.dens === 'number');
  })), 'every neighborhood carries its density for the inversion rule');
  await page.evaluate(() => window.__blockReport.map.jumpTo({ zoom: 11.85 }));

  /* live data flowed into the panel */
  const count = await page.evaluate(() => document.getElementById('count-value')?.textContent ?? '');
  ok(parseInt(count.replace(/[^0-9]/g, ''), 10) === GEOCODED, `count shows the ${GEOCODED} geocoded rows, administrative ones excluded (got "${count}")`);
  ok((await page.evaluate(() => document.getElementById('histogram')?.childElementCount)) === 30, 'histogram renders 30 day bars');
  const nChips = await page.evaluate(() => document.querySelectorAll('#chips button.chip').length);
  ok(nChips === 4, `one chip per curated group, not per raw category (got ${nChips})`);
  ok((await page.evaluate(() => document.querySelector('#chips button.chip')?.firstChild?.textContent)) === 'Theft', 'chips carry group names (Larceny Theft folds into Theft)');
  ok(await page.evaluate(() => (document.getElementById('data-note')?.textContent ?? '').includes('fetched live')), 'data note reports live data');
  ok((await page.evaluate(() => document.querySelectorAll('#ranking li').length)) === 6, 'ranking holds ALL neighborhoods');
  ok((await page.evaluate(() => document.querySelector('#ranking li .name')?.textContent)) === 'Tenderloin', 'ranking sorts by report count');
  const visibleRanks = () => page.evaluate(() =>
    [...document.querySelectorAll('#ranking li')].filter((li) => getComputedStyle(li).display !== 'none').length);
  ok((await visibleRanks()) === 5, 'ranking collapsed to top-5 by default');
  ok((await page.evaluate(() => document.getElementById('ranking-toggle')?.textContent)) === 'Show all 6', 'fold toggle counts the hidden tail');
  await page.click('#ranking-toggle');
  ok((await visibleRanks()) === 6, 'Show all expands the ranking');
  await page.click('#ranking-toggle');
  ok((await visibleRanks()) === 5, 'Show less folds it back');

  /* dots LoD: one combined dot per neighborhood citywide, grid areas
     mid-zoom, individual intersections once sub-streets are in */
  const lodAt = (z) => page.evaluate((zoom) => {
    window.__blockReport.map.jumpTo({ zoom });
    return window.__blockReport.dots.lodState();
  }, z);
  const lodCity = await lodAt(11.85);
  const lodMid = await lodAt(13.0);
  const lodHigh = await lodAt(15.0);
  ok(lodCity.level === 'nhood' && lodCity.count === 6, `citywide: one dot per fixture neighborhood (got ${lodCity.level}/${lodCity.count})`);
  ok(lodMid.level === 'area' && lodMid.count > lodCity.count, `mid-zoom: grid areas (got ${lodMid.level}/${lodMid.count})`);
  ok(lodHigh.level === 'spot' && lodHigh.count > lodMid.count, `high zoom: individual intersections (got ${lodHigh.level}/${lodHigh.count})`);
  const srcMax = await page.evaluate(() => Math.max(...['points', 'points-b']
    .map((id) => window.__blockReport.map.getSource(id).serialize().data.features.length)));
  ok(srcMax === lodHigh.count, `the active source holds the level's dots (${srcMax})`);
  await page.evaluate(() => window.__blockReport.map.jumpTo({ zoom: 11.85 }));

  /* chips drive the whole page: count drops, buildings hide (blocks carry it) */
  await page.click('#chips button.chip');
  const filteredCount = await page.evaluate(() => parseInt((document.getElementById('count-value')?.textContent ?? '').replace(/[^0-9]/g, ''), 10));
  ok(filteredCount === GEOCODED - 40, `first chip off drops its 40 rows (got ${filteredCount})`);
  ok((await page.evaluate(() => window.__blockReport.map.getLayoutProperty('buildings', 'visibility'))) === 'none', 'buildings hidden while filtered (blocks carry all zooms)');
  await page.click('#cats-none');
  ok((await page.evaluate(() => parseInt((document.getElementById('count-value')?.textContent ?? '').replace(/[^0-9]/g, ''), 10))) === 0, 'None empties the report');
  await page.click('#cats-all');
  ok((await page.evaluate(() => parseInt((document.getElementById('count-value')?.textContent ?? '').replace(/[^0-9]/g, ''), 10))) === GEOCODED, 'All restores the pristine count');
  await waitFor(page, () => window.__blockReport.map.getLayoutProperty('buildings', 'visibility') === 'visible', 'buildings return on pristine filters');

  /* date brush: drag across half the histogram, then reset */
  const hist = await page.locator('#histogram').boundingBox();
  await page.mouse.move(hist.x + 2, hist.y + hist.height / 2);
  await page.mouse.down();
  await page.mouse.move(hist.x + hist.width * 0.45, hist.y + hist.height / 2, { steps: 5 });
  await page.mouse.up();
  const brushed = await page.evaluate(() => parseInt((document.getElementById('count-value')?.textContent ?? '').replace(/[^0-9]/g, ''), 10));
  ok(brushed > 0 && brushed < GEOCODED, `brush narrows the window (got ${brushed})`);
  ok(await page.evaluate(() => !document.getElementById('range-reset')?.hidden), 'Reset appears while brushed');
  await page.click('#range-reset');
  ok((await page.evaluate(() => parseInt((document.getElementById('count-value')?.textContent ?? '').replace(/[^0-9]/g, ''), 10))) === GEOCODED, 'Reset restores the full window');

  /* pins: geocode, add, reject the duplicate (§6.4), persist */
  await page.fill('#pin-input', '335 McAllister St');
  await page.press('#pin-input', 'Enter');
  await waitFor(page, () => document.querySelectorAll('#pin-list li').length === 1, 'pin added from address');
  ok(await page.evaluate(() => {
    const feats = window.__blockReport.map.getSource('pin-labels').serialize().data.features;
    return feats.length === 1 && feats[0].properties.label === '335 McAllister St' && typeof feats[0].properties.dark === 'boolean';
  }), 'pin label rides the pin-labels symbol source');
  await page.fill('#pin-input', '335 McAllister St');
  await page.press('#pin-input', 'Enter');
  await waitFor(page, () => /already pinned/i.test(document.getElementById('pin-status')?.textContent ?? ''), 'duplicate address rejected');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('block-report-pings') ?? '[]').length === 1), 'pin persisted under block-report-pings');

  ok((await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)), 'no horizontal overflow at 1440px');
  const realErrors = pageErrors.filter((e) => !/glyphs|font|AJAXError/i.test(e));
  ok(realErrors.length === 0, `no unexpected page errors${realErrors.length ? `: ${realErrors[0]}` : ''}`);
  await context.close();
}

/* ---------- mobile pass ---------- */
{
  console.log('mobile 390x844');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  });
  await routeExternals(context);
  const page = await context.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => !!window.__blockReport, 'app boots on mobile');
  await waitFor(page, () => !!window.__blockReport.map.getLayer('blocks'), 'blocks layer present (mobile snapshot)');
  ok((await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)), 'no horizontal overflow at 390px');
  ok(await page.evaluate(() => !!document.querySelector('.maplibregl-cooperative-gesture-screen')), 'cooperative gestures active on narrow viewports');
  await waitFor(page, () => !!window.__blockReport.map.getLayer('nhood-labels-major'), 'label layers present on mobile');
  ok((await page.evaluate(() => window.__blockReport.dots.lodState().level)) === 'nhood', 'mobile citywide framing starts at neighborhood dots');
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall green');
process.exit(failures ? 1 : 0);
