/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackdropType, Resolution } from '../types';
import { parseResolution } from './svgChecker';

/**
 * Nearest-neighbour integer upscale of RGBA buffer (ported directly from pixelfx `fxlib.mjs`)
 */
export function upscale(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  k: number
): Uint8ClampedArray {
  if (k <= 1) return new Uint8ClampedArray(rgba);
  const out = new Uint8ClampedArray(w * k * h * k * 4);
  const src = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h);
  const dst = new Uint32Array(out.buffer);
  for (let y = 0; y < h * k; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < w * k; x++) {
      dst[y * w * k + x] = src[sy * w + ((x / k) | 0)];
    }
  }
  return out;
}

/**
 * Cubic smoothstep attenuation on the outer E = 8 pixels of a buffer
 * (ported from pixelfx `edgeFade` in `fxlib.mjs`):
 *   u = (e + 0.5) / E; k = u * u * (3 - 2 * u)
 */
export function edgeFade(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  E = 8
): Uint8ClampedArray {
  for (let y = 0; y < h; y++) {
    const ey = Math.min(y, h - 1 - y);
    for (let x = 0; x < w; x++) {
      const e = Math.min(ey, x, w - 1 - x);
      if (e >= E) {
        x = w - 1 - E;
        continue;
      }
      const idx = (y * w + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const a = rgba[idx + 3];
      if ((r | g | b | a) === 0) continue;
      const u = (e + 0.5) / E;
      const k = u * u * (3 - 2 * u);
      rgba[idx] = Math.round(r * k);
      rgba[idx + 1] = Math.round(g * k);
      rgba[idx + 2] = Math.round(b * k);
      rgba[idx + 3] = Math.round(a * k);
    }
  }
  return rgba;
}

/**
 * Generates a standard pixelfx test backdrop RGBA buffer (`dark` or `ground` with horizon line)
 */
export function createBackdrop(
  kind: BackdropType,
  w: number,
  h: number,
  horizonY = Math.round(h * 0.78)
): Uint8ClampedArray | null {
  if (kind === 'none') return null;
  const out = new Uint8ClampedArray(w * h * 4);
  const hy = Math.max(0, Math.min(h - 1, Math.round(horizonY)));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (kind === 'dark') {
        out[i] = 12;
        out[i + 1] = 11;
        out[i + 2] = 16;
        out[i + 3] = 255;
      } else {
        // 'ground': sky above horizon, horizon line at hy, ground plane below
        if (y === hy) {
          out[i] = 52;
          out[i + 1] = 46;
          out[i + 2] = 72;
          out[i + 3] = 255;
        } else if (y < hy) {
          out[i] = 12;
          out[i + 1] = 11;
          out[i + 2] = 18;
          out[i + 3] = 255;
        } else {
          const checker = ((x >> 2) + (y >> 2)) & 1;
          out[i] = checker ? 22 : 18;
          out[i + 1] = checker ? 20 : 16;
          out[i + 2] = checker ? 32 : 26;
          out[i + 3] = 255;
        }
      }
    }
  }
  return out;
}

/**
 * Low-level helper to rasterize an SVG string onto an offscreen canvas at exact native resolution (w x h)
 */
async function renderRawSvgToRgba(
  svgString: string,
  w: number,
  h: number
): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (svgEl) {
      svgEl.setAttribute('width', String(w));
      svgEl.setAttribute('height', String(h));
      if (!svgEl.getAttribute('viewBox')) {
        svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
      }
      svgEl.setAttribute('shape-rendering', 'crispEdges');
    }
    const serialized = svgEl ? new XMLSerializer().serializeToString(svgEl) : svgString;
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to acquire 2D canvas context'));
          return;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(imageData.data);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

/**
 * Parses viewBox or resolution to determine native [W, H] of an SVG string
 */
export function getSvgDimensions(svgContent: string, fallbackResolution?: Resolution): [number, number] {
  const vbMatch = svgContent.match(/viewBox=["']\s*0\s+0\s+(\d+)\s+(\d+)\s*["']/i);
  if (vbMatch) {
    const w = parseInt(vbMatch[1], 10);
    const h = parseInt(vbMatch[2], 10);
    if (w > 0 && h > 0) return [w, h];
  }
  return parseResolution(fallbackResolution || Resolution.R64x64);
}

/**
 * Converts an SVG string into an ImageData / RGBA buffer at native resolution.
 * If `<g id="light">` is present (or `applyEdgeFade` is enabled), applies cubic `edgeFade`
 * (E = 8) on the light layer (or outer glow border) so glow doesn't clip sharply at canvas edges.
 */
export async function svgToImageData(
  svgContent: string,
  options: {
    resolution?: Resolution;
    applyEdgeFade?: boolean;
    edgeFadeWidth?: number;
    backdrop?: BackdropType;
    horizonY?: number;
  } = {}
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const [w, h] = getSvgDimensions(svgContent, options.resolution);
  const E = options.edgeFadeWidth ?? 8;
  const shouldFade = options.applyEdgeFade ?? true;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const lightEl = doc.querySelector('g#light, g[id="light"]');

  let finalRgba: Uint8ClampedArray;

  if (lightEl && shouldFade) {
    // Render base color layer without <g id="light">
    const baseDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    baseDoc.querySelectorAll('g#light, g[id="light"]').forEach((el) => el.remove());
    const baseSvg = new XMLSerializer().serializeToString(baseDoc);

    // Render isolated <g id="light"> layer
    const lightOnlyDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgRoot = lightOnlyDoc.querySelector('svg');
    if (svgRoot) {
      const keepLight = svgRoot.querySelector('g#light, g[id="light"]');
      const defs = svgRoot.querySelector('defs');
      svgRoot.innerHTML = '';
      if (defs) svgRoot.appendChild(defs);
      if (keepLight) {
        keepLight.removeAttribute('style');
        svgRoot.appendChild(keepLight);
      }
    }
    const lightSvg = new XMLSerializer().serializeToString(lightOnlyDoc);

    const [baseRgba, lightRgba] = await Promise.all([
      renderRawSvgToRgba(baseSvg, w, h),
      renderRawSvgToRgba(lightSvg, w, h)
    ]);

    // Apply cubic edgeFade in-place on the light layer
    edgeFade(lightRgba, w, h, E);

    // Additive composite (plus-lighter) of faded light over base color
    finalRgba = new Uint8ClampedArray(baseRgba);
    for (let i = 0; i < w * h * 4; i += 4) {
      const la = lightRgba[i + 3] / 255;
      if (la <= 0) continue;
      finalRgba[i] = Math.min(255, Math.round(finalRgba[i] + lightRgba[i] * la));
      finalRgba[i + 1] = Math.min(255, Math.round(finalRgba[i + 1] + lightRgba[i + 1] * la));
      finalRgba[i + 2] = Math.min(255, Math.round(finalRgba[i + 2] + lightRgba[i + 2] * la));
      finalRgba[i + 3] = Math.min(255, Math.max(finalRgba[i + 3], Math.round(lightRgba[i + 3])));
    }
  } else {
    finalRgba = await renderRawSvgToRgba(svgContent, w, h);
    if (shouldFade && options.applyEdgeFade === true) {
      edgeFade(finalRgba, w, h, E);
    }
  }

  // Optional backdrop compositing
  if (options.backdrop && options.backdrop !== 'none') {
    const bg = createBackdrop(options.backdrop, w, h, options.horizonY);
    if (bg) {
      const composited = new Uint8ClampedArray(bg);
      for (let i = 0; i < w * h * 4; i += 4) {
        const a = finalRgba[i + 3] / 255;
        if (a <= 0) continue;
        composited[i] = Math.round(finalRgba[i] * a + composited[i] * (1 - a));
        composited[i + 1] = Math.round(finalRgba[i + 1] * a + composited[i + 1] * (1 - a));
        composited[i + 2] = Math.round(finalRgba[i + 2] * a + composited[i + 2] * (1 - a));
        composited[i + 3] = 255;
      }
      finalRgba = composited;
    }
  }

  return { data: finalRgba, width: w, height: h };
}

/**
 * Converts an RGBA Uint8ClampedArray buffer into a PNG Blob via an HTML5 canvas
 */
export async function rgbaToPngBlob(
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context for PNG encoding');
  const imgData = new ImageData(new Uint8ClampedArray(rgba), w, h);
  ctx.putImageData(imgData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

