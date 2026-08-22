import { describe, expect, it } from 'vitest';
import { centroidOf, labelPointOf, pointInRing, shoelace, type Geometry } from '../src/model/geo';

const square: Geometry = {
  type: 'Polygon',
  coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
};

describe('geo', () => {
  it('shoelace area of a unit-ish square', () => {
    expect(Math.abs(shoelace(square.coordinates[0]!))).toBeCloseTo(4, 9);
  });

  it('pointInRing', () => {
    const ring = square.coordinates[0]!;
    expect(pointInRing(1, 1, ring)).toBe(true);
    expect(pointInRing(3, 1, ring)).toBe(false);
  });

  it('centroid of a closed square ring is its center', () => {
    const c = centroidOf(square)!;
    expect(c[0]).toBeCloseTo(1, 9);
    expect(c[1]).toBeCloseTo(1, 9);
  });

  it('centroid picks the largest polygon of a MultiPolygon', () => {
    const g: Geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [[[10, 10], [10.1, 10], [10.1, 10.1], [10, 10.1], [10, 10]]],
        square.coordinates,
      ],
    };
    const c = centroidOf(g)!;
    expect(c[0]).toBeCloseTo(1, 6);
  });

  it('label point of a concave C-shape lands inside the shape, not in its mouth', () => {
    /* a C: outer 0..3 square with a 1..3 x 1..2 bite from the right */
    const c: Geometry = {
      type: 'Polygon',
      coordinates: [[
        [0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [3, 2], [3, 3], [0, 3], [0, 0],
      ]],
    };
    const lp = labelPointOf(c)!;
    expect(lp.point).not.toBeNull();
    const [x, y] = lp.point!;
    expect(pointInRing(x, y, c.coordinates[0]!)).toBe(true);
    /* the naive centroid sits near the mouth (x>1, 1<y<2) — the label
       point must not */
    expect(!(x > 1 && y > 1 && y < 2)).toBe(true);
  });

  it('label point respects holes', () => {
    const donut: Geometry = {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
        [[1.5, 1.5], [2.5, 1.5], [2.5, 2.5], [1.5, 2.5], [1.5, 1.5]],
      ],
    };
    const lp = labelPointOf(donut)!;
    const [x, y] = lp.point!;
    expect(pointInRing(x, y, donut.coordinates[1]!)).toBe(false);
  });
});
