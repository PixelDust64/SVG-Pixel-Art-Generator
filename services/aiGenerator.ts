/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Resolution,
  type AIModel,
  ModelSource,
  type LocalModel,
  type GenerationResult,
  type ProviderId,
  type ProviderKeyStatus
} from '../types.ts';
import { checkAndSanitizeSvg } from '../utils/svgChecker.ts';

export const DEFAULT_OPENAI_BASE_URL = 'http://127.0.0.1:1234';
export const BEAVERNET_OPENAI_BASE_URL = 'https://net.beaverai.org/v1';

/** Common local inference engine endpoints (LM Studio, llama.cpp, Ollama, LocalAI, etc.) */
export const CANDIDATE_OPENAI_ENDPOINTS = [
  'http://127.0.0.1:1234',  // LM Studio default
  'http://localhost:1234',
  'http://127.0.0.1:8080',  // llama.cpp server default
  'http://localhost:8080',
  'http://127.0.0.1:11434', // Ollama default
  'http://localhost:11434',
  'http://127.0.0.1:9931',  // Custom inference / LocalAI
  'http://localhost:9931'
];

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Shared system prompt incorporating pixelfx layering (<g id="color"> & <g id="light">) and pivot metadata.
 * Works seamlessly with any OpenAI-compatible engine (LM Studio, llama.cpp, Ollama, BeaverNet) and cloud providers.
 */
export const buildSystemPrompt = (resolution: Resolution): string => {
  const [w, h] = String(resolution).split('x');
  const defaultOx = Math.round(Number(w) / 2);
  const defaultOy = Number(h);
  return `You are a World-Class Pixel Art Generator. Output a high-quality ${resolution} resolution game asset as raw SVG code.

CRITICAL TECHNICAL CONSTRAINTS:
1. Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" data-origin-x="${defaultOx}" data-origin-y="${defaultOy}">
2. Inside the root element, organize pixels into:
   - <g id="color"> for solid sprite pixels.
   - <g id="light" style="mix-blend-mode: plus-lighter"> (optional) for glow/bloom pixels.
3. Draw pixel art using <rect x="..." y="..." width="..." height="..." fill="#RRGGBB" /> with integer coordinates inside 0..${w} and 0..${h}. Combine adjacent pixels of the same color into larger rect blocks (15 to 80 rect elements total).
4. Use a cohesive 16-bit game color ramp (dark outline, shadow, midtone, bright highlight) with valid 6-digit hex colors (#rrggbb).
5. Return ONLY the raw SVG code starting with <svg and ending with </svg>. No explanations or markdown.`;
};

/**
 * Shared system prompt for SVG remixing, variations, and modifications.
 */
export const buildEditSystemPrompt = (resolution?: Resolution | string): string => {
  const resConstraint = resolution
    ? `Target canvas resolution is ${resolution}. Root element viewBox must be "0 0 ${String(resolution).replace('x', ' ')}".`
    : `Preserve the canvas viewBox/aspect ratio of the reference SVG unless explicitly asked to resize.`;

  return `You are a World-Class Pixel Art Editor and SVG Transformer.
Your mission is to modify, enhance, remix, or combine existing pixel art game assets provided in SVG format according to the user's instructions.

CRITICAL TECHNICAL CONSTRAINTS:
1. Root element: <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
2. ${resConstraint}
3. Maintain pixel art grid precision:
   - Organize all solid sprite pixels inside <g id="color">.
   - Organize any optional glow/bloom/fire effects inside <g id="light" style="mix-blend-mode: plus-lighter">.
   - Use <rect x="..." y="..." width="..." height="..." fill="#RRGGBB" /> with integer coordinates.
   - Preserve or adapt the 16-bit pixel art aesthetic and harmonious color palette.
4. Execute user modification instructions faithfully (e.g. adding weapons, changing outfits, altering color palettes, creating animation frames or new poses, fusing characters and items).
5. Return ONLY the raw SVG code starting with <svg and ending with </svg>. No markdown, no explanations, no backticks.`;
};

/**
 * Resolves GEMINI_API_KEY from environment (Node.js process.env)
 */
export function resolveGeminiApiKey(explicitKey?: string): string {
  if (explicitKey) return explicitKey;
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    if (process.env.API_KEY) return process.env.API_KEY;
  }
  return '';
}

/**
 * Resolves optional OPENAI_API_KEY for OpenAI-compatible local endpoints
 */
export function resolveOpenAiApiKey(explicitKey?: string): string {
  if (explicitKey) return explicitKey;
  if (typeof process !== 'undefined' && process.env && process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  return '';
}

/**
 * Resolves BEAVERNET_API_KEY for BeaverNet (https://net.beaverai.org/v1)
 */
export function resolveBeaverNetApiKey(explicitKey?: string): string {
  if (explicitKey) return explicitKey;
  if (typeof process !== 'undefined' && process.env && process.env.BEAVERNET_API_KEY) {
    return process.env.BEAVERNET_API_KEY;
  }
  return '';
}

/**
 * Normalizes base URL so trailing slashes and redundant /v1 suffixes are cleaned up
 */
export function normalizeOpenAiBaseUrl(baseUrl = DEFAULT_OPENAI_BASE_URL): string {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

/**
 * Browser API: Fetches configured status of provider keys stored in .env (never returns raw secrets)
 */
export async function fetchApiKeyStatus(): Promise<ProviderKeyStatus> {
  if (!isBrowserRuntime()) {
    return {
      local: { configured: Boolean(resolveOpenAiApiKey()) },
      beavernet: { configured: Boolean(resolveBeaverNetApiKey()) },
      gemini: { configured: Boolean(resolveGeminiApiKey()) }
    };
  }
  try {
    const res = await fetch('/api/keys/status');
    if (!res.ok) throw new Error('Failed to load key status');
    return await res.json();
  } catch {
    return {
      local: { configured: false },
      beavernet: { configured: false },
      gemini: { configured: false }
    };
  }
}

/**
 * Browser API: Tests a provider API key live and saves it to .env if valid
 */
export async function testAndSaveApiKey(
  provider: ProviderId,
  apiKey: string,
  baseUrl?: string
): Promise<{ ok: boolean; configured: boolean; models?: LocalModel[]; message?: string; error?: string }> {
  const res = await fetch('/api/keys/test-and-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey, baseUrl })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Falha ao validar chave (HTTP ${res.status})`);
  }
  return data;
}

/**
 * Browser API: Deletes a provider API key from .env
 */
export async function deleteApiKey(provider: ProviderId): Promise<{ ok: boolean; configured: boolean }> {
  const res = await fetch(`/api/keys/${encodeURIComponent(provider)}`, {
    method: 'DELETE'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Falha ao remover chave (HTTP ${res.status})`);
  }
  return data;
}

/**
 * Fetches available chat/generation models from an OpenAI-compatible endpoint (Local or BeaverNet).
 * Automatically filters out non-generative models (embeddings).
 */
export const fetchLocalModels = async (
  baseUrl = DEFAULT_OPENAI_BASE_URL,
  apiKey?: string,
  timeoutMs = 5000
): Promise<LocalModel[]> => {
  const cleanUrl = normalizeOpenAiBaseUrl(baseUrl);
  const isBeaverNet = cleanUrl === normalizeOpenAiBaseUrl(BEAVERNET_OPENAI_BASE_URL);

  if (isBrowserRuntime() && !apiKey) {
    const providerParam = isBeaverNet ? 'beavernet' : 'local';
    const query = isBeaverNet
      ? `provider=${providerParam}`
      : `provider=${providerParam}&baseUrl=${encodeURIComponent(cleanUrl)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`/api/models?${query}`, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Failed to fetch models from ${cleanUrl}`);
      }
      return Array.isArray(data.models) ? data.models : [];
    } finally {
      clearTimeout(timer);
    }
  }

  const headers: Record<string, string> = {};
  const resolvedKey = isBeaverNet
    ? resolveBeaverNetApiKey(apiKey)
    : resolveOpenAiApiKey(apiKey);
  if (resolvedKey) {
    headers['Authorization'] = `Bearer ${resolvedKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response = await fetch(`${cleanUrl}/v1/models`, {
      headers,
      signal: controller.signal
    }).catch(() => null);

    // Fallback probe to /models (used by llama.cpp and some microservers)
    if (!response || !response.ok) {
      response = await fetch(`${cleanUrl}/models`, {
        headers,
        signal: controller.signal
      }).catch(() => null);
    }

    if (!response || !response.ok) {
      throw new Error(`Failed to fetch OpenAI-compatible models from ${cleanUrl}`);
    }

    const data = await response.json();
    const rawModels: any[] = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.models)
      ? data.models
      : [];

    const chatModels = rawModels.filter((m) => {
      const id = String(m?.id || m?.name || '').toLowerCase();
      return id && !id.includes('embedding') && !id.includes('embed-text');
    });

    const finalList = chatModels.length > 0 ? chatModels : rawModels;
    return finalList.map((m: any) => ({
      id: String(m.id || m.name),
      name: String(m.id || m.name)
    }));
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Fetches live available models from BeaverNet (https://net.beaverai.org/v1)
 */
export const fetchBeaverNetModels = async (
  apiKey?: string,
  timeoutMs = 8000
): Promise<LocalModel[]> => {
  return fetchLocalModels(BEAVERNET_OPENAI_BASE_URL, apiKey, timeoutMs);
};

/**
 * Fetches live available models from Google Gemini API (no baked/hardcoded model names!)
 */
export const fetchGeminiModels = async (
  apiKey?: string,
  timeoutMs = 8000
): Promise<LocalModel[]> => {
  if (isBrowserRuntime() && !apiKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('/api/models?provider=gemini', { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao consultar modelos do Google Gemini.');
      }
      return Array.isArray(data.models) ? data.models : [];
    } finally {
      clearTimeout(timer);
    }
  }

  const resolvedKey = resolveGeminiApiKey(apiKey);
  if (!resolvedKey) {
    throw new Error('GEMINI_API_KEY não configurada.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(resolvedKey)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Gemini API HTTP ${response.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await response.json();
    const rawModels: any[] = Array.isArray(data.models) ? data.models : [];
    return rawModels
      .filter((m) => {
        const methods: string[] = Array.isArray(m.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [];
        const name = String(m.name || '').toLowerCase();
        return (
          methods.includes('generateContent') &&
          !name.includes('embedding') &&
          !name.includes('aqa') &&
          !name.includes('imagen') &&
          !name.includes('veo')
        );
      })
      .map((m) => {
        const id = String(m.name || '').replace(/^models\//, '');
        const displayName = m.displayName ? `${m.displayName} (${id})` : id;
        return { id, name: displayName };
      });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Unified dynamic model fetcher for any ModelSource
 */
export async function fetchProviderModels(
  source: ModelSource,
  options?: { baseUrl?: string; apiKey?: string; timeoutMs?: number }
): Promise<LocalModel[]> {
  if (source === ModelSource.GEMINI) {
    return fetchGeminiModels(options?.apiKey, options?.timeoutMs);
  }
  if (source === ModelSource.BEAVERNET) {
    return fetchBeaverNetModels(options?.apiKey, options?.timeoutMs);
  }
  return fetchLocalModels(
    options?.baseUrl || DEFAULT_OPENAI_BASE_URL,
    options?.apiKey,
    options?.timeoutMs
  );
}

/**
 * Auto-detects available provider:
 * 1. Checks OpenAI-compatible local endpoints first (LM Studio 1234, llama.cpp 8080, Ollama 11434, etc.)
 * 2. Checks BeaverNet if BEAVERNET_API_KEY is configured
 * 3. Transparently checks Gemini if GEMINI_API_KEY is configured (querying live models — never baked!)
 */
export async function detectAvailableProvider(
  preferredUrl?: string,
  preferredModelId?: string
): Promise<{
  source: ModelSource;
  baseUrl: string;
  models: LocalModel[];
  selectedModelId: string;
}> {
  const candidateUrls: string[] = [];
  if (preferredUrl) candidateUrls.push(normalizeOpenAiBaseUrl(preferredUrl));
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.OPENAI_BASE_URL) candidateUrls.push(normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL));
    if (process.env.LM_STUDIO_URL) candidateUrls.push(normalizeOpenAiBaseUrl(process.env.LM_STUDIO_URL));
  }
  candidateUrls.push(...CANDIDATE_OPENAI_ENDPOINTS);

  const uniqueUrls = Array.from(new Set(candidateUrls));

  const pickPreferred = (models: LocalModel[]) => {
    if (models.length === 0) return '';
    if (preferredModelId) {
      const exact = models.find((m) => m.id === preferredModelId);
      const partial = models.find((m) =>
        m.id.toLowerCase().includes(preferredModelId.toLowerCase())
      );
      if (exact) return exact.id;
      if (partial) return partial.id;
    }
    return models[0].id;
  };

  for (const url of uniqueUrls) {
    try {
      const models = await fetchLocalModels(url, undefined, 2000);
      if (models.length > 0) {
        return {
          source: ModelSource.LOCAL,
          baseUrl: url,
          models,
          selectedModelId: pickPreferred(models)
        };
      }
    } catch {
      // Continue probing other candidate endpoints
    }
  }

  // Check configured cloud providers (BeaverNet / Gemini)
  const keyStatus = await fetchApiKeyStatus();

  if (keyStatus.beavernet.configured) {
    try {
      const models = await fetchBeaverNetModels(undefined, 4000);
      if (models.length > 0) {
        return {
          source: ModelSource.BEAVERNET,
          baseUrl: preferredUrl ? normalizeOpenAiBaseUrl(preferredUrl) : DEFAULT_OPENAI_BASE_URL,
          models,
          selectedModelId: pickPreferred(models)
        };
      }
    } catch {
      // Fall through to Gemini check
    }
  }

  if (keyStatus.gemini.configured || resolveGeminiApiKey()) {
    try {
      const models = await fetchGeminiModels(undefined, 4000);
      return {
        source: ModelSource.GEMINI,
        baseUrl: preferredUrl ? normalizeOpenAiBaseUrl(preferredUrl) : DEFAULT_OPENAI_BASE_URL,
        models,
        selectedModelId: pickPreferred(models)
      };
    } catch {
      return {
        source: ModelSource.GEMINI,
        baseUrl: preferredUrl ? normalizeOpenAiBaseUrl(preferredUrl) : DEFAULT_OPENAI_BASE_URL,
        models: [],
        selectedModelId: ''
      };
    }
  }

  // Default to standard OpenAI base URL
  return {
    source: ModelSource.LOCAL,
    baseUrl: preferredUrl ? normalizeOpenAiBaseUrl(preferredUrl) : DEFAULT_OPENAI_BASE_URL,
    models: [],
    selectedModelId: ''
  };
}

/**
 * Internal helper to send chat completion request to OpenAI-compatible provider (Local or BeaverNet)
 */
async function callOpenAiChat(
  baseUrl: string,
  payload: Record<string, any>,
  apiKey?: string
): Promise<any> {
  const cleanUrl = normalizeOpenAiBaseUrl(baseUrl);
  const isBeaverNet = cleanUrl === normalizeOpenAiBaseUrl(BEAVERNET_OPENAI_BASE_URL);

  if (isBrowserRuntime() && !apiKey) {
    const response = await fetch('/api/proxy/openai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: isBeaverNet ? 'beavernet' : 'local',
        baseUrl: cleanUrl,
        payload
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(
        `Failed to generate SVG from ${isBeaverNet ? 'BeaverNet' : 'OpenAI-compatible'} model (HTTP ${response.status}): ${errText}`
      );
    }
    return response.json();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const resolvedKey = isBeaverNet
    ? resolveBeaverNetApiKey(apiKey)
    : resolveOpenAiApiKey(apiKey);
  if (resolvedKey) {
    headers['Authorization'] = `Bearer ${resolvedKey}`;
  }

  const response = await fetch(`${cleanUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Failed to generate SVG from ${isBeaverNet ? 'BeaverNet' : 'OpenAI-compatible'} model (HTTP ${response.status}): ${errText}`
    );
  }

  return response.json();
}

/**
 * Generates a Pixel Art SVG string using any OpenAI-compatible endpoint (LM Studio, llama.cpp, Ollama, BeaverNet, OpenAI)
 */
export const generateSvgFromLocalModel = async (
  prompt: string,
  resolution: Resolution,
  baseUrl = DEFAULT_OPENAI_BASE_URL,
  modelId: string,
  apiKey?: string
): Promise<GenerationResult> => {
  if (!modelId || !modelId.trim()) {
    throw new Error('Nenhum modelo selecionado. Consulte os modelos disponíveis no servidor primeiro.');
  }

  const startTime = Date.now();
  const systemPrompt = buildSystemPrompt(resolution);

  const isThinkingModel = /qwen3|deepseek|reasoning|r1|gemma/i.test(modelId);
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Create a ${resolution} pixel art SVG of: "${prompt}". Output ONLY valid SVG code.`
    }
  ];
  if (isThinkingModel) {
    messages.push({ role: 'assistant', content: '<think>\n\n</think>\n' });
  }

  const data = await callOpenAiChat(
    baseUrl,
    {
      model: modelId,
      messages,
      temperature: 0.3,
      top_p: 0.85,
      frequency_penalty: 0.2,
      max_tokens: 2048,
      reasoning_effort: 'none',
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false }
    },
    apiKey
  );

  const msg = data.choices?.[0]?.message || {};
  const rawText = msg.content || msg.reasoning_content || '';
  const generationTime = (Date.now() - startTime) / 1000;

  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const tokenCount = {
    prompt: usage.prompt_tokens || 0,
    completion: usage.completion_tokens || 0,
    total: usage.total_tokens || 0
  };

  const { sanitizedSvg, report, origin, palette } = checkAndSanitizeSvg(rawText, resolution, {
    generationTime
  });

  return {
    content: sanitizedSvg,
    generationTime,
    tokenCount,
    origin,
    checkReport: report,
    palette
  };
};

/**
 * Convenience wrapper for BeaverNet (https://net.beaverai.org/v1)
 */
export const generateSvgFromBeaverNet = async (
  prompt: string,
  resolution: Resolution,
  modelId: string,
  apiKey?: string
): Promise<GenerationResult> => {
  return generateSvgFromLocalModel(
    prompt,
    resolution,
    BEAVERNET_OPENAI_BASE_URL,
    modelId,
    apiKey
  );
};

/**
 * Internal helper to invoke Google Gemini API (browser via server proxy, headless Node directly)
 */
async function callGeminiGenerate(
  model: string,
  systemPrompt: string,
  userMessage: string,
  apiKey?: string
): Promise<{ rawText: string; tokenCount: { prompt: number; completion: number; total: number } }> {
  let targetModel = (model || '').trim();
  if (!targetModel) {
    const liveModels = await fetchGeminiModels(apiKey);
    if (liveModels.length === 0) {
      throw new Error('Nenhum modelo Gemini disponível foi encontrado na API.');
    }
    targetModel = liveModels[0].id;
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      topP: 0.8,
      topK: 40
    }
  };

  if (isBrowserRuntime() && !apiKey) {
    const response = await fetch('/api/proxy/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: targetModel, payload })
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Gemini API HTTP ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const rawText =
      data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    const usage = data.usageMetadata || {};
    return {
      rawText,
      tokenCount: {
        prompt: usage.promptTokenCount || 0,
        completion: usage.candidatesTokenCount || 0,
        total: usage.totalTokenCount || 0
      }
    };
  }

  const resolvedKey = resolveGeminiApiKey(apiKey);
  if (!resolvedKey) {
    throw new Error(
      'GEMINI_API_KEY não configurada. Configure sua chave no menu Engine Docs ou no arquivo .env.'
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    targetModel
  )}:generateContent?key=${encodeURIComponent(resolvedKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Gemini API HTTP ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const rawText =
    data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  const usage = data.usageMetadata || {};
  return {
    rawText,
    tokenCount: {
      prompt: usage.promptTokenCount || 0,
      completion: usage.candidatesTokenCount || 0,
      total: usage.totalTokenCount || 0
    }
  };
}

/**
 * Generates a Pixel Art SVG string using Google Gemini API
 */
export const generateSvgFromPrompt = async (
  prompt: string,
  resolution: Resolution,
  model: AIModel,
  apiKey?: string
): Promise<GenerationResult> => {
  const startTime = Date.now();
  const systemPrompt = buildSystemPrompt(resolution);
  const userMessage = `Create a ${resolution} pixel art SVG of: "${prompt}". Output ONLY valid SVG code.`;

  const { rawText, tokenCount } = await callGeminiGenerate(model, systemPrompt, userMessage, apiKey);
  const generationTime = (Date.now() - startTime) / 1000;
  const { sanitizedSvg, report, origin, palette } = checkAndSanitizeSvg(rawText, resolution, {
    generationTime
  });

  return {
    content: sanitizedSvg,
    generationTime,
    tokenCount,
    origin,
    checkReport: report,
    palette
  };
};

/**
 * Transforms, edits, or remixes one or more input SVGs using an OpenAI-compatible model (Local or BeaverNet)
 */
export const editSvgWithLocalModel = async (
  instruction: string,
  inputSvgs: Array<{ name?: string; content: string }>,
  resolution?: Resolution | string,
  baseUrl = DEFAULT_OPENAI_BASE_URL,
  modelId = '',
  apiKey?: string
): Promise<GenerationResult> => {
  if (!modelId || !modelId.trim()) {
    throw new Error('Nenhum modelo selecionado. Consulte os modelos disponíveis primeiro.');
  }

  const startTime = Date.now();
  const systemPrompt = buildEditSystemPrompt(resolution);

  const svgContext = inputSvgs
    .map((item, idx) => {
      const label = item.name ? `SVG ${idx + 1} (${item.name})` : `SVG ${idx + 1}`;
      return `--- ${label} ---\n${item.content.trim()}\n-------------------`;
    })
    .join('\n\n');

  const userContent = `Here are the reference input SVG asset(s):\n\n${svgContext}\n\nUSER MODIFICATION INSTRUCTION:\n"${instruction}"\n\nGenerate and return ONLY the resulting transformed pixel art SVG code.`;

  const isThinkingModel = /qwen3|deepseek|reasoning|r1|gemma/i.test(modelId);
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];
  if (isThinkingModel) {
    messages.push({ role: 'assistant', content: '<think>\n\n</think>\n' });
  }

  const data = await callOpenAiChat(
    baseUrl,
    {
      model: modelId,
      messages,
      temperature: 0.3,
      top_p: 0.85,
      frequency_penalty: 0.2,
      max_tokens: 2048,
      reasoning_effort: 'none',
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false }
    },
    apiKey
  );

  const msg = data.choices?.[0]?.message || {};
  const rawText = msg.content || msg.reasoning_content || '';
  const generationTime = (Date.now() - startTime) / 1000;

  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const tokenCount = {
    prompt: usage.prompt_tokens || 0,
    completion: usage.completion_tokens || 0,
    total: usage.total_tokens || 0
  };

  const targetRes = (resolution as Resolution) || Resolution.R64x64;
  const { sanitizedSvg, report, origin, palette } = checkAndSanitizeSvg(rawText, targetRes, {
    generationTime,
    preserveOriginalViewBox: !resolution
  });

  return {
    content: sanitizedSvg,
    generationTime,
    tokenCount,
    origin,
    checkReport: report,
    palette
  };
};

/**
 * Convenience wrapper to edit/remix SVGs using BeaverNet
 */
export const editSvgWithBeaverNet = async (
  instruction: string,
  inputSvgs: Array<{ name?: string; content: string }>,
  resolution?: Resolution | string,
  modelId = '',
  apiKey?: string
): Promise<GenerationResult> => {
  return editSvgWithLocalModel(
    instruction,
    inputSvgs,
    resolution,
    BEAVERNET_OPENAI_BASE_URL,
    modelId,
    apiKey
  );
};

/**
 * Transforms, edits, or remixes one or more input SVGs using Google Gemini API
 */
export const editSvgWithPrompt = async (
  instruction: string,
  inputSvgs: Array<{ name?: string; content: string }>,
  resolution?: Resolution | string,
  model: AIModel = '',
  apiKey?: string
): Promise<GenerationResult> => {
  const startTime = Date.now();
  const systemPrompt = buildEditSystemPrompt(resolution);

  const svgContext = inputSvgs
    .map((item, idx) => {
      const label = item.name ? `SVG ${idx + 1} (${item.name})` : `SVG ${idx + 1}`;
      return `--- ${label} ---\n${item.content.trim()}\n-------------------`;
    })
    .join('\n\n');

  const userMessage = `Here are the reference input SVG asset(s):\n\n${svgContext}\n\nUSER MODIFICATION INSTRUCTION:\n"${instruction}"\n\nGenerate and return ONLY the resulting transformed pixel art SVG code.`;

  const { rawText, tokenCount } = await callGeminiGenerate(model, systemPrompt, userMessage, apiKey);
  const generationTime = (Date.now() - startTime) / 1000;
  const targetRes = (resolution as Resolution) || Resolution.R64x64;
  const { sanitizedSvg, report, origin, palette } = checkAndSanitizeSvg(rawText, targetRes, {
    generationTime,
    preserveOriginalViewBox: !resolution
  });

  return {
    content: sanitizedSvg,
    generationTime,
    tokenCount,
    origin,
    checkReport: report,
    palette
  };
};
