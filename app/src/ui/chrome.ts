/* On-map chrome: the loading pill, the mobile scroll hint, and the
   compass (bare needle, yaw-tracking, foreshortening with pitch;
   pressing it eases bearing back to north). */

import type { Map as MLMap } from 'maplibre-gl';

export interface LoadingHandle {
  bumpRows(n: number): void;
  setBlocksDone(): void;
  settle(): void;
}

export function initLoading(totalRows: number): LoadingHandle {
  const pill = document.getElementById('loading')!;
  const label = document.getElementById('loading-label')!;
  const bar = document.getElementById('loading-bar') as HTMLElement;
  let rows = 0;
  let blocksShare = 0;
  const paint = (): void => {
    /* buildings ~76k rows weigh 80%, the blocks payload the last 20%
       (streets left the page with the street-ink drop) */
    const p = Math.min(1, rows / totalRows) * 0.8 + blocksShare * 0.2;
    bar.style.width = `${Math.round(p * 100)}%`;
  };
  return {
    bumpRows(n) {
      rows += n;
      label.textContent = `${rows.toLocaleString('en-US')} buildings`;
      paint();
    },
    setBlocksDone() {
      blocksShare = 1;
      paint();
    },
    settle() {
      pill.classList.add('done');
      setTimeout(() => pill.remove(), 500);
    },
  };
}

export function initScrollHint(): void {
  document.getElementById('scroll-hint')?.addEventListener('click', () => {
    document.querySelector('.panel')?.scrollIntoView({ behavior: 'smooth' });
  });
}

export function initCompass(map: MLMap): void {
  const button = document.getElementById('compass')!;
  const tilt = document.getElementById('compass-tilt') as HTMLElement;
  const needle = document.getElementById('compass-needle') as unknown as SVGElement;
  const update = (): void => {
    /* needle counter-rotates to keep pointing at true north, and
       foreshortens with the camera pitch so it sits in the scene */
    needle.style.transform = `rotate(${-map.getBearing()}deg)`;
    tilt.style.transform = `rotateX(${map.getPitch() * 0.75}deg)`;
  };
  map.on('rotate', update);
  map.on('pitch', update);
  button.addEventListener('click', () => map.easeTo({ bearing: 0, duration: 500 }));
  update();
}
