/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Resolution, type SvgCheckReport } from '../types.ts';
import { extractPaletteFromSvg, normalizeHex } from './palettes.ts';

export interface SvgCheckResult {
  sanitizedSvg: string;
  report: SvgCheckReport;
  origin: [number, number];
  palette: string[];
}

export interface SvgCheckOptions {
  generationTime?: number;
  slowThresholdSec?: number;
  strictViewBox?: boolean;
  preserveOriginalViewBox?: boolean;
}

export function parseResolution(resolution: Resolution = Resolution.R64x64): [number, number] {
  const parts = String(resolution).split('x').map(Number);
  return [parts[0] || 64, parts[1] || 64];
}

function isValidColorValue(fill: string | null | undefined): boolean {
  if (!fill) return false;
  const val = fill.trim().toLowerCase();
  if (!val || val === 'undefined' || val === 'null' || val === 'nan' || val === 'none') {
    return val === 'none';
  }
  if (val.includes('undefined') || val.includes('nan')) return false;
  if (normalizeHex(val)) return true;
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)$/.test(val)) return true;
  if (/^hsla?\(/.test(val)) return true;
  if (/^url\(#/.test(val)) return true;
  if (/^[a-z]{3,20}$/.test(val)) return true;
  return false;
}

function getAttr(tagAttrs: string, name: string): string | null {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = tagAttrs.match(regex);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : m[2];
}

function setAttr(tagAttrs: string, name: string, value: string): string {
  const regex = new RegExp(`(\\b${name}\\s*=\\s*)(?:"[^"]*"|'[^']*')`, 'i');
  if (regex.test(tagAttrs)) {
    return tagAttrs.replace(regex, `$1"${value}"`);
  }
  return `${tagAttrs} ${name}="${value}"`;
}

/**
 * Universal SVG linter, auto-fixer and quality diagnostic (works in Browser and headless Node.js).
 */
export function checkAndSanitizeSvg(
  rawSvg: string,
  resolution: Resolution = Resolution.R64x64,
  options: SvgCheckOptions = {}
): SvgCheckResult {
  let [W, H] = parseResolution(resolution);
  const warnings: string[] = [];
  const errors: string[] = [];

  let svgText = (rawSvg || '').trim();
  // Strip any reasoning <think>...</think> blocks emitted by Qwen / DeepSeek / reasoning models
  svgText = svgText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (svgText.toLowerCase().includes('<think>') && svgText.toLowerCase().includes('<svg')) {
    svgText = svgText.slice(svgText.toLowerCase().indexOf('<svg')).trim();
  }

  const allSvgMatches = Array.from(svgText.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)).map((m) => m[0]);
  // Prefer the SVG block that contains actual graphical elements (<rect, <path, <circle, <polygon)
  const validSvgBlocks = allSvgMatches.filter((block) =>
    /<(?:rect|path|circle|polygon|polyline|ellipse|line)\b/i.test(block)
  );
  if (validSvgBlocks.length > 0) {
    svgText = validSvgBlocks[validSvgBlocks.length - 1];
  } else if (allSvgMatches.length > 0) {
    svgText = allSvgMatches[allSvgMatches.length - 1];
  } else {
    svgText = svgText
      .replace(/```xml/gi, '')
      .replace(/```svg/gi, '')
      .replace(/```/g, '')
      .trim();
    // If a small model started <svg ...> and emitted <rect>s but truncated before </svg>, salvage it
    const svgStart = svgText.search(/<svg\b/i);
    if (svgStart !== -1 && !/<\/svg>\s*$/i.test(svgText)) {
      svgText = svgText.slice(svgStart);
      // Drop any trailing incomplete tag at the end of stream
      const lastCloseBracket = svgText.lastIndexOf('>');
      if (lastCloseBracket !== -1) {
        svgText = svgText.slice(0, lastCloseBracket + 1);
      }
      // Close any open <g> tags before closing </svg>
      const openGs = (svgText.match(/<g\b[^>]*>/gi) || []).length;
      const closeGs = (svgText.match(/<\/g>/gi) || []).length;
      for (let i = 0; i < Math.max(0, openGs - closeGs); i++) {
        svgText += '</g>';
      }
      svgText += '</svg>';
      warnings.push('auto-closed truncated </svg> tag');
    }
  }

  const openSvgMatch = svgText.match(/^<svg\b([^>]*)>/i);
  const hasClosingSvg = /<\/svg>\s*$/i.test(svgText);

  if (!openSvgMatch || !hasClosingSvg) {
    errors.push('invalid XML/SVG');
    return {
      sanitizedSvg: svgText,
      report: {
        passed: false,
        isEmpty: true,
        spillCount: 0,
        bounds: null,
        uniqueColors: 0,
        rectCount: 0,
        invalidFills: 0,
        hasLightLayer: false,
        roundedRects: 0,
        warnings,
        errors
      },
      origin: [Math.round(W / 2), H],
      palette: []
    };
  }

  let svgAttrs = openSvgMatch[1];

  // Check existing viewBox before auto-fixing
  const existingViewBox = getAttr(svgAttrs, 'viewBox');
  if (existingViewBox) {
    const vbParts = existingViewBox.trim().split(/[\s,]+/).map(Number);
    if (vbParts.length === 4 && vbParts[2] > 0 && vbParts[3] > 0) {
      if (options.preserveOriginalViewBox) {
        W = vbParts[2];
        H = vbParts[3];
      } else if (vbParts[2] !== W || vbParts[3] !== H) {
        const msg = `wrong viewBox: expected "0 0 ${W} ${H}", got "${existingViewBox}"`;
        if (options.strictViewBox) {
          errors.push(msg);
        } else {
          warnings.push(`${msg} (auto-fixed)`);
        }
      }
    }
  }

  // 1. Auto-Fix root <svg> attributes
  svgAttrs = setAttr(svgAttrs, 'xmlns', 'http://www.w3.org/2000/svg');
  svgAttrs = setAttr(svgAttrs, 'viewBox', `0 0 ${W} ${H}`);
  svgAttrs = setAttr(svgAttrs, 'width', String(W));
  svgAttrs = setAttr(svgAttrs, 'height', String(H));
  svgAttrs = setAttr(svgAttrs, 'shape-rendering', 'crispEdges');

  const rawOx = getAttr(svgAttrs, 'data-origin-x');
  const rawOy = getAttr(svgAttrs, 'data-origin-y');
  const ox =
    rawOx !== null && !Number.isNaN(Number(rawOx))
      ? Math.round(Number(rawOx))
      : Math.round(W / 2);
  const oy =
    rawOy !== null && !Number.isNaN(Number(rawOy))
      ? Math.round(Number(rawOy))
      : H;
  const origin: [number, number] = [
    Math.max(0, Math.min(W, ox)),
    Math.max(0, Math.min(H, oy))
  ];
  svgAttrs = setAttr(svgAttrs, 'data-origin-x', String(origin[0]));
  svgAttrs = setAttr(svgAttrs, 'data-origin-y', String(origin[1]));

  let body = svgText.slice(openSvgMatch[0].length);

  // Check for <g id="light">
  const lightGroupRegex = /<g\b([^>]*\bid\s*=\s*(?:"light"|'light')[^>]*)>/i;
  const lightMatch = body.match(lightGroupRegex);
  const hasLightLayer = Boolean(lightMatch);
  if (lightMatch) {
    let gAttrs = lightMatch[1];
    const styleVal = getAttr(gAttrs, 'style') || '';
    if (!styleVal.includes('mix-blend-mode')) {
      const nextStyle = `${styleVal}${styleVal && !styleVal.endsWith(';') ? ';' : ''}mix-blend-mode: plus-lighter`;
      gAttrs = setAttr(gAttrs, 'style', nextStyle);
      body = body.replace(lightGroupRegex, `<g${gAttrs}>`);
    }
  }

  // Detect any inherited group fill if present
  const groupFillMatch = body.match(/<g\b[^>]*\bfill\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const fallbackGroupFill = groupFillMatch ? (groupFillMatch[1] ?? groupFillMatch[2]) : null;

  let roundedRects = 0;
  let rectCount = 0;
  let visibleCount = 0;
  let spillCount = 0;
  let invalidFills = 0;
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;

  // 2. Inspect & Auto-Fix <rect> elements
  body = body.replace(/<rect\b([^>]*?)(\/?>)/gi, (_full, attrs: string, close: string) => {
    rectCount++;
    const rawXStr = getAttr(attrs, 'x');
    const rawYStr = getAttr(attrs, 'y');
    const rawWStr = getAttr(attrs, 'width');
    const rawHStr = getAttr(attrs, 'height');

    const rawX = rawXStr !== null ? parseFloat(rawXStr) : 0;
    const rawY = rawYStr !== null ? parseFloat(rawYStr) : 0;
    const rawW = rawWStr !== null ? parseFloat(rawWStr) : 1;
    const rawH = rawHStr !== null ? parseFloat(rawHStr) : 1;

    const x = Number.isFinite(rawX) ? Math.round(rawX) : 0;
    const y = Number.isFinite(rawY) ? Math.round(rawY) : 0;
    const w = Number.isFinite(rawW) ? (rawW > 0 ? Math.max(1, Math.round(rawW)) : 0) : 1;
    const h = Number.isFinite(rawH) ? (rawH > 0 ? Math.max(1, Math.round(rawH)) : 0) : 1;

    if (x !== rawX || y !== rawY || w !== rawW || h !== rawH) {
      roundedRects++;
    }

    let updatedAttrs = attrs;
    updatedAttrs = setAttr(updatedAttrs, 'x', String(x));
    updatedAttrs = setAttr(updatedAttrs, 'y', String(y));
    updatedAttrs = setAttr(updatedAttrs, 'width', String(w));
    updatedAttrs = setAttr(updatedAttrs, 'height', String(h));

    let fillVal = getAttr(updatedAttrs, 'fill');
    if (!fillVal) {
      const styleVal = getAttr(updatedAttrs, 'style');
      const styleFill = styleVal?.match(/fill\s*:\s*([^;]+)/i);
      if (styleFill) fillVal = styleFill[1].trim();
    }
    const effectiveFill = fillVal || fallbackGroupFill;

    if (!isValidColorValue(effectiveFill)) {
      invalidFills++;
    }

    if (w > 0 && h > 0 && effectiveFill !== 'none') {
      visibleCount++;
      bx0 = Math.min(bx0, x);
      by0 = Math.min(by0, y);
      bx1 = Math.max(bx1, x + w);
      by1 = Math.max(by1, y + h);

      if (x < 0 || y < 0 || x + w > W || y + h > H) {
        spillCount++;
      }
    }

    return `<rect${updatedAttrs}${close}`;
  });

  // Check other graphical elements (<path>, <polygon>, <circle>, <ellipse>, <line>, <polyline>)
  const otherShapeMatches =
    body.match(/<(?:path|polygon|circle|ellipse|line|polyline)\b[^>]*>/gi) || [];
  for (const tag of otherShapeMatches) {
    const fillVal = getAttr(tag, 'fill') || getAttr(tag, 'stroke') || fallbackGroupFill;
    if (!isValidColorValue(fillVal)) {
      invalidFills++;
    }
    if (fillVal !== 'none') {
      visibleCount++;
    }
  }

  const sanitizedSvg = `<svg${svgAttrs}>${body}`;
  const palette = extractPaletteFromSvg(sanitizedSvg);
  const uniqueColors = palette.length;

  const isEmpty = visibleCount === 0;
  if (isEmpty) {
    errors.push('draws nothing');
  }

  const bounds = bx0 !== Infinity ? { bx0, by0, bx1, by1 } : null;

  if (spillCount > 0 && bounds) {
    warnings.push(
      `spill: ${spillCount} elements outside ${W}x${H} (bounds x ${bounds.bx0}..${bounds.bx1}, y ${bounds.by0}..${bounds.by1})`
    );
  }

  if (roundedRects > 0) {
    warnings.push(`non-integer coords: auto-fixed ${roundedRects} rect(s)`);
  }

  if (invalidFills > 0) {
    warnings.push(`holes: ${invalidFills} element(s) with undefined/invalid fill`);
  }

  const slowThreshold = options.slowThresholdSec ?? 25;
  if (options.generationTime !== undefined && options.generationTime > slowThreshold) {
    warnings.push(`slow generation: ${options.generationTime.toFixed(2)}s (> ${slowThreshold}s)`);
  }

  const passed = errors.length === 0;

  return {
    sanitizedSvg,
    report: {
      passed,
      isEmpty,
      spillCount,
      bounds,
      uniqueColors,
      rectCount,
      invalidFills,
      hasLightLayer,
      roundedRects,
      warnings,
      errors
    },
    origin,
    palette
  };
}

export const checkSvg = checkAndSanitizeSvg;
