/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsepriteJson, BackdropType, BatchItem, ModelSource, Resolution } from '../types';
import { getSvgDimensions, rgbaToPngBlob, svgToImageData, upscale } from './rasterizer';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'pixelcraft_asset'
  );
}

/**
 * Downloads raw or recolored SVG string as an .svg file
 */
export function exportSvgFile(svgContent: string, name: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, `${sanitizeFilename(name)}.svg`);
}

/**
 * Rasterizes SVG at native resolution, optionally applies edgeFade and nearest-neighbour upscale (e.g. 1x, 4x, 8x),
 * and downloads as a crisp PNG file.
 */
export async function exportPngFile(
  svgContent: string,
  scale: number,
  name: string,
  options: {
    resolution?: Resolution;
    applyEdgeFade?: boolean;
    backdrop?: BackdropType;
    horizonY?: number;
  } = {}
): Promise<void> {
  const { data, width, height } = await svgToImageData(svgContent, {
    resolution: options.resolution,
    applyEdgeFade: options.applyEdgeFade,
    backdrop: options.backdrop ?? 'none',
    horizonY: options.horizonY
  });

  const k = Math.max(1, Math.round(scale));
  const scaled = upscale(data, width, height, k);
  const blob = await rgbaToPngBlob(scaled, width * k, height * k);
  const suffix = k > 1 ? `_${k}x` : '_1x';
  downloadBlob(blob, `${sanitizeFilename(name)}${suffix}.png`);
}

/**
 * Packs completed BatchItems into a transparent grid PNG + Aseprite JSON metadata
 * ported directly from pixelfx `spriteSheet()` in `fxlib.mjs`.
 */
export async function exportBatchSpriteSheet(
  items: BatchItem[],
  sheetName = 'pixelcraft_spritesheet'
): Promise<{ json: AsepriteJson }> {
  const completed = items.filter((item) => item.result && item.result.content);
  if (completed.length === 0) {
    throw new Error('No completed batch items available to export.');
  }

  // Determine cell size (max W, max H across batch)
  const dims = completed.map((item) =>
    getSvgDimensions(item.result!.content, item.resolution)
  );
  const w = Math.max(...dims.map((d) => d[0]));
  const h = Math.max(...dims.map((d) => d[1]));
  const n = completed.length;
  const fps = 12;

  // Grid layout formula from fxlib.mjs: cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * h) / w))))
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * h) / w))));
  const rows = Math.ceil(n / cols);

  const sheetW = cols * w;
  const sheetH = rows * h;
  const sheetData = new Uint8ClampedArray(sheetW * sheetH * 4);

  const safeName = sanitizeFilename(sheetName);
  const firstOrigin: [number, number] = completed[0].result?.origin ?? [
    Math.round(w / 2),
    h
  ];

  const json: AsepriteJson = {
    frames: [],
    meta: {
      app: 'https://github.com/patch-gg/pixelfx',
      version: '1',
      image: `${safeName}.png`,
      format: 'RGBA8888',
      size: { w: sheetW, h: sheetH },
      scale: '1',
      frameTags: [
        {
          name: safeName,
          from: 0,
          to: n - 1,
          direction: 'forward'
        }
      ],
      pixelfx: {
        id: safeName,
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

  for (let i = 0; i < n; i++) {
    const item = completed[i];
    const svg = item.result!.content;
    const { data: frameRgba, width: fw, height: fh } = await svgToImageData(svg, {
      resolution: item.resolution,
      backdrop: 'none'
    });

    const cellX = (i % cols) * w;
    const cellY = Math.floor(i / cols) * h;
    // Center frame within cell if resolutions differ
    const offsetX = cellX + Math.floor((w - fw) / 2);
    const offsetY = cellY + Math.floor((h - fh) / 2);

    for (let yy = 0; yy < fh; yy++) {
      const ty = offsetY + yy;
      if (ty < 0 || ty >= sheetH) continue;
      for (let xx = 0; xx < fw; xx++) {
        const tx = offsetX + xx;
        if (tx < 0 || tx >= sheetW) continue;
        const s = (yy * fw + xx) * 4;
        const d = (ty * sheetW + tx) * 4;
        sheetData[d] = frameRgba[s];
        sheetData[d + 1] = frameRgba[s + 1];
        sheetData[d + 2] = frameRgba[s + 2];
        sheetData[d + 3] = frameRgba[s + 3];
      }
    }

    const itemLabel = sanitizeFilename(item.prompt || `frame_${i}`);
    json.frames.push({
      filename: `${safeName} ${i} (${itemLabel})`,
      frame: { x: cellX, y: cellY, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
      duration: Math.round(1000 / fps)
    });
  }

  const pngBlob = await rgbaToPngBlob(sheetData, sheetW, sheetH);
  const jsonBlob = new Blob([JSON.stringify(json, null, 2)], {
    type: 'application/json;charset=utf-8'
  });

  downloadBlob(pngBlob, `${safeName}.png`);
  setTimeout(() => {
    downloadBlob(jsonBlob, `${safeName}.json`);
  }, 150);

  return { json };
}

/**
 * Generates a pixelfx-style Compare / Contact Sheet PNG with dark background (#0c0b10),
 * header banner, and per-cell prompt + model labels above each nearest-neighbour upscaled sprite.
 */
export async function exportBatchCompareSheet(
  items: BatchItem[],
  sheetName = 'pixelcraft_compare'
): Promise<void> {
  const completed = items.filter((item) => item.result && item.result.content);
  if (completed.length === 0) {
    throw new Error('No completed batch items available to export.');
  }

  const dims = completed.map((item) =>
    getSvgDimensions(item.result!.content, item.resolution)
  );
  const w = Math.max(...dims.map((d) => d[0]));
  const h = Math.max(...dims.map((d) => d[1]));
  const n = completed.length;

  // Upscale factor k (like contactSheet in fxlib.mjs)
  const k = Math.max(2, Math.min(4, Math.floor(1400 / Math.min(n, 4) / (w + 12))));
  const cw = w * k;
  const ch = h * k;
  const pad = 16;
  const labelHeight = 36;
  const headerHeight = 44;
  const cols = Math.max(1, Math.min(n, 4));
  const rows = Math.ceil(n / cols);

  const canvasW = pad + cols * (cw + pad);
  const canvasH = headerHeight + rows * (ch + labelHeight + pad) + pad;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create 2D context for Compare Sheet');

  ctx.imageSmoothingEnabled = false;

  // Fill background with pixelfx dark [12, 11, 16, 255] (#0c0b10)
  ctx.fillStyle = '#0c0b10';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Header text
  ctx.fillStyle = '#c8c4d6';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(
    `PIXELCRAFT COMPARE SHEET  •  ${n} ASSET${n > 1 ? 'S' : ''}  •  ${w}x${h} (@${k}x)`,
    pad,
    26
  );

  // Header divider line
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(pad, headerHeight - 8, canvasW - pad * 2, 1);

  for (let i = 0; i < n; i++) {
    const item = completed[i];
    const svg = item.result!.content;
    const { data: frameRgba, width: fw, height: fh } = await svgToImageData(svg, {
      resolution: item.resolution,
      backdrop: 'dark'
    });

    const scaled = upscale(frameRgba, fw, fh, k);
    const sw = fw * k;
    const sh = fh * k;

    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cw + pad);
    const y = headerHeight + row * (ch + labelHeight + pad);

    // Prompt label (top line)
    const promptTitle =
      item.prompt.length > 26 ? `${item.prompt.slice(0, 24)}…` : item.prompt;
    ctx.fillStyle = '#e4e2ec';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`#${i + 1} ${promptTitle}`, x, y + 13);

    // Model + Resolution + Time label (second line)
    const modelLabel =
      item.source === ModelSource.GEMINI
        ? item.model || 'Gemini'
        : item.source === ModelSource.BEAVERNET
        ? item.localModelId || item.model || 'BeaverNet'
        : item.localModelId || 'Local';
    const timeStr =
      item.result?.generationTime !== undefined
        ? ` • ${item.result.generationTime.toFixed(1)}s`
        : '';
    ctx.fillStyle = '#8c86a0';
    ctx.font = '10px monospace';
    ctx.fillText(`${modelLabel} (${item.resolution})${timeStr}`, x, y + 27);

    // Cell border & sprite image
    const imgX = x + Math.floor((cw - sw) / 2);
    const imgY = y + labelHeight + Math.floor((ch - sh) / 2);

    const cellCanvas = document.createElement('canvas');
    cellCanvas.width = sw;
    cellCanvas.height = sh;
    const cellCtx = cellCanvas.getContext('2d');
    if (cellCtx) {
      cellCtx.putImageData(new ImageData(new Uint8ClampedArray(scaled), sw, sh), 0, 0);
      ctx.drawImage(cellCanvas, imgX, imgY);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y + labelHeight - 0.5, cw + 1, ch + 1);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode Compare Sheet PNG'));
        return;
      }
      downloadBlob(blob, `${sanitizeFilename(sheetName)}.png`);
      resolve();
    }, 'image/png');
  });
}

