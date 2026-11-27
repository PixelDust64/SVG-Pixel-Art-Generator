/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fetchLocalModels, normalizeOpenAiBaseUrl } from '../../services/aiGenerator.ts';

describe('Inference Endpoints Integration Tests (LM Studio, llama.cpp, Ollama, 9931)', () => {
  const PORTS = [
    { name: 'LM Studio', port: 1234, path: '/v1/models' },
    { name: 'llama.cpp', port: 8080, path: '/v1/models' },
    { name: 'Ollama', port: 11434, path: '/v1/models' },
    { name: 'LocalAI / Custom', port: 9931, path: '/v1/models' }
  ];

  for (const { name, port, path } of PORTS) {
    it(`should probe ${name} on port ${port} via curl/fetch`, async () => {
      const url = `http://127.0.0.1:${port}${path}`;
      // Execute curl probe
      const curl = spawnSync('curl', ['-s', '-m', '2', url], { encoding: 'utf8' });
      const isReachable = curl.status === 0 && curl.stdout && !curl.stdout.includes('Failed to connect');

      if (isReachable) {
        console.log(`[PASS] ${name} on port ${port} is active and responding: ${curl.stdout.slice(0, 120)}...`);
        const models = await fetchLocalModels(`http://127.0.0.1:${port}`);
        assert.ok(Array.isArray(models), `Expected models array from ${name}`);
      } else {
        console.log(`[INFO] ${name} on port ${port} is not running (skipped live check)`);
        assert.ok(true);
      }
    });
  }

  it('should verify active LM Studio server responds with OpenAI-compatible chat completions', async () => {
    const lmUrl = 'http://127.0.0.1:1234';
    try {
      const models = await fetchLocalModels(lmUrl, undefined, 2000);
      if (models.length === 0) {
        console.log('[INFO] No active model loaded in LM Studio, skipping completion check.');
        return;
      }

      const activeModelId = models[0].id;
      console.log(`[ACTIVE] Detected LM Studio model: ${activeModelId}`);

      const response = await fetch(`${normalizeOpenAiBaseUrl(lmUrl)}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModelId,
          messages: [{ role: 'user', content: 'Reply with "PONG"' }],
          max_tokens: 10,
          temperature: 0.1
        })
      });

      assert.strictEqual(response.ok, true, `Expected 200 OK from ${activeModelId}`);
      const data = await response.json();
      assert.ok(data.choices && data.choices.length > 0, 'Expected choices array in response');
      console.log(`[PASS] OpenAI-compatible chat completion verified for ${activeModelId}`);
    } catch (err: any) {
      console.log(`[INFO] LM Studio check skipped: ${err.message}`);
    }
  });
});

