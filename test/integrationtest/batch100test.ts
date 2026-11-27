#!/usr/bin/env -S node --experimental-transform-types --no-warnings
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Batch 100 Integration Test Suite:
 * Runs 100 prompts for each resolution (64x64, 64x128, 128x64) = 300 prompts total
 * against the specified model endpoint (defaults to gemma-4-12b-qat at http://172.26.208.212:1234).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OPENAI_BASE_URL,
  detectAvailableProvider,
  generateSvgFromLocalModel
} from '../../services/aiGenerator.ts';
import { checkAndSanitizeSvg, parseResolution } from '../../utils/svgChecker.ts';
import {
  type BulkRenderedAsset,
  buildCategoryCompareSheet,
  buildCategorySpriteSheet,
  encodePNG,
  rasterizeSvgHeadless,
  upscale
} from '../../tools/lib/headlessCanvas.ts';
import { Resolution, type SvgCheckReport } from '../../types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ARTIFACTS_ROOT = join(__dirname, 'artifacts');
const PROMPTS_FILE = join(__dirname, 'batch100_prompts.txt');

export function createTimestampSuffix(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}-${MM}-${DD}_${HH}-${mm}-${ss}`;
}

function sanitizeSlug(text: string, index: number): string {
  const num = String(index + 1).padStart(3, '0');
  const clean = text
    .replace(/^crie\s+um\s+(asset\s+)?(svg\s+em\s+)?pixel\s+art\s+(para\s+(jogo\s+2d\s+|interface\s+de\s+jogo,?\s*))?(vis[aã]o\s+lateral,?\s*)?(estilo\s+16-?bit(\s+arcade)?\s*(com\s+contornos\s+pretos)?[.,;]?\s*)?/gi, '')
    .trim();
  const words = (clean || text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-');
  return `${num}-${words || 'asset'}`;
}

export interface PromptItem {
  resolution: Resolution;
  prompt: string;
}

export function loadPromptsFromTxt(filePath: string): PromptItem[] {
  let resolvedPath = filePath;
  if (!existsSync(resolvedPath)) {
    const candidate = join(__dirname, filePath);
    if (existsSync(candidate)) {
      resolvedPath = candidate;
    } else {
      throw new Error(`Prompts file not found at: ${filePath}`);
    }
  }

  const content = readFileSync(resolvedPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const items: PromptItem[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^\[(64x64|64x128|128x64)\]\s*\d*\.?\s*(.+)$/i);
    if (match) {
      const res = match[1] as Resolution;
      const prompt = match[2].trim();
      if (prompt) {
        items.push({ resolution: res, prompt });
      }
    } else {
      let res = Resolution.R64x64;
      if (/retangular horizontal|paisagem|panorama|horizontal longa/i.test(line)) {
        res = Resolution.R128x64;
      }
      items.push({ resolution: res, prompt: line });
    }
  }

  return items;
}

export async function runBatch100Test() {
  const targetBaseUrl = process.env.OPENAI_BASE_URL || 'http://172.26.208.212:1234';
  const targetModelId = process.env.MODEL || 'gemma-4-12b-qat';
  const promptsFile = process.env.PROMPTS_FILE || PROMPTS_FILE;
  const limitPerCategory = process.env.BULK_LIMIT ? parseInt(process.env.BULK_LIMIT, 10) : undefined;

  console.log(`\n========================================================`);
  console.log(`BATCH 100 TEST: SVG PIXEL ART GENERATOR`);
  console.log(`Target Endpoint  : ${targetBaseUrl}`);
  console.log(`Target Model     : ${targetModelId}`);
  console.log(`Prompts Source   : ${promptsFile}`);
  if (limitPerCategory) {
    console.log(`Per-Category Limit: ${limitPerCategory}`);
  }
  console.log(`========================================================\n`);

  const allPrompts = loadPromptsFromTxt(promptsFile);
  console.log(`Loaded ${allPrompts.length} total prompts from file.`);

  // Group and optionally limit
  const grouped = new Map<Resolution, PromptItem[]>();
  grouped.set(Resolution.R64x64, []);
  grouped.set(Resolution.R64x128, []);
  grouped.set(Resolution.R128x64, []);

  for (const item of allPrompts) {
    const list = grouped.get(item.resolution);
    if (list) list.push(item);
  }

  const selectedPrompts: PromptItem[] = [];
  for (const res of [Resolution.R64x64, Resolution.R64x128, Resolution.R128x64]) {
    const list = grouped.get(res) || [];
    const sliced = limitPerCategory !== undefined ? list.slice(0, limitPerCategory) : list;
    selectedPrompts.push(...sliced);
    console.log(`  - Category ${res.padEnd(7, ' ')}: ${sliced.length} prompts`);
  }

  const safeModelName = targetModelId.replace(/[^a-z0-9-_.]+/gi, '_');
  const startDate = new Date();
  const runTimestamp = createTimestampSuffix(startDate);
  const runFolder = `${safeModelName}_${runTimestamp}`;
  const outDir = join(ARTIFACTS_ROOT, runFolder);
  mkdirSync(outDir, { recursive: true });

  const startTimeIso = startDate.toISOString();
  console.log(`\nModel Name         : ${targetModelId}`);
  console.log(`Test Start Time    : ${startTimeIso}`);
  console.log(`Artifacts Directory: ${outDir}\n`);

  const outcomes: Array<{
    resolution: Resolution;
    slug: string;
    prompt: string;
    status: 'ok' | 'warn' | 'FAIL';
    generationTime: number;
    report: SvgCheckReport;
    rendered: BulkRenderedAsset;
  }> = [];

  const catCounters = new Map<Resolution, number>();
  const total = selectedPrompts.length;
  let successCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (let i = 0; i < selectedPrompts.length; i++) {
    const { resolution, prompt } = selectedPrompts[i];
    const catIdx = catCounters.get(resolution) || 0;
    catCounters.set(resolution, catIdx + 1);

    const slug = sanitizeSlug(prompt, catIdx);
    const [w, h] = parseResolution(resolution);
    const progressLabel = `[${String(i + 1).padStart(3, ' ')}/${total}]`;
    const idLabel = `${resolution}/${slug}`.padEnd(38, ' ');

    const resDir = join(outDir, resolution);
    mkdirSync(resDir, { recursive: true });
    const svgPath = join(resDir, `${slug}.svg`);
    const pngPath = join(resDir, `${slug}.png`);

    try {
      const genResult = await generateSvgFromLocalModel(
        prompt,
        resolution,
        targetBaseUrl,
        targetModelId
      );
      const generationTime = genResult.generationTime;
      const check = checkAndSanitizeSvg(genResult.content, resolution, {
        generationTime
      });
      const sanitizedSvg = check.sanitizedSvg;
      const report = check.report;
      const origin = check.origin;
      writeFileSync(svgPath, sanitizedSvg, 'utf8');

      const raster = rasterizeSvgHeadless(sanitizedSvg, resolution, true);
      const upscaled4x = upscale(raster.clear, w, h, 4);
      writeFileSync(pngPath, encodePNG(w * 4, h * 4, upscaled4x));

      const status: 'ok' | 'warn' | 'FAIL' = !report.passed
        ? 'FAIL'
        : report.warnings.length > 0
        ? 'warn'
        : 'ok';

      if (status === 'FAIL') failCount++;
      else if (status === 'warn') {
        warnCount++;
        successCount++;
      } else {
        successCount++;
      }

      const tag = status === 'FAIL' ? 'FAIL' : status === 'warn' ? 'WARN' : ' OK ';
      const timeCol = `${generationTime.toFixed(1)}s`.padStart(6, ' ');
      const rectsCol = `${report.rectCount} rects`.padStart(10, ' ');
      const colorsCol = `${report.uniqueColors} colors`.padStart(11, ' ');
      console.log(`${progressLabel} [${tag}] ${idLabel} ${timeCol} ${rectsCol} ${colorsCol}`);

      outcomes.push({
        resolution,
        slug,
        prompt,
        status,
        generationTime,
        report,
        rendered: {
          slug,
          prompt,
          resolution,
          status,
          generationTime,
          w,
          h,
          origin,
          clearRgba: raster.clear,
          darkRgba: raster.dark
        }
      });
    } catch (err: any) {
      failCount++;
      console.error(`${progressLabel} [FAIL] ${idLabel} ERROR: ${err.message}`);
    }

    // Periodically update summary after every 25 items so progress is inspectable
    if ((i + 1) % 25 === 0 || i === selectedPrompts.length - 1) {
      writeFileSync(
        join(outDir, 'summary.json'),
        JSON.stringify(
          {
            model: targetModelId,
            processed: i + 1,
            total,
            successCount,
            warnCount,
            failCount,
            timestamp: new Date().toISOString()
          },
          null,
          2
        ),
        'utf8'
      );
    }
  }

  // Generate Category Compare Sheets and Sprite Sheets
  console.log(`\nGenerating compare sheets and sprite sheets...`);
  const categories = [Resolution.R64x64, Resolution.R64x128, Resolution.R128x64];
  for (const res of categories) {
    const catAssets = outcomes.filter((o) => o.resolution === res).map((o) => o.rendered);
    if (catAssets.length === 0) continue;

    try {
      const comparePng = buildCategoryCompareSheet(catAssets, res);
      writeFileSync(join(outDir, `compare-${res}.png`), comparePng);

      const sheetName = `sheet-${res}`;
      const { png: sheetPng, json: sheetJson } = buildCategorySpriteSheet(catAssets, res, sheetName);
      writeFileSync(join(outDir, `${sheetName}.png`), sheetPng);
      writeFileSync(join(outDir, `${sheetName}.json`), JSON.stringify(sheetJson, null, 2), 'utf8');
      console.log(`  ✓ Generated compare and sprite sheets for ${res}`);
    } catch (e: any) {
      console.error(`  ✗ Error building sheets for ${res}: ${e.message}`);
    }
  }

  // Generate REPORT.md
  const reportLines = [
    `# Batch 100 Test Report: ${targetModelId}`,
    '',
    `- **Model ID:** \`${targetModelId}\``,
    `- **Endpoint:** \`${targetBaseUrl}\``,
    `- **Real Start Time:** \`${startTimeIso}\``,
    `- **Completion Time:** \`${new Date().toISOString()}\``,
    `- **Output Folder:** \`${runFolder}\``,
    `- **Total Prompts:** ${outcomes.length} of ${total}`,
    `- **Success (OK/WARN):** ${successCount}`,
    `- **Failed:** ${failCount}`,
    `- **Warnings:** ${warnCount}`,
    '',
    '## Category Sheets',
    '',
    ...categories.map(
      (res) =>
        `- **${res}**: [compare-${res}.png](./compare-${res}.png) | [sheet-${res}.png](./sheet-${res}.png) | [sheet-${res}.json](./sheet-${res}.json)`
    ),
    '',
    '## Detailed Asset Log',
    '',
    '| # | Resolution | Prompt | Status | Time | Colors | Rects |',
    '|---|---|---|---|---|---|---|',
    ...outcomes.map(
      (o, idx) =>
        `| ${idx + 1} | \`${o.resolution}\` | ${o.prompt.replace(/\|/g, '\\|')} | **${o.status.toUpperCase()}** | ${o.generationTime.toFixed(2)}s | ${o.report.uniqueColors} | ${o.report.rectCount} |`
    )
  ];

  writeFileSync(join(outDir, 'REPORT.md'), reportLines.join('\n'), 'utf8');
  console.log(`\n========================================================`);
  console.log(`BATCH 100 TEST COMPLETED!`);
  console.log(`Total: ${outcomes.length} | Success: ${successCount} | Failed: ${failCount}`);
  console.log(`Report: ${join(outDir, 'REPORT.md')}`);
  console.log(`========================================================\n`);
}

// If executed directly
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  runBatch100Test().catch((err) => {
    console.error('Fatal error during batch100 test run:', err);
    process.exit(1);
  });
}
