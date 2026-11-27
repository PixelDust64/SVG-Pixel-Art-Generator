/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export const BEAVERNET_BASE_URL = 'https://net.beaverai.org/v1';
export const DEFAULT_LOCAL_BASE_URL = 'http://127.0.0.1:1234';

type ProviderKey = 'gemini' | 'beavernet' | 'local';

const PROVIDER_ENV_MAP: Record<ProviderKey, string> = {
  gemini: 'GEMINI_API_KEY',
  beavernet: 'BEAVERNET_API_KEY',
  local: 'OPENAI_API_KEY'
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, 'utf8');
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
    if (key) result[key] = val;
  }
  return result;
}

function getEffectiveKey(rootDir: string, provider: ProviderKey): string {
  const varName = PROVIDER_ENV_MAP[provider];
  const envMain = parseEnvFile(path.resolve(rootDir, '.env'));
  const envLocal = parseEnvFile(path.resolve(rootDir, '.env.local'));

  const fromFiles = envMain[varName] || envLocal[varName] || '';
  if (fromFiles) return fromFiles;
  if (process.env[varName]) return String(process.env[varName]);
  if (provider === 'gemini') {
    const fallback = envMain['API_KEY'] || envLocal['API_KEY'] || process.env['API_KEY'] || '';
    if (fallback) return fallback;
  }
  return '';
}

function upsertEnvKey(filePath: string, key: string, value: string): void {
  const escapedVal = /[\s#"']/.test(value) ? JSON.stringify(value) : value;
  const newLine = `${key}=${escapedVal}`;
  let lines: string[] = [];

  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  }

  let found = false;
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.startsWith(`${key}=`)) {
      found = true;
      return newLine;
    }
    return line;
  });

  if (!found) {
    if (updated.length > 0 && updated[updated.length - 1] !== '') {
      updated.push('');
    }
    updated.push(newLine);
  }

  fs.writeFileSync(filePath, updated.join('\n').replace(/\n*$/, '\n'), 'utf8');
  process.env[key] = value;
}

function removeEnvKey(rootDir: string, key: string): void {
  for (const fname of ['.env', '.env.local']) {
    const filePath = path.resolve(rootDir, fname);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return true;
      return !trimmed.startsWith(`${key}=`);
    });
    fs.writeFileSync(filePath, filtered.join('\n').replace(/\n*$/, '\n'), 'utf8');
  }
  delete process.env[key];
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function fetchModelsFromProvider(
  provider: ProviderKey,
  apiKey: string,
  baseUrl?: string
): Promise<Array<{ id: string; name: string }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    if (provider === 'gemini') {
      if (!apiKey) {
        throw new Error('Chave de API do Google Gemini não configurada.');
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Gemini API HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }
      const data: any = await response.json();
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
    }

    const rawUrl =
      provider === 'beavernet'
        ? BEAVERNET_BASE_URL
        : baseUrl || DEFAULT_LOCAL_BASE_URL;
    const cleanUrl = normalizeBaseUrl(rawUrl);

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let response = await fetch(`${cleanUrl}/v1/models`, {
      headers,
      signal: controller.signal
    }).catch(() => null);

    if (!response || !response.ok) {
      const fallbackResp = await fetch(`${cleanUrl}/models`, {
        headers,
        signal: controller.signal
      }).catch(() => null);
      if (fallbackResp && fallbackResp.ok) {
        response = fallbackResp;
      }
    }

    if (!response || !response.ok) {
      const status = response ? response.status : 'NETWORK';
      const errBody = response ? await response.text().catch(() => '') : '';
      throw new Error(
        `Falha ao consultar modelos em ${cleanUrl} (HTTP ${status})${errBody ? `: ${errBody.slice(0, 200)}` : ''}`
      );
    }

    const data: any = await response.json();
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
}

export function createEnvApiPlugin(rootDir: string): Plugin {
  const attachMiddleware = (middlewares: any) => {
    // 1. Key Status (never exposes raw secret)
    middlewares.use('/api/keys/status', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method !== 'GET') return next();
      sendJson(res, 200, {
        local: { configured: Boolean(getEffectiveKey(rootDir, 'local')) },
        beavernet: { configured: Boolean(getEffectiveKey(rootDir, 'beavernet')) },
        gemini: { configured: Boolean(getEffectiveKey(rootDir, 'gemini')) }
      });
    });

    // 2. Test & Save API Key into .env
    middlewares.use('/api/keys/test-and-save', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method !== 'POST') return next();
      try {
        const body = await readJsonBody(req);
        const provider = String(body.provider || '').toLowerCase() as ProviderKey;
        const apiKey = String(body.apiKey || '').trim();
        const baseUrl = body.baseUrl ? String(body.baseUrl).trim() : undefined;

        if (!['gemini', 'beavernet', 'local'].includes(provider)) {
          return sendJson(res, 400, { ok: false, error: 'Provedor inválido.' });
        }
        if (!apiKey) {
          return sendJson(res, 400, { ok: false, error: 'Informe uma chave de API para testar e salvar.' });
        }

        const models = await fetchModelsFromProvider(provider, apiKey, baseUrl);

        const envPath = path.resolve(rootDir, '.env');
        upsertEnvKey(envPath, PROVIDER_ENV_MAP[provider], apiKey);

        return sendJson(res, 200, {
          ok: true,
          configured: true,
          models,
          message: `Conexão validada (${models.length} modelo(s) encontrados) e chave salva no .env.`
        });
      } catch (err: any) {
        return sendJson(res, 400, {
          ok: false,
          error: err?.message || 'Falha ao validar a chave de API.'
        });
      }
    });

    // 3. Delete API Key from .env
    middlewares.use('/api/keys/', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method !== 'DELETE') return next();
      const provider = String(req.url || '').replace(/^\//, '').split('?')[0].toLowerCase() as ProviderKey;
      if (!['gemini', 'beavernet', 'local'].includes(provider)) {
        return sendJson(res, 400, { ok: false, error: 'Provedor inválido.' });
      }
      removeEnvKey(rootDir, PROVIDER_ENV_MAP[provider]);
      if (provider === 'gemini') {
        removeEnvKey(rootDir, 'API_KEY');
      }
      return sendJson(res, 200, { ok: true, configured: false });
    });

    // 4. Dynamic Live Models Query
    middlewares.use('/api/models', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method !== 'GET') return next();
      try {
        const parsedUrl = new URL(req.url || '/', 'http://localhost');
        const provider = String(parsedUrl.searchParams.get('provider') || 'local').toLowerCase() as ProviderKey;
        const baseUrl = parsedUrl.searchParams.get('baseUrl') || undefined;

        if (!['gemini', 'beavernet', 'local'].includes(provider)) {
          return sendJson(res, 400, { error: 'Provedor inválido.' });
        }

        const apiKey = getEffectiveKey(rootDir, provider);
        const models = await fetchModelsFromProvider(provider, apiKey, baseUrl);
        return sendJson(res, 200, { models });
      } catch (err: any) {
        return sendJson(res, 502, {
          models: [],
          error: err?.message || 'Falha ao consultar modelos do provedor.'
        });
      }
    });

    // 5. OpenAI-Compatible Proxy (Local & BeaverNet)
    middlewares.use('/api/proxy/openai/chat', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method !== 'POST') return next();
      try {
        const body = await readJsonBody(req);
        const provider = (body.provider === 'beavernet' ? 'beavernet' : 'local') as ProviderKey;
        const rawUrl =
          provider === 'beavernet'
            ? BEAVERNET_BASE_URL
            : String(body.baseUrl || DEFAULT_LOCAL_BASE_URL);
        const cleanUrl = normalizeBaseUrl(rawUrl);
        const apiKey = getEffectiveKey(rootDir, provider);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const upstream = await fetch(`${cleanUrl}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body.payload || {})
        });

        const text = await upstream.text();
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        res.end(text);
      } catch (err: any) {
        sendJson(res, 502, { error: err?.message || 'Erro no proxy OpenAI-compatible.' });
      }
    });

    // 6. Gemini Proxy
    middlewares.use('/api/proxy/gemini/generate', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method !== 'POST') return next();
      try {
        const body = await readJsonBody(req);
        const model = String(body.model || '').trim();
        if (!model) {
          return sendJson(res, 400, { error: 'Nenhum modelo Gemini selecionado.' });
        }
        const apiKey = getEffectiveKey(rootDir, 'gemini');
        if (!apiKey) {
          return sendJson(res, 401, {
            error: 'Chave de API do Google Gemini não configurada. Configure em Engine Docs.'
          });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const upstream = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body.payload || {})
        });

        const text = await upstream.text();
        res.statusCode = upstream.status;
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        res.end(text);
      } catch (err: any) {
        sendJson(res, 502, { error: err?.message || 'Erro no proxy Google Gemini.' });
      }
    });
  };

  return {
    name: 'pixelcraft-env-api',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    }
  };
}
