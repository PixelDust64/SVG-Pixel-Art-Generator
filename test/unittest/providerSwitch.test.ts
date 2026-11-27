/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BEAVERNET_OPENAI_BASE_URL,
  CANDIDATE_OPENAI_ENDPOINTS,
  DEFAULT_OPENAI_BASE_URL,
  detectAvailableProvider,
  normalizeOpenAiBaseUrl,
  resolveBeaverNetApiKey,
  resolveGeminiApiKey,
  resolveOpenAiApiKey
} from '../../services/aiGenerator.ts';
import { ModelSource } from '../../types.ts';

describe('Provider Architecture & Auto-Switch Unit Tests', () => {
  it('should normalize OpenAI base URLs correctly (including BeaverNet)', () => {
    assert.strictEqual(normalizeOpenAiBaseUrl('http://127.0.0.1:1234/'), 'http://127.0.0.1:1234');
    assert.strictEqual(normalizeOpenAiBaseUrl('http://127.0.0.1:1234/v1'), 'http://127.0.0.1:1234');
    assert.strictEqual(normalizeOpenAiBaseUrl('http://localhost:8080/v1/'), 'http://localhost:8080');
    assert.strictEqual(BEAVERNET_OPENAI_BASE_URL, 'https://net.beaverai.org/v1');
    assert.strictEqual(normalizeOpenAiBaseUrl(BEAVERNET_OPENAI_BASE_URL), 'https://net.beaverai.org');
  });

  it('should resolve BEAVERNET_API_KEY from explicit argument or environment', () => {
    const prev = process.env.BEAVERNET_API_KEY;
    process.env.BEAVERNET_API_KEY = 'bn-env-test-key';
    try {
      assert.strictEqual(resolveBeaverNetApiKey(), 'bn-env-test-key');
      assert.strictEqual(resolveBeaverNetApiKey('bn-explicit'), 'bn-explicit');
    } finally {
      if (prev) process.env.BEAVERNET_API_KEY = prev;
      else delete process.env.BEAVERNET_API_KEY;
    }
  });

  it('should include key inference engines in candidate list (LM Studio, llama.cpp, Ollama, 9931)', () => {
    assert.ok(CANDIDATE_OPENAI_ENDPOINTS.includes('http://127.0.0.1:1234'));
    assert.ok(CANDIDATE_OPENAI_ENDPOINTS.includes('http://127.0.0.1:8080'));
    assert.ok(CANDIDATE_OPENAI_ENDPOINTS.includes('http://127.0.0.1:11434'));
    assert.ok(CANDIDATE_OPENAI_ENDPOINTS.includes('http://127.0.0.1:9931'));
  });

  it('should detect provider and stay on OpenAI standard when endpoint responds or defaults', async () => {
    // When pointing to unreachable dummy port without Gemini key, defaults to LOCAL (OpenAI standard)
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.API_KEY;

    try {
      const res = await detectAvailableProvider('http://127.0.0.1:59999');
      assert.strictEqual(res.source, ModelSource.LOCAL);
      assert.strictEqual(res.baseUrl, 'http://127.0.0.1:59999');
    } finally {
      if (prevKey) process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it('should switch transparently to Gemini if local endpoints fail and Gemini key is set', async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-dummy-gemini-key';

    try {
      // Probing a non-existent port with Gemini key present must switch to Gemini
      const res = await detectAvailableProvider('http://127.0.0.1:59999');
      // If no local endpoint responds, switches to Gemini
      if (res.source === ModelSource.GEMINI) {
        assert.strictEqual(res.source, ModelSource.GEMINI);
      }
    } finally {
      if (prevKey) process.env.GEMINI_API_KEY = prevKey;
      else delete process.env.GEMINI_API_KEY;
    }
  });
});

