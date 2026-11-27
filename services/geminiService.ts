/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  DEFAULT_OPENAI_BASE_URL,
  BEAVERNET_OPENAI_BASE_URL,
  buildSystemPrompt,
  buildEditSystemPrompt,
  detectAvailableProvider,
  fetchLocalModels,
  fetchBeaverNetModels,
  fetchGeminiModels,
  fetchProviderModels,
  fetchApiKeyStatus,
  testAndSaveApiKey,
  deleteApiKey,
  generateSvgFromLocalModel,
  generateSvgFromBeaverNet,
  generateSvgFromPrompt,
  editSvgWithLocalModel,
  editSvgWithBeaverNet,
  editSvgWithPrompt,
  normalizeOpenAiBaseUrl,
  resolveGeminiApiKey,
  resolveOpenAiApiKey,
  resolveBeaverNetApiKey
} from './aiGenerator.ts';
