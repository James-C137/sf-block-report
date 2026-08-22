import { describe, expect, it } from 'vitest';
import { buildField, sampleField } from '../src/model/density';
import {
  GRID_H, GRID_MAX_LAT, GRID_MAX_LNG, GRID_MIN_LAT, GRID_MIN_LNG, GRID_W,
} from '../src/config';

const cellCenter = (cx: number, cy: number): { lng: number; lat: number } => ({
  lng: GRID_MIN_LNG + ((cx + 0.5) / GRID_W) * (GRID_MAX_LNG - GRID_MIN_LNG),
  lat: GRID_MIN_LAT + ((cy + 0.5) / GRID_H) * (GRID_MAX_LAT - GRID_MIN_LAT),
});

describe('density field', () => {
  it('is all zero for empty input', () => {
    const f = buildField([]);
    expect(sampleField(f, -122.42, 37.77)).toBe(0);
    let sum = 0;
    for (const v of f.grid) sum += v;
    expect(sum).toBe(0);
  });

  it('a single point normalizes to 1 at its own cell (its blurred peak IS the percentile ref)', () => {
    const p = cellCenter(190, 190);
    const f = buildField([p]);
    expect(sampleField(f, p.lng, p.lat)).toBeCloseTo(1, 5);
  });

  it('field decays away from a cluster and is zero far away', () => {
    const p = cellCenter(190, 190);
    const cluster = Array.from({ length: 50 }, () => p);
    const f = buildField(cluster);
    const atPeak = sampleField(f, p.lng, p.lat);
    const near = cellCenter(196, 190); /* ~6 cells off: inside blur reach */
    const far = cellCenter(260, 190); /* far outside the 3x(2r+1) blur reach */
    expect(atPeak).toBeCloseTo(1, 5);
    expect(sampleField(f, near.lng, near.lat)).toBeLessThan(atPeak);
    expect(sampleField(f, near.lng, near.lat)).toBeGreaterThan(0);
    expect(sampleField(f, far.lng, far.lat)).toBe(0);
  });

  it('sqrt gamma lifts the mid-range: a half-weight cluster reads ~sqrt(0.5)', () => {
    const a = cellCenter(100, 100);
    const b = cellCenter(280, 280); /* far apart: blurs don't interact */
    const incidents = [
      ...Array.from({ length: 100 }, () => a),
      ...Array.from({ length: 50 }, () => b),
    ];
    const f = buildField(incidents);
    /* the percentile ref lands on the larger blurred peak, so b's peak is
       ~(50/100) pre-gamma → ~sqrt(0.5) post-gamma; the p99.5 ref sits a
       hair below the true max, so allow a small band */
    expect(sampleField(f, a.lng, a.lat)).toBeCloseTo(1, 4);
    expect(Math.abs(sampleField(f, b.lng, b.lat) - Math.sqrt(0.5))).toBeLessThan(0.02);
  });

  it('outputs stay in [0, 1] and out-of-bbox samples are 0', () => {
    const p = cellCenter(10, 10);
    const f = buildField(Array.from({ length: 500 }, () => p));
    for (const v of f.grid) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(sampleField(f, -122.6, 37.77)).toBe(0);
    expect(sampleField(f, -122.42, 37.5)).toBe(0);
  });

  it('bilinear sampling is continuous across a cell boundary', () => {
    const p = cellCenter(190, 190);
    const f = buildField(Array.from({ length: 50 }, () => p));
    const step = (GRID_MAX_LNG - GRID_MIN_LNG) / GRID_W / 10;
    let prev = sampleField(f, p.lng - 20 * step, p.lat);
    for (let i = -19; i <= 20; i++) {
      const v = sampleField(f, p.lng + i * step, p.lat);
      expect(Math.abs(v - prev)).toBeLessThan(0.2);
      prev = v;
    }
  });
});
