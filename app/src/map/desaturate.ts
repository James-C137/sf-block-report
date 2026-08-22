/* Basemap desaturation, in-style. A CSS saturate(0) on the container
   would grayscale our own layers in the same canvas, so the gray happens
   inside the basemap style: every color inside every paint value —
   plain strings, expression arrays (landcover greens key off class
   expressions), legacy {stops} functions — collapses to its luminance
   (the same weights CSS saturate(0) uses). Only strings matching a color
   syntax are touched, so operator names and class labels pass through. */

import type { Map as MLMap } from 'maplibre-gl';

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const f = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(f(p, q, h + 1 / 3) * 255),
    Math.round(f(p, q, h) * 255),
    Math.round(f(p, q, h - 1 / 3) * 255),
  ];
}

export function grayColor(c: unknown): string | null {
  if (typeof c !== 'string') return null;
  let r: number, g: number, b: number;
  let a = 1;
  let m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const hex = m[1]!;
    r = parseInt(hex[0]! + hex[0]!, 16);
    g = parseInt(hex[1]! + hex[1]!, 16);
    b = parseInt(hex[2]! + hex[2]!, 16);
  } else if ((m = c.match(/^#([0-9a-f]{6})$/i))) {
    const hex = m[1]!;
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if ((m = c.match(/^rgba?\(([^)]+)\)$/i))) {
    const p = m[1]!.split(',').map(parseFloat);
    r = p[0]!;
    g = p[1]!;
    b = p[2]!;
    if (p.length > 3) a = p[3]!;
  } else if ((m = c.match(/^hsla?\(([^)]+)\)$/i))) {
    const q = m[1]!.split(',').map(parseFloat);
    [r, g, b] = hslToRgb(q[0]!, q[1]! / 100, q[2]! / 100);
    if (q.length > 3) a = q[3]!;
  } else {
    return null;
  }
  if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return null;
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  return a === 1 ? `rgb(${y},${y},${y})` : `rgba(${y},${y},${y},${a})`;
}

/* deep-gray a paint value of any shape; returns the input reference
   unchanged when nothing inside was a color */
export function grayValue(v: unknown): unknown {
  if (typeof v === 'string') return grayColor(v) ?? v;
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((item) => {
      const r = grayValue(item);
      if (r !== item) changed = true;
      return r;
    });
    return changed ? out : v;
  }
  if (v && typeof v === 'object') {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const r = grayValue(val);
      if (r !== val) changed = true;
      out[k] = r;
    }
    return changed ? out : v;
  }
  return v;
}

const COLOR_PROPS: Record<string, string[]> = {
  background: ['background-color'],
  fill: ['fill-color', 'fill-outline-color'],
  line: ['line-color'],
  symbol: ['text-color', 'text-halo-color', 'icon-color', 'icon-halo-color'],
  circle: ['circle-color', 'circle-stroke-color'],
  'fill-extrusion': ['fill-extrusion-color'],
};

export function desaturateBasemap(map: MLMap): void {
  for (const l of map.getStyle().layers ?? []) {
    for (const prop of COLOR_PROPS[l.type] ?? []) {
      try {
        const v = map.getPaintProperty(l.id, prop as never);
        const gray = grayValue(v);
        if (gray !== v) map.setPaintProperty(l.id, prop as never, gray);
      } catch {
        /* unknown prop on this layer — skip */
      }
    }
  }
}
