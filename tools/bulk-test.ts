#!/usr/bin/env -S node --experimental-transform-types --no-warnings
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Headless CLI Bulk Generator & Automated E2E Test Suite for SVG Pixel Art Generator.
 * Inspired by pixelfx tools/check.mjs, tools/compare.mjs, tools/sheets.mjs, and tools/index.mjs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type GenerationResult, ModelSource, Resolution, type SvgCheckReport } from '../types.ts';
import {
  BEAVERNET_OPENAI_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  detectAvailableProvider,
  fetchBeaverNetModels,
  fetchGeminiModels,
  fetchLocalModels,
  generateSvgFromBeaverNet,
  generateSvgFromLocalModel,
  generateSvgFromPrompt,
  resolveBeaverNetApiKey,
  resolveGeminiApiKey
} from '../services/aiGenerator.ts';
import { checkAndSanitizeSvg, parseResolution } from '../utils/svgChecker.ts';
import { DEFAULT_TEST_SUITE, type PromptPair, getDefaultPromptPairs } from './defaultPrompts.ts';
import {
  type BulkRenderedAsset,
  buildCategoryCompareSheet,
  buildCategorySpriteSheet,
  encodePNG,
  rasterizeSvgHeadless,
  upscale
} from './lib/headlessCanvas.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const ROOT = resolve(__dirname, '..');

/**
 * Loads .env.local and .env from project root into process.env if not already set
 */
function loadDotEnv() {
  for (const envFile of ['.env.local', '.env']) {
    const fullPath = join(ROOT, envFile);
    if (!existsSync(fullPath)) continue;
    const content = readFileSync(fullPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

function slugifyPrompt(prompt: string, indexInCategory: number): string {
  const num = String(indexInCategory + 1).padStart(2, '0');
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-');
  return `${num}-${words || 'asset'}`;
}

function isValidResolution(val: string): val is Resolution {
  return (
    val === Resolution.R64x64 ||
    val === Resolution.R64x128 ||
    val === Resolution.R128x64
  );
}

interface CliOptions {
  pairs: PromptPair[];
  inputPath?: string;
  source?: 'gemini' | 'local' | 'beavernet' | 'mock';
  model?: string;
  lmStudioUrl: string;
  resolutionFilter?: Resolution;
  limit?: number;
  concurrency: number;
  outDir?: string;
  timestamp: string;
  help?: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const pairs: PromptPair[] = [];
  let inputPath: string | undefined;
  let source: 'gemini' | 'local' | 'beavernet' | 'mock' | undefined;
  let model: string | undefined;
  let lmStudioUrl = process.env.OPENAI_BASE_URL || process.env.LM_STUDIO_URL || DEFAULT_OPENAI_BASE_URL;
  let resolutionFilter: Resolution | undefined;
  let limit: number | undefined;
  let concurrency = 1;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  let outDir: string | undefined;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--pair') {
      const raw = argv[++i] || '';
      const sepIdx = raw.indexOf(':');
      if (sepIdx === -1) {
        throw new Error(`Invalid --pair "${raw}". Expected "<resolution>:<prompt>", e.g. "64x64:golden key"`);
      }
      const resStr = raw.slice(0, sepIdx).trim();
      const promptStr = raw.slice(sepIdx + 1).trim();
      if (!isValidResolution(resStr)) {
        throw new Error(
          `Invalid resolution "${resStr}" in --pair. Must be 64x64, 64x128, or 128x64.`
        );
      }
      pairs.push({ resolution: resStr, prompt: promptStr });
    } else if (arg === '--input') {
      inputPath = argv[++i];
    } else if (arg === '--source') {
      const s = (argv[++i] || '').toLowerCase();
      if (s === 'openai' || s === 'local' || s === 'lmstudio') {
        source = 'local';
      } else if (s === 'beavernet' || s === 'beaver') {
        source = 'beavernet';
      } else if (s === 'gemini' || s === 'google') {
        source = 'gemini';
      } else if (s === 'mock') {
        source = 'mock';
      } else {
        throw new Error(`Invalid --source "${s}". Expected openai, local, beavernet, gemini, or mock.`);
      }
    } else if (arg === '--mock') {
      source = 'mock';
    } else if (arg === '--model') {
      model = argv[++i];
    } else if (arg === '--url') {
      lmStudioUrl = argv[++i];
    } else if (arg === '--resolution') {
      const r = argv[++i];
      if (!isValidResolution(r)) {
        throw new Error(`Invalid --resolution "${r}". Expected 64x64, 64x128, or 128x64.`);
      }
      resolutionFilter = r;
    } else if (arg === '--limit') {
      limit = Math.max(1, parseInt(argv[++i], 10));
    } else if (arg === '--concurrency') {
      concurrency = Math.max(1, parseInt(argv[++i], 10) || 2);
    } else if (arg === '--out') {
      const rawOut = argv[++i];
      outDir = rawOut.startsWith('/') ? rawOut : resolve(process.cwd(), rawOut);
    }
  }

  return {
    pairs,
    inputPath,
    source,
    model,
    lmStudioUrl,
    resolutionFilter,
    limit,
    concurrency,
    outDir,
    timestamp,
    help
  };
}

function loadInputJson(filePath: string): PromptPair[] {
  const abs = filePath.startsWith('/') ? filePath : resolve(process.cwd(), filePath);
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  const out: PromptPair[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const res = entry.resolution || Resolution.R64x64;
      if (!isValidResolution(res)) {
        throw new Error(`Invalid resolution "${res}" in ${filePath}`);
      }
      if (typeof entry.prompt === 'string' && entry.prompt.trim()) {
        out.push({ resolution: res, prompt: entry.prompt.trim() });
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const [resKey, list] of Object.entries(raw)) {
      if (!isValidResolution(resKey) || !Array.isArray(list)) continue;
      for (const p of list) {
        if (typeof p === 'string' && p.trim()) {
          out.push({ resolution: resKey, prompt: p.trim() });
        }
      }
    }
  }

  return out;
}

/**
 * Deterministic procedural SVG generator used only when `--mock` is explicitly passed for offline CI testing
 */
function generateProceduralMockSvg(prompt: string, resolution: Resolution): GenerationResult {
  const t0 = performance.now();
  const [W, H] = parseResolution(resolution);
  let hash = 2166136261;
  for (let i = 0; i < prompt.length; i++) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const paletteChoices = [
    ['#141024', '#322058', '#5a3c8c', '#8c64c8', '#c8a0f0', '#ffffff'],
    ['#1c0808', '#54140c', '#9c2814', '#e05818', '#fca828', '#fff4b8'],
    ['#0c1428', '#18305c', '#286098', '#4ca0d8', '#98e0f8', '#f0fcff'],
    ['#0c1c10', '#183c20', '#2c6c34', '#54a44c', '#94dc74', '#e4fce0']
  ];
  const pal = paletteChoices[Math.abs(hash) % paletteChoices.length];
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  const rx = Math.floor(W * 0.28);
  const ry = Math.floor(H * 0.32);

  const colorRects: string[] = [];
  const lightRects: string[] = [];

  for (let y = cy - ry; y <= cy + ry; y += 2) {
    for (let x = cx - rx; x <= cx + rx; x += 2) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d <= 1.0) {
        const cIdx = Math.min(
          pal.length - 1,
          Math.max(0, Math.floor((1 - d) * (pal.length - 1)))
        );
        colorRects.push(
          `<rect x="${x}" y="${y}" width="2" height="2" fill="${pal[cIdx]}" />`
        );
      } else if (d <= 1.35) {
        lightRects.push(
          `<rect x="${x}" y="${y}" width="2" height="2" fill="${pal[pal.length - 2]}" opacity="0.35" />`
        );
      }
    }
  }

  const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" data-origin-x="${cx}" data-origin-y="${cy + ry}">
    <g id="color">${colorRects.join('')}</g>
    <g id="light" style="mix-blend-mode: plus-lighter">${lightRects.join('')}</g>
  </svg>`;

  const generationTime = Math.max(0.01, (performance.now() - t0) / 1000);
  const { sanitizedSvg, report, origin, palette } = checkAndSanitizeSvg(rawSvg, resolution, {
    generationTime
  });

  return {
    content: sanitizedSvg,
    generationTime,
    tokenCount: { prompt: 120, completion: 340, total: 460 },
    origin,
    checkReport: report,
    palette
  };
}

interface TaskItem {
  globalIndex: number;
  categoryIndex: number;
  slug: string;
  resolution: Resolution;
  prompt: string;
}

interface TaskOutcome {
  task: TaskItem;
  status: 'ok' | 'warn' | 'FAIL';
  generationTime: number;
  tokenCount: { prompt: number; completion: number; total: number };
  report: SvgCheckReport;
  svgContent: string;
  origin: [number, number];
  rendered: BulkRenderedAsset;
  errorMsg?: string;
}

function printHelp() {
  console.log(`
SVG Pixel Art Generator — Headless Bulk CLI & Automated Test Suite
Usage:
  npm run bulk                                                 Run full 30-prompt default test suite (10 per resolution)
  npm run bulk -- --pair "64x64:golden key"                    Run custom inline resolution:prompt pairs
  npm run bulk -- --input ./my-prompts.json                    Run prompts from a JSON file

Options:
  --source gemini|local|mock  AI backend (default: gemini if GEMINI_API_KEY is set, else local)
  --model <model-id>          Model ID (default: gemini-2.5-flash or first LM Studio model)
  --url <lm-studio-url>       LM Studio server URL (default: http://localhost:1234)
  --resolution 64x64|64x128|128x64  Filter default test suite to a single resolution
  --limit <N>                 Limit to N prompts per resolution category
  --concurrency <N>           Parallel requests (default: 2)
  --out <dir>                 Output folder (default: records/bulk/<timestamp>)
`);
}

async function main() {
  loadDotEnv();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  // 1. Assemble queue of PromptPairs
  let queue: PromptPair[] = [];
  if (opts.inputPath) {
    queue = loadInputJson(opts.inputPath);
  } else if (opts.pairs.length > 0) {
    queue = opts.pairs;
  } else {
    queue = getDefaultPromptPairs(opts.resolutionFilter, opts.limit);
  }

  if (opts.resolutionFilter && (opts.inputPath || opts.pairs.length > 0)) {
    queue = queue.filter((q) => q.resolution === opts.resolutionFilter);
  }
  if (opts.limit && (opts.inputPath || opts.pairs.length > 0)) {
    const counts = new Map<Resolution, number>();
    queue = queue.filter((q) => {
      const c = counts.get(q.resolution) || 0;
      if (c >= opts.limit!) return false;
      counts.set(q.resolution, c + 1);
      return true;
    });
  }

  if (queue.length === 0) {
    console.error('No prompts to process.');
    process.exit(1);
  }

  // 2. Resolve AI Source & Model (Prioritizes OpenAI-compatible endpoint first, then BeaverNet, then Gemini — always querying live models!)
  const apiKey = resolveGeminiApiKey();
  const beaverKey = resolveBeaverNetApiKey();
  let source: 'gemini' | 'local' | 'beavernet' | 'mock';
  let activeModel = opts.model || '';
  let activeBaseUrl = opts.lmStudioUrl;

  if (opts.source) {
    source = opts.source;
  } else {
    const detected = await detectAvailableProvider(opts.lmStudioUrl, opts.model);
    source =
      detected.source === ModelSource.GEMINI
        ? 'gemini'
        : detected.source === ModelSource.BEAVERNET
        ? 'beavernet'
        : 'local';
    activeBaseUrl = detected.baseUrl;
    if (!activeModel && detected.selectedModelId) {
      activeModel = detected.selectedModelId;
    }
  }

  if (source === 'gemini') {
    if (!apiKey) {
      console.error(
        'ERROR: --source gemini selected but GEMINI_API_KEY is not set in environment or .env.'
      );
      process.exit(1);
    }
    if (!activeModel) {
      const geminiModels = await fetchGeminiModels(apiKey);
      if (geminiModels.length === 0) {
        console.error('ERROR: No generative Gemini models returned by API.');
        process.exit(1);
      }
      activeModel = geminiModels[0].id;
    }
  } else if (source === 'beavernet') {
    activeBaseUrl = BEAVERNET_OPENAI_BASE_URL;
    if (!activeModel) {
      const models = await fetchBeaverNetModels(beaverKey);
      if (models.length === 0) {
        console.error(
          `ERROR: No models returned by BeaverNet (${BEAVERNET_OPENAI_BASE_URL}). Verify BEAVERNET_API_KEY in .env.`
        );
        process.exit(1);
      }
      activeModel = models[0].id;
    }
  } else if (source === 'local') {
    if (!activeModel) {
      try {
        const models = await fetchLocalModels(activeBaseUrl);
        if (models.length === 0) {
          throw new Error(`No models loaded at ${activeBaseUrl}`);
        }
        activeModel = models[0].id;
      } catch (err: any) {
        if (beaverKey && !opts.source) {
          const models = await fetchBeaverNetModels(beaverKey);
          if (models.length > 0) {
            console.log(
              `OpenAI-compatible server at ${activeBaseUrl} unreachable; switching automatically to BeaverNet (${models[0].id}).`
            );
            source = 'beavernet';
            activeBaseUrl = BEAVERNET_OPENAI_BASE_URL;
            activeModel = models[0].id;
          }
        }
        if (!activeModel && apiKey && !opts.source) {
          const geminiModels = await fetchGeminiModels(apiKey);
          if (geminiModels.length > 0) {
            console.log(
              `OpenAI-compatible server at ${activeBaseUrl} unreachable; switching automatically to Gemini (${geminiModels[0].id}).`
            );
            source = 'gemini';
            activeModel = geminiModels[0].id;
          }
        }
        if (!activeModel) {
          console.error(
            `ERROR: Could not connect to OpenAI-compatible server at ${activeBaseUrl} (${err.message}).\nMake sure your local server is running or configure BEAVERNET_API_KEY / GEMINI_API_KEY in .env.`
          );
          process.exit(1);
        }
      }
    }
  } else {
    activeModel = 'procedural-mock';
  }

  // Assign per-category indices and slugs
  const catCounters = new Map<Resolution, number>();
  const tasks: TaskItem[] = queue.map((item, idx) => {
    const catIdx = catCounters.get(item.resolution) || 0;
    catCounters.set(item.resolution, catIdx + 1);
    return {
      globalIndex: idx,
      categoryIndex: catIdx,
      slug: slugifyPrompt(item.prompt, catIdx),
      resolution: item.resolution,
      prompt: item.prompt
    };
  });

  const safeModelTag = activeModel.replace(/[^a-z0-9-_.]+/gi, '_');
  const targetOutDir = opts.outDir || join(ROOT, 'records', 'bulk', `${safeModelTag}_${opts.timestamp}`);

  mkdirSync(targetOutDir, { recursive: true });
  console.log(
    `Running ${tasks.length} prompt(s) [source=${source}, model=${activeModel}, concurrency=${opts.concurrency}]\nOutput -> ${targetOutDir}\n`
  );

  // 3. Execute queue with concurrency control
  const outcomes: TaskOutcome[] = new Array(tasks.length);
  let cursor = 0;
  let fails = 0;
  let warns = 0;

  async function processTask(task: TaskItem): Promise<TaskOutcome> {
    const [w, h] = parseResolution(task.resolution);
    const idLabel = `${task.resolution}/${task.slug}`.padEnd(42, ' ');

    try {
      let genResult: GenerationResult;
      if (source === 'gemini') {
        genResult = await generateSvgFromPrompt(
          task.prompt,
          task.resolution,
          activeModel,
          apiKey
        );
      } else if (source === 'beavernet') {
        genResult = await generateSvgFromBeaverNet(
          task.prompt,
          task.resolution,
          activeModel,
          beaverKey
        );
      } else if (source === 'local') {
        genResult = await generateSvgFromLocalModel(
          task.prompt,
          task.resolution,
          activeBaseUrl,
          activeModel
        );
      } else {
        genResult = generateProceduralMockSvg(task.prompt, task.resolution);
      }

      const check = checkAndSanitizeSvg(genResult.content, task.resolution, {
        generationTime: genResult.generationTime
      });
      const report = check.report;
      const status: 'ok' | 'warn' | 'FAIL' = !report.passed
        ? 'FAIL'
        : report.warnings.length > 0
        ? 'warn'
        : 'ok';

      if (status === 'FAIL') fails++;
      else if (status === 'warn') warns++;

      const raster = rasterizeSvgHeadless(check.sanitizedSvg, task.resolution, true);

      // Save individual .svg and 4x .png
      const resDir = join(targetOutDir, task.resolution);
      mkdirSync(resDir, { recursive: true });
      writeFileSync(join(resDir, `${task.slug}.svg`), check.sanitizedSvg, 'utf8');

      const upscaled4x = upscale(raster.clear, w, h, 4);
      writeFileSync(
        join(resDir, `${task.slug}.png`),
        encodePNG(w * 4, h * 4, upscaled4x)
      );

      // Console output in check.mjs format
      const tag = status === 'FAIL' ? 'FAIL' : status === 'warn' ? 'warn' : 'ok  ';
      const timeCol = `${genResult.generationTime.toFixed(2)}s`.padStart(6, ' ');
      const rectsCol = `${report.rectCount} rects`.padStart(10, ' ');
      const colorsCol = `${report.uniqueColors} colors`;
      const notes = [...report.errors, ...report.warnings];
      const noteSuffix = notes.length > 0 ? `  ${notes.join('; ')}` : `  ${colorsCol}`;

      console.log(`${tag}  ${idLabel} ${timeCol}  ${rectsCol}${noteSuffix}`);

      return {
        task,
        status,
        generationTime: genResult.generationTime,
        tokenCount: genResult.tokenCount,
        report,
        svgContent: check.sanitizedSvg,
        origin: check.origin,
        rendered: {
          slug: task.slug,
          prompt: task.prompt,
          resolution: task.resolution,
          status,
          generationTime: genResult.generationTime,
          w,
          h,
          origin: check.origin,
          clearRgba: raster.clear,
          darkRgba: raster.dark
        }
      };
    } catch (err: any) {
      fails++;
      const errMsg = String(err?.message || err).split('\n')[0];
      console.log(`FAIL  ${idLabel}  0.00s  ${errMsg}`);

      const emptyClear = new Uint8ClampedArray(w * h * 4);
      const emptyDark = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) emptyDark.set([12, 11, 16, 255], i * 4);

      return {
        task,
        status: 'FAIL',
        generationTime: 0,
        tokenCount: { prompt: 0, completion: 0, total: 0 },
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
          warnings: [],
          errors: [errMsg]
        },
        svgContent: '',
        origin: [Math.round(w / 2), h],
        errorMsg: errMsg,
        rendered: {
          slug: task.slug,
          prompt: task.prompt,
          resolution: task.resolution,
          status: 'FAIL',
          generationTime: 0,
          w,
          h,
          origin: [Math.round(w / 2), h],
          clearRgba: emptyClear,
          darkRgba: emptyDark
        }
      };
    }
  }

  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      outcomes[idx] = await processTask(tasks[idx]);
    }
  }

  const workers = Array.from(
    { length: Math.min(opts.concurrency, tasks.length) },
    () => worker()
  );
  await Promise.all(workers);

  // 4. Generate per-category Compare Sheets and Sprite Sheets (.png + .json)
  const categoriesPresent = Array.from(new Set(outcomes.map((o) => o.task.resolution)));
  for (const res of categoriesPresent) {
    const catAssets = outcomes
      .filter((o) => o.task.resolution === res)
      .map((o) => o.rendered);

    if (catAssets.length === 0) continue;

    // Compare sheet: compare-<res>.png
    const comparePng = buildCategoryCompareSheet(catAssets, res);
    writeFileSync(join(targetOutDir, `compare-${res}.png`), comparePng);

    // Sprite sheet: sheet-<res>.png + sheet-<res>.json
    const sheetName = `sheet-${res}`;
    const { png: sheetPng, json: sheetJson } = buildCategorySpriteSheet(
      catAssets,
      res,
      sheetName
    );
    writeFileSync(join(targetOutDir, `${sheetName}.png`), sheetPng);
    writeFileSync(
      join(targetOutDir, `${sheetName}.json`),
      JSON.stringify(sheetJson, null, 2),
      'utf8'
    );
  }

  // 5. Write REPORT.md and summary.json
  const passCount = outcomes.length - fails;
  const reportLines: string[] = [
    '# Bulk Generation & Quality Report',
    '',
    `- **Source:** \`${source}\` (\`${activeModel}\`)`,
    `- **Total Prompts:** ${outcomes.length} (${passCount} pass, ${fails} fail, ${warns} with warnings)`,
    `- **Generated At:** ${new Date().toISOString()}`,
    '',
    '## Category Sheets',
    '',
    ...categoriesPresent.map(
      (res) =>
        `- **${res}**: [compare-${res}.png](./compare-${res}.png) | [sheet-${res}.png](./sheet-${res}.png) | [sheet-${res}.json](./sheet-${res}.json)`
    ),
    '',
    '## Results Table',
    '',
    '| # | Resolution | Prompt | Status | Time | Tokens | Colors | Preview |',
    '|---|---|---|---|---|---|---|---|',
    ...outcomes.map((o, i) => {
      const statusBadge =
        o.status === 'ok' ? 'OK' : o.status === 'warn' ? 'WARN' : 'FAIL';
      const relPng = `./${o.task.resolution}/${o.task.slug}.png`;
      const previewCell =
        o.status !== 'FAIL' ? `![${o.task.slug}](${relPng})` : '—';
      return `| ${i + 1} | \`${o.task.resolution}\` | ${o.task.prompt.replace(/\|/g, '\\|')} | **${statusBadge}** | ${o.generationTime.toFixed(2)}s | ${o.tokenCount.total} | ${o.report.uniqueColors} | ${previewCell} |`;
    }),
    ''
  ];

  writeFileSync(join(targetOutDir, 'REPORT.md'), reportLines.join('\n'), 'utf8');

  const summaryJson = {
    source,
    model: activeModel,
    timestamp: new Date().toISOString(),
    total: outcomes.length,
    passed: passCount,
    failed: fails,
    warnings: warns,
    categories: categoriesPresent,
    items: outcomes.map((o) => ({
      index: o.task.globalIndex + 1,
      slug: o.task.slug,
      resolution: o.task.resolution,
      prompt: o.task.prompt,
      status: o.status,
      generationTime: o.generationTime,
      tokenCount: o.tokenCount,
      origin: o.origin,
      rectCount: o.report.rectCount,
      uniqueColors: o.report.uniqueColors,
      spillCount: o.report.spillCount,
      bounds: o.report.bounds,
      warnings: o.report.warnings,
      errors: o.report.errors,
      files: {
        svg: `${o.task.resolution}/${o.task.slug}.svg`,
        png: `${o.task.resolution}/${o.task.slug}.png`
      }
    }))
  };

  writeFileSync(
    join(targetOutDir, 'summary.json'),
    JSON.stringify(summaryJson, null, 2),
    'utf8'
  );

  console.log(
    `\n${outcomes.length} prompts: ${passCount} pass, ${fails} fail, ${warns} with warnings`
  );
  console.log(`Artifacts written to ${targetOutDir}`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
