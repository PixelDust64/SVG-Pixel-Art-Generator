#!/usr/bin/env -S node --experimental-transform-types --no-warnings
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Runs batch generation sequentially across multiple models:
 * 1. gemma-4-12b-qat
 * 2. qwen3.5-9b-v5
 */

import { runBatch100Test } from './batch100test.ts';

async function runAll() {
  const models = ['gemma-4-12b-qat', 'qwen3.5-9b-v5'];
  const promptsFile = process.env.PROMPTS_FILE || 'prompts_para_llm_asset_generator_teste_Novo_.txt';
  process.env.PROMPTS_FILE = promptsFile;

  console.log('========================================================');
  console.log('SEQUENTIAL MULTI-MODEL BATCH RUN');
  console.log(`Prompts File: ${promptsFile}`);
  console.log(`Models Queue: ${models.join(' -> ')}`);
  console.log('========================================================\n');

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    console.log(`\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
    console.log(`STARTING MODEL [${i + 1}/${models.length}]: ${model}`);
    console.log(`<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n`);

    process.env.MODEL = model;
    await runBatch100Test();

    console.log(`\n✓ FINISHED MODEL [${i + 1}/${models.length}]: ${model}\n`);
  }

  console.log('\n========================================================');
  console.log('ALL MODELS SUCCESSFULLY PROCESSED!');
  console.log('========================================================\n');
}

runAll().catch((err) => {
  console.error('Fatal error during multi-model comparative run:', err);
  process.exit(1);
});
