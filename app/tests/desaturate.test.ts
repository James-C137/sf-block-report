import { describe, expect, it } from 'vitest';
import { grayColor, grayValue } from '../src/map/desaturate';

describe('basemap desaturation', () => {
  it('grays every color syntax to its luminance, preserving alpha', () => {
    expect(grayColor('#fff')).toBe('rgb(255,255,255)');
    expect(grayColor('#D6E0E3')).toBe('rgb(222,222,222)');
    expect(grayColor('rgb(204, 214, 216)')).toBe('rgb(212,212,212)');
    expect(grayColor('rgba(196,204,206,0.7)')).toBe('rgba(202,202,202,0.7)');
    expect(grayColor('hsl(205, 56%, 73%)')).toBe('rgb(186,186,186)');
    expect(grayColor('hsla(47, 26%, 88%, 0.34)')).toBe('rgba(229,229,229,0.34)');
  });

  it('leaves non-colors alone', () => {
    expect(grayColor('not-a-color')).toBeNull();
    expect(grayValue(1.5)).toBe(1.5);
    const noColors = ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1];
    expect(grayValue(noColors)).toBe(noColors); /* same reference */
  });

  it('walks match expressions (the landcover greens) without touching labels', () => {
    const out = grayValue(['match', ['get', 'class'], 'wood', 'rgb(196,216,183)', 'grass', 'hsl(98, 40%, 84%)', '#e8e8e8']) as unknown[];
    expect(out[2]).toBe('wood'); /* class labels untouched */
    expect(out[3]).toBe('rgb(209,209,209)');
    expect(out[5]).toBe('rgb(224,224,224)');
  });

  it('walks legacy {stops} functions', () => {
    const out = grayValue({ base: 1, stops: [[8, 'rgba(214,231,199,0.6)'], [12, '#cfe0c3']] }) as {
      stops: Array<[number, string]>;
    };
    expect(out.stops[0]![1]).toBe('rgba(225,225,225,0.6)');
    expect(out.stops[1]![1]).toBe('rgb(218,218,218)');
  });
});
