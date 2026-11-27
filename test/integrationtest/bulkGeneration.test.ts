/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OPENAI_BASE_URL,
  detectAvailableProvider,
  fetchLocalModels,
  generateSvgFromLocalModel
} from '../../services/aiGenerator.ts';
import { checkAndSanitizeSvg, parseResolution } from '../../utils/svgChecker.ts';
import { DEFAULT_TEST_SUITE, getDefaultPromptPairs } from '../../tools/defaultPrompts.ts';
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
  const num = String(index + 1).padStart(2, '0');
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-');
  return `${num}-${words || 'asset'}`;
}

describe('Bulk Generation Integration Suite (10 Prompts per Resolution)', () => {
  it('should run bulk generation against active LM Studio model and save all artifacts in test/integrationtest/artifacts/', async () => {
    // 1. Detect active model in LM Studio
    const detected = await detectAvailableProvider(DEFAULT_OPENAI_BASE_URL);
    if (!detected.models || detected.models.length === 0) {
      console.log(`[INFO] LM Studio is not currently running on ${DEFAULT_OPENAI_BASE_URL}. Skipping live bulk generation.`);
      return;
    }

    const activeModelId = process.env.MODEL || detected.selectedModelId;
    const safeModelName = activeModelId.replace(/[^a-z0-9-_.]+/gi, '_');
    const runTimestamp = createTimestampSuffix();
    const runFolder = `${safeModelName}_${runTimestamp}`;
    const outDir = join(ARTIFACTS_ROOT, runFolder);
    mkdirSync(outDir, { recursive: true });

    console.log(`\n========================================================`);
    console.log(`INTEGRATION BULK TEST: Active Model -> ${activeModelId}`);
    console.log(`Run Identifier       -> ${runFolder}`);
    console.log(`Output Directory     -> ${outDir}`);
    console.log(`========================================================\n`);

    // Allow limiting via env variable for rapid CI runs, default is full suite (10 per resolution = 30)
    const limitPerCat = process.env.BULK_LIMIT ? parseInt(process.env.BULK_LIMIT, 10) : 10;
    const pairs = getDefaultPromptPairs(undefined, limitPerCat);

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

    for (let i = 0; i < pairs.length; i++) {
      const { resolution, prompt } = pairs[i];
      const catIdx = catCounters.get(resolution) || 0;
      catCounters.set(resolution, catIdx + 1);
      const slug = sanitizeSlug(prompt, catIdx);
      const [w, h] = parseResolution(resolution);
      const idLabel = `${resolution}/${slug}`.padEnd(42, ' ');

      const genResult = await generateSvgFromLocalModel(
        prompt,
        resolution,
        detected.baseUrl,
        activeModelId
      );

      const check = checkAndSanitizeSvg(genResult.content, resolution, {
        generationTime: genResult.generationTime
      });

      const report = check.report;
      const status: 'ok' | 'warn' | 'FAIL' = !report.passed
        ? 'FAIL'
        : report.warnings.length > 0
        ? 'warn'
        : 'ok';

      const raster = rasterizeSvgHeadless(check.sanitizedSvg, resolution, true);

      // Save individual SVG and 4x PNG in test/integrationtest/artifacts/<model>/<resolution>/
      const resDir = join(outDir, resolution);
      mkdirSync(resDir, { recursive: true });
      writeFileSync(join(resDir, `${slug}.svg`), check.sanitizedSvg, 'utf8');

      const upscaled4x = upscale(raster.clear, w, h, 4);
      writeFileSync(join(resDir, `${slug}.png`), encodePNG(w * 4, h * 4, upscaled4x));

      const tag = status === 'FAIL' ? 'FAIL' : status === 'warn' ? 'warn' : 'ok  ';
      const timeCol = `${genResult.generationTime.toFixed(2)}s`.padStart(6, ' ');
      const rectsCol = `${report.rectCount} rects`.padStart(10, ' ');
      const colorsCol = `${report.uniqueColors} colors`;
      console.log(`${tag}  ${idLabel} ${timeCol}  ${rectsCol}  ${colorsCol}`);

      outcomes.push({
        resolution,
        slug,
        prompt,
        status,
        generationTime: genResult.generationTime,
        report,
        rendered: {
          slug,
          prompt,
          resolution,
          status,
          generationTime: genResult.generationTime,
          w,
          h,
          origin: check.origin,
          clearRgba: raster.clear,
          darkRgba: raster.dark
        }
      });
    }

    // 2. Generate Category Compare Sheets and Sprite Sheets
    const categories = [Resolution.R64x64, Resolution.R64x128, Resolution.R128x64];
    for (const res of categories) {
      const catAssets = outcomes.filter((o) => o.resolution === res).map((o) => o.rendered);
      if (catAssets.length === 0) continue;

      // compare-<res>.png
      const comparePng = buildCategoryCompareSheet(catAssets, res);
      writeFileSync(join(outDir, `compare-${res}.png`), comparePng);

      // sheet-<res>.png + sheet-<res>.json
      const sheetName = `sheet-${res}`;
      const { png: sheetPng, json: sheetJson } = buildCategorySpriteSheet(catAssets, res, sheetName);
      writeFileSync(join(outDir, `${sheetName}.png`), sheetPng);
      writeFileSync(join(outDir, `${sheetName}.json`), JSON.stringify(sheetJson, null, 2), 'utf8');
    }

    // 3. Generate REPORT.md and summary.json
    const passes = outcomes.filter((o) => o.status !== 'FAIL').length;
    const fails = outcomes.filter((o) => o.status === 'FAIL').length;
    const warns = outcomes.filter((o) => o.status === 'warn').length;

    const reportLines = [
      `# Integration Test Bulk Generation Report: ${activeModelId}`,
      '',
      `- **Model ID:** \`${activeModelId}\``,
      `- **Total Prompts Processed:** ${outcomes.length} (${passes} pass, ${fails} fail, ${warns} with warnings)`,
      `- **Date:** ${new Date().toISOString()}`,
      '',
      '## Generated Category Sheets',
      '',
      ...categories.map(
        (res) =>
          `- **${res}**: [compare-${res}.png](./compare-${res}.png) | [sheet-${res}.png](./sheet-${res}.png) | [sheet-${res}.json](./sheet-${res}.json)`
      ),
      '',
      '## Detailed Results',
      '',
      '| # | Resolution | Prompt | Status | Time | Colors | Rects |',
      '|---|---|---|---|---|---|---|',
      ...outcomes.map(
        (o, idx) =>
          `| ${idx + 1} | \`${o.resolution}\` | ${o.prompt.replace(/\|/g, '\\|')} | **${o.status.toUpperCase()}** | ${o.generationTime.toFixed(2)}s | ${o.report.uniqueColors} | ${o.report.rectCount} |`
      )
    ];

    writeFileSync(join(outDir, 'REPORT.md'), reportLines.join('\n'), 'utf8');
    writeFileSync(
      join(outDir, 'summary.json'),
      JSON.stringify(
        {
          model: activeModelId,
          total: outcomes.length,
          passes,
          fails,
          warns,
          items: outcomes.map((o) => ({
            resolution: o.resolution,
            slug: o.slug,
            prompt: o.prompt,
            status: o.status,
            generationTime: o.generationTime,
            rectCount: o.report.rectCount,
            uniqueColors: o.report.uniqueColors,
            warnings: o.report.warnings,
            errors: o.report.errors
          }))
        },
        null,
        2
      ),
      'utf8'
    );

    console.log(`\nAll artifacts successfully saved to ${outDir}`);
    assert.ok(passes > 0, 'Expected at least some successful passes');
  });
});
