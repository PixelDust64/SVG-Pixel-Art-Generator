/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ColorPalette } from '../types.ts';

/**
 * Standard pixelfx color ramps (darkest to lightest)
 */
export const PAL: Record<string, string[]> = {
  arcane: ['#141024', '#322058', '#5a3c8c', '#8c64c8', '#c8a0f0', '#ffffff'],
  fire: ['#1c0808', '#54140c', '#9c2814', '#e05818', '#fca828', '#fff4b8'],
  ice: ['#0c1428', '#18305c', '#286098', '#4ca0d8', '#98e0f8', '#f0fcff'],
  holy: ['#1c140c', '#4c3818', '#8c6c28', '#cca844', '#f8dc80', '#ffffec'],
  shadow: ['#08060c', '#181224', '#302444', '#503c6c', '#7c649c', '#b8a4d4'],
  nature: ['#0c1c10', '#183c20', '#2c6c34', '#54a44c', '#94dc74', '#e4fce0'],
  gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
};

export const PRESET_PALETTES: ColorPalette[] = [
  { id: 'arcane', name: 'Arcane', colors: PAL.arcane },
  { id: 'fire', name: 'Fire', colors: PAL.fire },
  { id: 'ice', name: 'Ice', colors: PAL.ice },
  { id: 'holy', name: 'Holy', colors: PAL.holy },
  { id: 'shadow', name: 'Shadow', colors: PAL.shadow },
  { id: 'nature', name: 'Nature', colors: PAL.nature },
  { id: 'gameboy', name: 'GameBoy', colors: PAL.gameboy }
];

/**
 * Normalizes a 3-digit or 6-digit hex string to lowercase #rrggbb
 */
export function normalizeHex(hex: string): string | null {
  const trimmed = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const norm = normalizeHex(hex) || '#000000';
  const num = parseInt(norm.slice(1), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Perceived luminance (0..255) for sorting colors darkest -> lightest
 */
export function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Resamples/interpolates a color palette into `n` steps (like pixelfx `fit(palette, n)`)
 */
export function fit(palette: string[], n: number): string[] {
  if (!palette.length || n <= 0) return [];
  if (palette.length === 1) return Array(n).fill(normalizeHex(palette[0]) || '#000000');
  if (n === 1) {
    return [normalizeHex(palette[Math.floor(palette.length / 2)]) || '#000000'];
  }

  const rgbStops = palette.map(hexToRgb);
  const maxIdx = rgbStops.length - 1;
  const out: string[] = [];

  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * maxIdx;
    const idx0 = Math.floor(t);
    const idx1 = Math.min(maxIdx, idx0 + 1);
    const frac = t - idx0;
    const [r0, g0, b0] = rgbStops[idx0];
    const [r1, g1, b1] = rgbStops[idx1];
    out.push(
      rgbToHex(
        r0 + (r1 - r0) * frac,
        g0 + (g1 - g0) * frac,
        b0 + (b1 - b0) * frac
      )
    );
  }

  return out;
}

/**
 * Standard 6-step color ramp from a palette (like pixelfx `ramp(palette)`)
 */
export function ramp(palette: string[], steps = 6): string[] {
  return fit(palette, steps);
}

/**
 * Extracts all unique hexadecimal colors from an SVG string,
 * normalized to 6-digit lowercase hex and sorted by luminance (darkest to lightest).
 */
export function extractPaletteFromSvg(svgContent: string): string[] {
  const hexRegex = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  const matches = svgContent.match(hexRegex) || [];
  const unique = new Set<string>();

  for (const m of matches) {
    const norm = normalizeHex(m);
    if (norm) unique.add(norm);
  }

  return Array.from(unique).sort((a, b) => getLuminance(a) - getLuminance(b));
}

/**
 * Dynamically recolors an SVG string by mapping its existing luminance-sorted hex colors
 * onto a resampled ramp of `targetPalette` in a single pass.
 */
export function recolorSvg(svgContent: string, targetPalette: string[]): string {
  const sourceColors = extractPaletteFromSvg(svgContent);
  if (sourceColors.length === 0 || targetPalette.length === 0) {
    return svgContent;
  }

  const newColors = fit(targetPalette, sourceColors.length);
  const colorMap = new Map<string, string>();
  sourceColors.forEach((srcHex, idx) => {
    colorMap.set(srcHex, newColors[idx]);
  });

  const hexRegex = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  return svgContent.replace(hexRegex, (match) => {
    const norm = normalizeHex(match);
    if (norm && colorMap.has(norm)) {
      return colorMap.get(norm)!;
    }
    return match;
  });
}

