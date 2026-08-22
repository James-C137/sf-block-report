/* The density field: incidents binned into a ~40m grid, smoothed with
   three box blurs (≈ Gaussian, sigma ≈ 190m — a couple block widths),
   normalized to the 99.5th-percentile cell, clamped (single-address
   spikes would flatten a max-normal), then sqrt-gamma-lifted so ink
   reaches the whole city. Pure: no DOM, no map. */

import {
  GRID_W, GRID_H, GRID_MIN_LNG, GRID_MAX_LNG, GRID_MIN_LAT, GRID_MAX_LAT,
  BLUR_RADIUS, BLUR_PASSES, GRID_NORM_PERCENTILE, DENSITY_GAMMA,
} from '../config';
import type { DensityField, Incident } from './types';

function blurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = 0; x <= r && x < w; x++) acc += src[row + x]!;
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * norm;
      if (x + r + 1 < w) acc += src[row + x + r + 1]!;
      if (x - r >= 0) acc -= src[row + x - r]!;
    }
  }
}

function blurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const norm = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y <= r && y < h; y++) acc += src[y * w + x]!;
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * norm;
      if (y + r + 1 < h) acc += src[(y + r + 1) * w + x]!;
      if (y - r >= 0) acc -= src[(y - r) * w + x]!;
    }
  }
}

export function buildField(incidents: ReadonlyArray<Pick<Incident, 'lng' | 'lat'>>): DensityField {
  const counts = new Float32Array(GRID_W * GRID_H);
  for (const p of incidents) {
    const x = Math.floor(((p.lng - GRID_MIN_LNG) / (GRID_MAX_LNG - GRID_MIN_LNG)) * GRID_W);
    const y = Math.floor(((p.lat - GRID_MIN_LAT) / (GRID_MAX_LAT - GRID_MIN_LAT)) * GRID_H);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
    counts[y * GRID_W + x]! += 1;
  }
  let a = counts;
  let b = new Float32Array(counts.length);
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    blurH(a, b, GRID_W, GRID_H, BLUR_RADIUS);
    blurV(b, a, GRID_W, GRID_H, BLUR_RADIUS);
  }
  const pos: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i]! > 0) pos.push(a[i]!);
  pos.sort((u, v) => u - v);
  let ref = pos.length ? pos[Math.min(pos.length - 1, Math.floor(pos.length * GRID_NORM_PERCENTILE))]! : 1;
  if (!(ref > 0)) ref = 1;
  for (let j = 0; j < a.length; j++) {
    const v = a[j]! / ref;
    a[j] = Math.pow(v > 1 ? 1 : v, DENSITY_GAMMA);
  }
  return {
    grid: a, w: GRID_W, h: GRID_H,
    minLng: GRID_MIN_LNG, maxLng: GRID_MAX_LNG, minLat: GRID_MIN_LAT, maxLat: GRID_MAX_LAT,
  };
}

/* bilinear sample between cell centers; 0 outside the bbox */
export function sampleField(f: DensityField, lng: number, lat: number): number {
  if (lng < f.minLng || lng > f.maxLng || lat < f.minLat || lat > f.maxLat) return 0;
  let x = ((lng - f.minLng) / (f.maxLng - f.minLng)) * f.w - 0.5;
  let y = ((lat - f.minLat) / (f.maxLat - f.minLat)) * f.h - 0.5;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > f.w - 1) x = f.w - 1;
  if (y > f.h - 1) y = f.h - 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(f.w - 1, x0 + 1);
  const y1 = Math.min(f.h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = f.grid[y0 * f.w + x0]! * (1 - fx) + f.grid[y0 * f.w + x1]! * fx;
  const bot = f.grid[y1 * f.w + x0]! * (1 - fx) + f.grid[y1 * f.w + x1]! * fx;
  return top * (1 - fy) + bot * fy;
}
