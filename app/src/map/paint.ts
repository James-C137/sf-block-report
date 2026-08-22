/* THE visual laws, in one place (the mockup had the alpha ramp in three
   places and the charcoal anchors in three more). Everything that paints
   density derives from these. */

/* warm charcoal — near-neutral with a subtle warm-taupe tint; NOT full
   desaturation. Intensity carries the data. */
export const CHARCOAL_ANCHORS: ReadonlyArray<readonly [number, string]> = [
  [0.0, '#877A70'],
  [0.4, '#6E625A'],
  [0.7, '#4B423C'],
  [1.0, '#26201D'],
];

/* buildings are opaque and carry the whole ramp in surface color,
   starting from a neutral pale that blends with Positron */
export const BUILDING_RAMP: ReadonlyArray<readonly [number, string]> = [
  [0.0, '#E3E3E3'],
  [0.15, '#D6D0CA'],
  [0.35, '#B3AAA2'],
  [0.6, '#857A72'],
  [0.85, '#544B45'],
  [1.0, '#2B2521'],
];

/* near-linear alpha ramp — a softer toe was tried and crushed everything
   under ~0.2 to white; a lightly-reported block still shows a wash */
export const ALPHA_RAMP: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0],
  [0.03, 0.05],
  [0.1, 0.15],
  [0.22, 0.27],
  [0.4, 0.42],
  [0.6, 0.6],
  [0.8, 0.79],
  [1.0, 1.0],
];
