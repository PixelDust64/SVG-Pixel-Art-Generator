/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkAndSanitizeSvg } from '../../utils/svgChecker.ts';
import { Resolution } from '../../types.ts';

describe('SVG Checker & Auto-Sanitizer Unit Tests', () => {
  it('should auto-fix viewBox, crispEdges, and integer coordinates for 64x64', () => {
    const rawSvg = `<svg viewBox="0 0 100 100">
      <rect x="10.4" y="20.7" width="1.9" height="1.1" fill="#ff0000" />
      <rect x="15" y="15" width="2" height="2" fill="#00ff00" />
    </svg>`;

    const res = checkAndSanitizeSvg(rawSvg, Resolution.R64x64);
    assert.strictEqual(res.report.passed, true);
    assert.ok(res.sanitizedSvg.includes('viewBox="0 0 64 64"'));
    assert.ok(res.sanitizedSvg.includes('shape-rendering="crispEdges"'));
    assert.ok(res.sanitizedSvg.includes('x="10"'));
    assert.ok(res.sanitizedSvg.includes('y="21"'));
    assert.ok(res.sanitizedSvg.includes('width="2"'));
    assert.ok(res.sanitizedSvg.includes('height="1"'));
    assert.strictEqual(res.report.roundedRects, 1);
  });

  it('should auto-fix viewBox for 64x128 and 128x64 resolutions', () => {
    const rawSvgVertical = `<svg><rect x="10" y="10" width="5" height="5" fill="#123456" /></svg>`;
    const vertical = checkAndSanitizeSvg(rawSvgVertical, Resolution.R64x128);
    assert.ok(vertical.sanitizedSvg.includes('viewBox="0 0 64 128"'));
    assert.strictEqual(vertical.report.passed, true);

    const rawSvgHorizontal = `<svg><rect x="10" y="10" width="5" height="5" fill="#123456" /></svg>`;
    const horizontal = checkAndSanitizeSvg(rawSvgHorizontal, Resolution.R128x64);
    assert.ok(horizontal.sanitizedSvg.includes('viewBox="0 0 128 64"'));
    assert.strictEqual(horizontal.report.passed, true);
  });

  it('should detect spill when elements are placed outside canvas bounds', () => {
    const rawSvg = `<svg viewBox="0 0 64 64">
      <rect x="10" y="10" width="5" height="5" fill="#ff0000" />
      <rect x="62" y="10" width="10" height="5" fill="#ff0000" /> <!-- Spills past W=64 -->
    </svg>`;

    const res = checkAndSanitizeSvg(rawSvg, Resolution.R64x64);
    assert.strictEqual(res.report.passed, true); // Spill is a warning, not fatal
    assert.strictEqual(res.report.spillCount, 1);
    assert.ok(res.report.warnings.some((w) => w.includes('spill: 1 elements outside 64x64')));
  });

  it('should fail when canvas draws nothing', () => {
    const rawSvg = `<svg viewBox="0 0 64 64"></svg>`;
    const res = checkAndSanitizeSvg(rawSvg, Resolution.R64x64);
    assert.strictEqual(res.report.passed, false);
    assert.strictEqual(res.report.isEmpty, true);
    assert.ok(res.report.errors.includes('draws nothing'));
  });

  it('should detect undefined or invalid fill colors (holes)', () => {
    const rawSvg = `<svg viewBox="0 0 64 64">
      <rect x="5" y="5" width="2" height="2" fill="undefined" />
      <rect x="10" y="10" width="2" height="2" fill="#abcdef" />
    </svg>`;

    const res = checkAndSanitizeSvg(rawSvg, Resolution.R64x64);
    assert.strictEqual(res.report.invalidFills, 1);
    assert.ok(res.report.warnings.some((w) => w.includes('holes: 1 element(s) with undefined/invalid fill')));
  });

  it('should preserve and format <g id="light"> with plus-lighter mix-blend-mode', () => {
    const rawSvg = `<svg viewBox="0 0 64 64">
      <g id="color"><rect x="10" y="10" width="4" height="4" fill="#333333" /></g>
      <g id="light"><rect x="12" y="12" width="2" height="2" fill="#ffff00" /></g>
    </svg>`;

    const res = checkAndSanitizeSvg(rawSvg, Resolution.R64x64);
    assert.strictEqual(res.report.hasLightLayer, true);
    assert.ok(res.sanitizedSvg.includes('mix-blend-mode: plus-lighter'));
  });

  it('should strip thinking blocks from reasoning models', () => {
    const rawWithThink = `<think>
      I need to draw a pixel potion.
    </think>
    <svg viewBox="0 0 64 64">
      <rect x="10" y="10" width="4" height="4" fill="#ff0000" />
    </svg>`;

    const res = checkAndSanitizeSvg(rawWithThink, Resolution.R64x64);
    assert.strictEqual(res.report.passed, true);
    assert.ok(!res.sanitizedSvg.includes('<think>'));
  });

  it('should preserve custom original viewBox when preserveOriginalViewBox is true', () => {
    const customSvg = `<svg viewBox="0 0 96 48">
      <rect x="10" y="10" width="4" height="4" fill="#00ffcc" />
    </svg>`;

    const res = checkAndSanitizeSvg(customSvg, Resolution.R64x64, {
      preserveOriginalViewBox: true
    });
    assert.strictEqual(res.report.passed, true);
    assert.ok(res.sanitizedSvg.includes('viewBox="0 0 96 48"'));
    assert.ok(res.sanitizedSvg.includes('width="96"'));
    assert.ok(res.sanitizedSvg.includes('height="48"'));
  });
});

