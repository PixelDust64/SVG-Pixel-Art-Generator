/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  edgeFade,
  encodePNG,
  rasterizeSvgHeadless,
  upscale
} from '../../tools/lib/headlessCanvas.ts';
import { Resolution } from '../../types.ts';

describe('Rasterizer & PNG Encoding Unit Tests', () => {
  it('should upscale pixel buffers using Nearest-Neighbour integer multiplication', () => {
    // 2x2 buffer with one red pixel, one blue pixel, two transparent
    const w = 2;
    const h = 2;
    const buf = new Uint8ClampedArray(w * h * 4);
    // (0,0) Red
    buf[0] = 255; buf[1] = 0; buf[2] = 0; buf[3] = 255;
    // (1,1) Blue
    buf[12] = 0; buf[13] = 0; buf[14] = 255; buf[15] = 255;

    const k = 4;
    const scaled = upscale(buf, w, h, k);
    assert.strictEqual(scaled.length, w * k * h * k * 4);

    // Pixel at (0,0) and (1,1) in upscaled buffer should match source (0,0) exactly
    assert.strictEqual(scaled[0], 255);
    assert.strictEqual(scaled[1], 0);
    assert.strictEqual(scaled[2], 0);
    assert.strictEqual(scaled[3], 255);
  });

  it('should apply cubic edgeFade attenuation on outer E=8 pixels', () => {
    const w = 16;
    const h = 16;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
    }

    edgeFade(buf, w, h, 8);

    // Pixel at outer border (0, 0) must be attenuated compared to center
    const cornerAlpha = buf[3];
    assert.ok(cornerAlpha < 255);
    assert.ok(cornerAlpha >= 0);
  });

  it('should encode RGBA buffer to valid PNG format with magic signature', () => {
    const w = 4;
    const h = 4;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = 255; buf[i + 3] = 255; // Red
    }

    const pngBuffer = encodePNG(w, h, buf);
    assert.ok(Buffer.isBuffer(pngBuffer));
    // PNG magic signature: [0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A]
    assert.strictEqual(pngBuffer[0], 0x89);
    assert.strictEqual(pngBuffer[1], 0x50); // 'P'
    assert.strictEqual(pngBuffer[2], 0x4e); // 'N'
    assert.strictEqual(pngBuffer[3], 0x47); // 'G'
  });

  it('should rasterize SVG in headless Node.js environment without DOM', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect x="0" y="0" width="10" height="10" fill="#ff0000" />
      <g id="light"><rect x="5" y="5" width="4" height="4" fill="#ffff00" /></g>
    </svg>`;

    const res = rasterizeSvgHeadless(svg, Resolution.R64x64, true);
    assert.strictEqual(res.w, 64);
    assert.strictEqual(res.h, 64);
    assert.strictEqual(res.clear.length, 64 * 64 * 4);
    assert.strictEqual(res.dark.length, 64 * 64 * 4);

    // Pixel at (0, 0) should be Red
    assert.strictEqual(res.clear[0], 255);
    assert.strictEqual(res.clear[3], 255);
  });
});

