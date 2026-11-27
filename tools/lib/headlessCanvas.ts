/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Zero-dependency headless SVG pixel-art rasterizer, PNG encoder (ported from pixelfx png.mjs),
 * bitmap pixel font renderer, Sprite Sheet builder, and Compare Sheet builder for Node.js CLI.
 */

import { deflateSync } from 'node:zlib';
import { type AsepriteJson, Resolution } from '../../types.ts';
import { hexToRgb, normalizeHex } from '../../utils/palettes.ts';
import { parseResolution } from '../../utils/svgChecker.ts';

// --- 1. Zero-dependency PNG Encoder (from pixelfx tools/lib/png.mjs) ---

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC[n] = c;
}

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode w x h RGBA bytes as a PNG Buffer (ported from pixelfx tools/lib/png.mjs). */
export function encodePNG(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 1; // Sub filter
    for (let x = 0; x < stride; x++) {
      raw[o + 1 + x] = (src[y * stride + x] - (x >= 4 ? src[y * stride + x - 4] : 0)) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// --- 2. Nearest-Neighbour Upscale & Edge Fade (from pixelfx tools/lib/fxlib.mjs) ---

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

// --- 3. Headless SVG Pixel-Art Rasterizer ---

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  gold: [255, 215, 0],
  brown: [165, 42, 42],
  pink: [255, 192, 203],
  lime: [0, 255, 0],
  navy: [0, 0, 128],
  teal: [0, 128, 128]
};

function parseColor(
  colorStr: string | null | undefined,
  opacityAttr?: string | null
): [number, number, number, number] | null {
  if (!colorStr) return null;
  const val = colorStr.trim().toLowerCase();
  if (!val || val === 'none' || val === 'transparent') return null;

  let alpha = 1;
  if (opacityAttr !== null && opacityAttr !== undefined) {
    const parsedOp = parseFloat(opacityAttr);
    if (Number.isFinite(parsedOp)) alpha = Math.max(0, Math.min(1, parsedOp));
  }

  const hex = normalizeHex(val);
  if (hex) {
    const [r, g, b] = hexToRgb(hex);
    return [r, g, b, Math.round(alpha * 255)];
  }

  const rgbaMatch = val.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  if (rgbaMatch) {
    const r = Math.min(255, parseInt(rgbaMatch[1], 10));
    const g = Math.min(255, parseInt(rgbaMatch[2], 10));
    const b = Math.min(255, parseInt(rgbaMatch[3], 10));
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) * alpha : alpha;
    return [r, g, b, Math.round(Math.max(0, Math.min(1, a)) * 255)];
  }

  if (NAMED_COLORS[val]) {
    const [r, g, b] = NAMED_COLORS[val];
    return [r, g, b, Math.round(alpha * 255)];
  }

  return null;
}

function getAttr(tagAttrs: string, name: string): string | null {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = tagAttrs.match(regex);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : m[2];
}

function blendPixel(
  buf: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  rgba: [number, number, number, number]
) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const idx = (y * w + x) * 4;
  const sa = rgba[3] / 255;
  if (sa <= 0) return;
  if (sa >= 1 || buf[idx + 3] === 0) {
    buf[idx] = rgba[0];
    buf[idx + 1] = rgba[1];
    buf[idx + 2] = rgba[2];
    buf[idx + 3] = Math.max(buf[idx + 3], rgba[3]);
  } else {
    const da = buf[idx + 3] / 255;
    const outA = sa + da * (1 - sa);
    buf[idx] = Math.round((rgba[0] * sa + buf[idx] * da * (1 - sa)) / outA);
    buf[idx + 1] = Math.round((rgba[1] * sa + buf[idx + 1] * da * (1 - sa)) / outA);
    buf[idx + 2] = Math.round((rgba[2] * sa + buf[idx + 2] * da * (1 - sa)) / outA);
    buf[idx + 3] = Math.round(outA * 255);
  }
}

function rasterizeShapesIntoBuffer(
  fragment: string,
  buf: Uint8ClampedArray,
  w: number,
  h: number,
  defaultFill: string | null = null,
  defaultOpacity: string | null = null
) {
  const shapeRegex = /<(rect|circle|ellipse)\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = shapeRegex.exec(fragment)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];

    let fillStr = getAttr(attrs, 'fill');
    let opStr = getAttr(attrs, 'fill-opacity') || getAttr(attrs, 'opacity') || defaultOpacity;
    const styleStr = getAttr(attrs, 'style');
    if (styleStr) {
      const sf = styleStr.match(/fill\s*:\s*([^;]+)/i);
      if (sf && !fillStr) fillStr = sf[1].trim();
      const so = styleStr.match(/opacity\s*:\s*([^;]+)/i);
      if (so && !opStr) opStr = so[1].trim();
    }

    const rgba = parseColor(fillStr || defaultFill, opStr);
    if (!rgba) continue;

    if (tag === 'rect') {
      const rx = Math.round(parseFloat(getAttr(attrs, 'x') || '0'));
      const ry = Math.round(parseFloat(getAttr(attrs, 'y') || '0'));
      const rw = Math.round(parseFloat(getAttr(attrs, 'width') || '1'));
      const rh = Math.round(parseFloat(getAttr(attrs, 'height') || '1'));
      if (rw <= 0 || rh <= 0) continue;

      const x0 = Math.max(0, rx);
      const y0 = Math.max(0, ry);
      const x1 = Math.min(w, rx + rw);
      const y1 = Math.min(h, ry + rh);
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          blendPixel(buf, w, h, xx, yy, rgba);
        }
      }
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = parseFloat(getAttr(attrs, 'cx') || '0');
      const cy = parseFloat(getAttr(attrs, 'cy') || '0');
      const r = parseFloat(getAttr(attrs, 'r') || '0');
      const rx = tag === 'circle' ? r : parseFloat(getAttr(attrs, 'rx') || '0');
      const ry = tag === 'circle' ? r : parseFloat(getAttr(attrs, 'ry') || '0');
      if (rx <= 0 || ry <= 0) continue;

      const x0 = Math.max(0, Math.floor(cx - rx));
      const y0 = Math.max(0, Math.floor(cy - ry));
      const x1 = Math.min(w - 1, Math.ceil(cx + rx));
      const y1 = Math.min(h - 1, Math.ceil(cy + ry));
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const dx = (xx + 0.5 - cx) / rx;
          const dy = (yy + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) {
            blendPixel(buf, w, h, xx, yy, rgba);
          }
        }
      }
    }
  }
}

/**
 * Headless SVG rasterizer producing both transparent RGBA (`clear`) and dark-backdrop RGBA (`dark`).
 * Supports `<g id="color">` and `<g id="light">` with cubic `edgeFade` and additive blending.
 */
export function rasterizeSvgHeadless(
  svgContent: string,
  resolution: Resolution,
  applyEdgeFade = true
): { clear: Uint8ClampedArray; dark: Uint8ClampedArray; w: number; h: number } {
  const [w, h] = parseResolution(resolution);
  const colorBuf = new Uint8ClampedArray(w * h * 4);
  const lightBuf = new Uint8ClampedArray(w * h * 4);

  // Extract <g id="light">...</g> if present
  const lightGroupRegex = /<g\b([^>]*\bid\s*=\s*(?:"light"|'light')[^>]*)>([\s\S]*?)<\/g>/gi;
  let lightFragments: { attrs: string; inner: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = lightGroupRegex.exec(svgContent)) !== null) {
    lightFragments.push({ attrs: m[1], inner: m[2] });
  }

  const baseSvg = svgContent.replace(lightGroupRegex, '');
  rasterizeShapesIntoBuffer(baseSvg, colorBuf, w, h);

  if (lightFragments.length > 0) {
    for (const lf of lightFragments) {
      const gFill = getAttr(lf.attrs, 'fill');
      const gOp = getAttr(lf.attrs, 'opacity') || getAttr(lf.attrs, 'fill-opacity');
      rasterizeShapesIntoBuffer(lf.inner, lightBuf, w, h, gFill, gOp);
    }
    if (applyEdgeFade) {
      edgeFade(lightBuf, w, h, 8);
    }
    // Additive composite (plus-lighter)
    for (let i = 0; i < w * h * 4; i += 4) {
      const la = lightBuf[i + 3] / 255;
      if (la <= 0) continue;
      colorBuf[i] = Math.min(255, Math.round(colorBuf[i] + lightBuf[i] * la));
      colorBuf[i + 1] = Math.min(255, Math.round(colorBuf[i + 1] + lightBuf[i + 1] * la));
      colorBuf[i + 2] = Math.min(255, Math.round(colorBuf[i + 2] + lightBuf[i + 2] * la));
      colorBuf[i + 3] = Math.min(255, Math.max(colorBuf[i + 3], lightBuf[i + 3]));
    }
  }

  // Build dark backdrop version [12, 11, 16, 255]
  const darkBuf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h * 4; i += 4) {
    const a = colorBuf[i + 3] / 255;
    darkBuf[i] = Math.round(colorBuf[i] * a + 12 * (1 - a));
    darkBuf[i + 1] = Math.round(colorBuf[i + 1] * a + 11 * (1 - a));
    darkBuf[i + 2] = Math.round(colorBuf[i + 2] * a + 16 * (1 - a));
    darkBuf[i + 3] = 255;
  }

  return { clear: colorBuf, dark: darkBuf, w, h };
}

// --- 4. Crisp 3x5 / 5x5 Mini Pixel Font & Headless RGBA Canvas (from pixelfx fxlib.mjs) ---

const MINI_GLYPHS: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '.': ['000', '000', '000', '000', '010'],
  ':': ['000', '010', '000', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  '/': ['001', '001', '010', '100', '100'],
  '#': ['101', '111', '101', '111', '101'],
  '(': ['010', '100', '100', '100', '010'],
  ')': ['010', '001', '001', '001', '010'],
  '@': ['111', '101', '111', '100', '111'],
  ' ': ['000', '000', '000', '000', '000']
};

export function createHeadlessCanvas(
  w: number,
  h: number,
  fill: [number, number, number, number] = [12, 11, 16, 255]
) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data.set(fill, i * 4);
  }
  return {
    w,
    h,
    data,
    paste(src: Uint8ClampedArray, sw: number, sh: number, x: number, y: number) {
      for (let yy = 0; yy < sh; yy++) {
        const ty = y + yy;
        if (ty < 0 || ty >= h) continue;
        for (let xx = 0; xx < sw; xx++) {
          const tx = x + xx;
          if (tx < 0 || tx >= w) continue;
          const s = (yy * sw + xx) * 4;
          const d = (ty * w + tx) * 4;
          const a = src[s + 3] / 255;
          for (let c = 0; c < 3; c++) {
            data[d + c] = Math.round(src[s + c] * a + data[d + c] * (1 - a));
          }
          data[d + 3] = Math.max(data[d + 3], src[s + 3]);
        }
      }
    },
    rect(
      x: number,
      y: number,
      rw: number,
      rh: number,
      rgba: [number, number, number, number]
    ) {
      for (let yy = Math.max(0, y); yy < Math.min(h, y + rh); yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(w, x + rw); xx++) {
          data.set(rgba, (yy * w + xx) * 4);
        }
      }
    },
    text(
      str: string,
      x: number,
      y: number,
      k = 2,
      rgb: [number, number, number] = [200, 196, 214]
    ) {
      const upper = str.toUpperCase();
      let cursorX = x;
      for (let i = 0; i < upper.length; i++) {
        const ch = upper[i];
        const glyph = MINI_GLYPHS[ch] || MINI_GLYPHS[' '];
        for (let gy = 0; gy < 5; gy++) {
          for (let gx = 0; gx < 3; gx++) {
            if (glyph[gy][gx] === '1') {
              for (let yy = 0; yy < k; yy++) {
                for (let xx = 0; xx < k; xx++) {
                  const tx = cursorX + gx * k + xx;
                  const ty = y + gy * k + yy;
                  if (tx >= 0 && ty >= 0 && tx < w && ty < h) {
                    data.set([rgb[0], rgb[1], rgb[2], 255], (ty * w + tx) * 4);
                  }
                }
              }
            }
          }
        }
        cursorX += 4 * k;
      }
    },
    png(): Buffer {
      return encodePNG(w, h, data);
    }
  };
}

export interface BulkRenderedAsset {
  slug: string;
  prompt: string;
  resolution: Resolution;
  status: 'ok' | 'warn' | 'FAIL';
  generationTime: number;
  w: number;
  h: number;
  origin: [number, number];
  clearRgba: Uint8ClampedArray;
  darkRgba: Uint8ClampedArray;
}

/**
 * Generates a category Sprite Sheet PNG + Aseprite JSON (ported from pixelfx spriteSheet() in fxlib.mjs)
 */
export function buildCategorySpriteSheet(
  assets: BulkRenderedAsset[],
  resolution: Resolution,
  sheetName = `sheet-${resolution}`
): { png: Buffer; json: AsepriteJson } {
  const [w, h] = parseResolution(resolution);
  const n = Math.max(1, assets.length);
  const fps = 12;
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * h) / w))));
  const rows = Math.ceil(n / cols);

  const img = createHeadlessCanvas(cols * w, rows * h, [0, 0, 0, 0]);
  const firstOrigin: [number, number] = assets[0]?.origin ?? [Math.round(w / 2), h];

  const json: AsepriteJson = {
    frames: [],
    meta: {
      app: 'https://github.com/patch-gg/pixelfx',
      version: '1',
      image: `${sheetName}.png`,
      format: 'RGBA8888',
      size: { w: cols * w, h: rows * h },
      scale: '1',
      frameTags: [{ name: sheetName, from: 0, to: n - 1, direction: 'forward' }],
      pixelfx: {
        id: sheetName,
        name: sheetName,
        fps,
        loop: false,
        frames: n,
        frameSize: [w, h],
        pivot: firstOrigin,
        columns: cols
      }
    }
  };

  assets.forEach((asset, i) => {
    const x = (i % cols) * w;
    const y = Math.floor(i / cols) * h;
    img.paste(asset.clearRgba, w, h, x, y);
    json.frames.push({
      filename: `${sheetName} ${i} (${asset.slug})`,
      frame: { x, y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
      duration: Math.round(1000 / fps)
    });
  });

  return { png: img.png(), json };
}

/**
 * Generates a category Compare Sheet PNG on dark [12, 11, 16, 255] background
 * with prompt title, generation time, and status badge (OK/WARN/FAIL) above each thumbnail.
 */
export function buildCategoryCompareSheet(
  assets: BulkRenderedAsset[],
  resolution: Resolution
): Buffer {
  const [w, h] = parseResolution(resolution);
  const n = Math.max(1, assets.length);
  const k = 3; // 3x nearest-neighbour upscale for contact sheet cells
  const cw = w * k;
  const ch = h * k;
  const pad = 10;
  const labelH = 26;
  const headH = 34;
  const cols = Math.min(n, resolution === Resolution.R128x64 ? 3 : 5);
  const rows = Math.ceil(n / cols);

  const totalW = Math.max(420, pad + cols * (cw + pad));
  const totalH = headH + rows * (ch + labelH + pad) + pad;
  const img = createHeadlessCanvas(totalW, totalH, [12, 11, 16, 255]);

  // Header
  img.text(
    `COMPARE ${resolution}  -  ${assets.length} ASSETS  (@${k}X)`,
    pad,
    10,
    2,
    [200, 196, 214]
  );
  img.rect(pad, headH - 6, totalW - pad * 2, 1, [40, 36, 52, 255]);

  assets.forEach((asset, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = pad + col * (cw + pad);
    const y = headH + row * (ch + labelH + pad);

    // Line 1: index + truncated slug/prompt
    const maxChars = Math.max(8, Math.floor(cw / 8));
    const titleStr = asset.slug.slice(0, maxChars);
    img.text(titleStr, x, y + 2, 2, [220, 216, 232]);

    // Line 2: status + time
    const statusLabel = asset.status.toUpperCase();
    const statusColor: [number, number, number] =
      asset.status === 'ok'
        ? [80, 220, 140]
        : asset.status === 'warn'
        ? [245, 190, 70]
        : [240, 85, 85];
    img.text(statusLabel, x, y + 14, 2, statusColor);
    img.text(
      `${asset.generationTime.toFixed(1)}S`,
      x + (statusLabel.length + 1) * 8,
      y + 14,
      2,
      [140, 134, 160]
    );

    // Upscaled thumbnail
    const scaled = upscale(asset.darkRgba, w, h, k);
    img.paste(scaled, cw, ch, x, y + labelH);
  });

  return img.png();
}
