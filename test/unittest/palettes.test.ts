/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  PAL,
  extractPaletteFromSvg,
  fit,
  getLuminance,
  hexToRgb,
  normalizeHex,
  ramp,
  recolorSvg,
  rgbToHex
} from '../../utils/palettes.ts';

describe('Palettes & Color Remapping Unit Tests', () => {
  it('should normalize 3-digit and 6-digit hex colors', () => {
    assert.strictEqual(normalizeHex('#fff'), '#ffffff');
    assert.strictEqual(normalizeHex('#F0A'), '#ff00aa');
    assert.strictEqual(normalizeHex('#123456'), '#123456');
    assert.strictEqual(normalizeHex('invalid'), null);
  });

  it('should convert hex to RGB and back accurately', () => {
    const [r, g, b] = hexToRgb('#ff8800');
    assert.strictEqual(r, 255);
    assert.strictEqual(g, 136);
    assert.strictEqual(b, 0);

    const back = rgbToHex(r, g, b);
    assert.strictEqual(back, '#ff8800');
  });

  it('should calculate luminance and sort colors darkest to lightest', () => {
    const blackLum = getLuminance('#000000');
    const greyLum = getLuminance('#888888');
    const whiteLum = getLuminance('#ffffff');

    assert.ok(blackLum < greyLum);
    assert.ok(greyLum < whiteLum);
  });

  it('should interpolate palette ramps with fit() and ramp()', () => {
    const basePalette = ['#000000', '#ffffff'];
    const steps4 = fit(basePalette, 4);

    assert.strictEqual(steps4.length, 4);
    assert.strictEqual(steps4[0], '#000000');
    assert.strictEqual(steps4[3], '#ffffff');

    const defaultRamp = ramp(PAL.fire);
    assert.strictEqual(defaultRamp.length, 6);
  });

  it('should extract unique colors sorted by luminance from an SVG', () => {
    const svg = `<svg>
      <rect fill="#ffffff" />
      <rect fill="#000000" />
      <rect fill="#888888" />
      <rect fill="#ffffff" />
    </svg>`;

    const colors = extractPaletteFromSvg(svg);
    assert.deepStrictEqual(colors, ['#000000', '#888888', '#ffffff']);
  });

  it('should dynamically recolor SVG without breaking XML structure', () => {
    const svg = `<svg viewBox="0 0 64 64"><rect x="10" y="10" fill="#000000" /><rect x="20" y="20" fill="#ffffff" /></svg>`;
    const recolored = recolorSvg(svg, PAL.fire);

    assert.ok(recolored.includes('viewBox="0 0 64 64"'));
    assert.ok(recolored.includes('x="10"'));
    assert.ok(recolored.includes('x="20"'));
    assert.ok(!recolored.includes('#000000'));
    assert.ok(!recolored.includes('#ffffff'));
  });
});

