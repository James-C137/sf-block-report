/* Typed MapLibre expression builders. The one hard rule, learned twice
   in the mockup: ['zoom'] must feed a TOP-LEVEL interpolate — nesting it
   inside arithmetic silently rejects the layer. zoomCurve() is the only
   place ['zoom'] is ever written, which enforces the rule structurally. */

import type { ExpressionSpecification } from 'maplibre-gl';
import {
  BLDG_FULL_OPACITY, BLOCKS_MAX, DOTS_MAX, DOTS_SIZE, DOT_COLOR_RGB,
  DOT_STRENGTH_RAMP, ENTRANCE_HEIGHT, ENTRANCE_OPACITY, GROUND_FADE,
} from '../config';
import { ALPHA_RAMP, BUILDING_RAMP, CHARCOAL_ANCHORS } from './paint';

export type Expr = ExpressionSpecification;
type ExprOrNumber = Expr | number;

/* build a zoom interpolate from [zoom, fraction] stops; `scale` maps each
   fraction to its final output (a number or a paint expression) */
export function zoomCurve(
  stops: ReadonlyArray<readonly [number, number]>,
  scale: (f: number) => ExprOrNumber,
): Expr {
  const e: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (const [z, f] of stops) e.push(z, scale(f));
  return e as Expr;
}

function interpOn(t: Expr, stops: ReadonlyArray<readonly [number, unknown]>): Expr {
  const e: unknown[] = ['interpolate', ['linear'], t];
  for (const [x, v] of stops) e.push(x, v);
  return e as Expr;
}

/* v/d/w properties are already in [0,1]; t is the property itself
   (the mockup's ink=1, contrast=1 folded away) */
const tOf = (prop: string): Expr => ['get', prop] as unknown as Expr;

export function blockColorExpr(): Expr {
  return interpOn(tOf('v'), CHARCOAL_ANCHORS);
}

export function blockOpacityFullExpr(): Expr {
  return ['*', BLOCKS_MAX, interpOn(tOf('v'), ALPHA_RAMP)] as unknown as Expr;
}

/* pristine mode: the mosaic fades out as buildings become legible */
export function blockOpacityExpr(): Expr {
  const full = blockOpacityFullExpr();
  return zoomCurve(GROUND_FADE, (f) => (f === 0 ? 0 : f === 1 ? full : (['*', f, full] as unknown as Expr)));
}

/* filtered mode: buildings hide (their pristine scores don't match the
   filter), so blocks carry ALL zooms — no fade-out */
export function blockOpacityFlatExpr(): Expr {
  return blockOpacityFullExpr();
}

export function buildingColorExpr(): Expr {
  return interpOn(tOf('d'), BUILDING_RAMP);
}

export function buildingHeightExpr(): Expr {
  const full = ['*', 1, ['get', 'h']] as unknown as Expr;
  return zoomCurve(ENTRANCE_HEIGHT, (f) => (f === 0 ? 0 : f === 1 ? full : (['*', f, full] as unknown as Expr)));
}

export function buildingOpacityExpr(): Expr {
  return zoomCurve(ENTRANCE_OPACITY, (f) => f * BLDG_FULL_OPACITY);
}

/* dots: per-spot strength lives in the COLOR alpha because data-driven
   paint props aren't transitionable — circle-opacity stays a plain
   constant the threshold watcher can flip with a timed transition */
export function dotColorExpr(): Expr {
  const alpha = ['*', DOTS_MAX, interpOn(tOf('w'), DOT_STRENGTH_RAMP)];
  const [r, g, b] = DOT_COLOR_RGB;
  return ['rgba', r, g, b, alpha] as unknown as Expr;
}

export function dotRadiusExpr(): Expr {
  const f = ['*', DOTS_SIZE, ['+', 0.6, ['*', 0.75, ['get', 'w']]]];
  const scaled = (k: number): unknown => ['*', k, f];
  return ['interpolate', ['linear'], ['zoom'], 10, scaled(1.6), 13, scaled(2.6), 16, scaled(4.2)] as unknown as Expr;
}

export function dotStrokeWidthExpr(): Expr {
  return ['interpolate', ['linear'], ['zoom'], 10, 0.2, 13, 0.5, 16, 0.9] as unknown as Expr;
}

/* (The label size/halo expressions that lived here died with the symbol
   layers — neighborhood labels are DOM markers now, see layers/labels.ts.) */
