/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { SvgPreview } from './components/SvgPreview';
import { BatchSection } from './components/BatchSection';
import { EditSection } from './components/EditSection';
import { EngineDocsModal } from './components/EngineDocsModal';
import {
  DEFAULT_OPENAI_BASE_URL,
  detectAvailableProvider,
  fetchProviderModels,
  generateSvgFromPrompt,
  generateSvgFromLocalModel,
  generateSvgFromBeaverNet
} from './services/geminiService';
import {
  GeneratedSvg,
  GenerationStatus,
  ApiError,
  Resolution,
  ModelSource,
  LocalModel,
  BatchItem,
  ProviderId
} from './types';
import { generateUUID } from './utils/uuid';
import { AlertCircle, Layout, Layers, Wand2 } from 'lucide-react';

const PROVIDER_TO_SOURCE: Record<ProviderId, ModelSource> = {
  local: ModelSource.LOCAL,
  beavernet: ModelSource.BEAVERNET,
  gemini: ModelSource.GEMINI
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'single' | 'batch' | 'edit'>('single');
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [currentSvg, setCurrentSvg] = useState<GeneratedSvg | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [prompt, setPrompt] = useState('');
  const [resolution, setResolution] = useState<Resolution>(Resolution.R64x64);

  // Edit / Remix State
  const [editStatus, setEditStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [editError, setEditError] = useState<string | null>(null);
  const [editResultSvg, setEditResultSvg] = useState<GeneratedSvg | null>(null);

  // Dynamic Provider & Live Model State (zero baked model names!)
  const [modelSource, setModelSource] = useState<ModelSource>(ModelSource.LOCAL);
  const [lmStudioUrl, setLmStudioUrl] = useState(DEFAULT_OPENAI_BASE_URL);
  const [modelsBySource, setModelsBySource] = useState<Record<ModelSource, LocalModel[]>>({
    [ModelSource.LOCAL]: [],
    [ModelSource.BEAVERNET]: [],
    [ModelSource.GEMINI]: []
  });
  const [selectedModelBySource, setSelectedModelBySource] = useState<Record<ModelSource, string>>({
    [ModelSource.LOCAL]: '',
    [ModelSource.BEAVERNET]: '',
    [ModelSource.GEMINI]: ''
  });
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Batch State
  const [batchItems, setBatchItems] = useState<BatchItem[]>([
    {
      id: generateUUID(),
      prompt: '',
      source: ModelSource.LOCAL,
      model: '',
      localModelId: '',
      resolution: Resolution.R64x64,
      status: GenerationStatus.IDLE
    }
  ]);

  const availableModels = modelsBySource[modelSource] || [];
  const selectedModelId = selectedModelBySource[modelSource] || '';

  const refreshModelsForSource = useCallback(
    async (source: ModelSource, overrideBaseUrl?: string) => {
      setIsFetchingModels(true);
      setModelsError(null);
      try {
        const fetched = await fetchProviderModels(source, {
          baseUrl: overrideBaseUrl || lmStudioUrl
        });
        setModelsBySource((prev) => ({ ...prev, [source]: fetched }));
        setSelectedModelBySource((prev) => {
          const current = prev[source];
          const stillValid = fetched.some((m) => m.id === current);
          return {
            ...prev,
            [source]: stillValid ? current : fetched[0]?.id || ''
          };
        });
        if (fetched.length > 0) {
          setBatchItems((prev) =>
            prev.map((item) =>
              item.status === GenerationStatus.IDLE &&
              item.source === source &&
              !item.localModelId &&
              !item.model
                ? {
                    ...item,
                    model: fetched[0].id,
                    localModelId: fetched[0].id
                  }
                : item
            )
          );
        } else {
          setModelsError('Nenhum modelo disponível foi retornado por este provedor.');
        }
      } catch (err: any) {
        setModelsBySource((prev) => ({ ...prev, [source]: [] }));
        setSelectedModelBySource((prev) => ({ ...prev, [source]: '' }));
        setModelsError(err?.message || 'Não foi possível consultar os modelos deste provedor.');
      } finally {
        setIsFetchingModels(false);
      }
    },
    [lmStudioUrl]
  );

  // Auto-detect available provider and live models on startup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsFetchingModels(true);
      try {
        const detected = await detectAvailableProvider(DEFAULT_OPENAI_BASE_URL);
        if (cancelled) return;
        setModelSource(detected.source);
        setLmStudioUrl(detected.baseUrl);
        if (detected.models.length > 0) {
          setModelsBySource((prev) => ({
            ...prev,
            [detected.source]: detected.models
          }));
          setSelectedModelBySource((prev) => ({
            ...prev,
            [detected.source]: detected.selectedModelId
          }));
          setBatchItems((prev) =>
            prev.map((item) =>
              item.status === GenerationStatus.IDLE && !item.localModelId && !item.model
                ? {
                    ...item,
                    source: detected.source,
                    model: detected.selectedModelId,
                    localModelId: detected.selectedModelId
                  }
                : item
            )
          );
        }
      } finally {
        if (!cancelled) setIsFetchingModels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleModelSourceChange = (nextSource: ModelSource) => {
    setModelSource(nextSource);
    setModelsError(null);
    if ((modelsBySource[nextSource] || []).length === 0) {
      refreshModelsForSource(nextSource);
    }
  };

  const handleSelectedModelIdChange = (id: string) => {
    setSelectedModelBySource((prev) => ({
      ...prev,
      [modelSource]: id
    }));
  };

  const handleProviderModelsUpdatedFromDocs = (provider: ProviderId, models: LocalModel[]) => {
    const source = PROVIDER_TO_SOURCE[provider];
    setModelsBySource((prev) => ({ ...prev, [source]: models }));
    setSelectedModelBySource((prev) => ({
      ...prev,
      [source]: models[0]?.id || ''
    }));
    if (source === modelSource) {
      setModelsError(models.length === 0 ? 'Chave removida ou nenhum modelo encontrado.' : null);
    }
  };

  const handleGenerate = async (
    promptText: string,
    selectedResolution: Resolution,
    modelToUse: string
  ) => {
    if (!modelToUse) {
      setStatus(GenerationStatus.ERROR);
      setError({
        message: 'Nenhum modelo selecionado',
        details: 'Consulte os modelos disponíveis do provedor ou configure sua chave em Engine Docs.'
      });
      return;
    }

    setStatus(GenerationStatus.LOADING);
    setError(null);
    setCurrentSvg(null);

    try {
      let result;

      if (modelSource === ModelSource.GEMINI) {
        result = await generateSvgFromPrompt(promptText, selectedResolution, modelToUse);
      } else if (modelSource === ModelSource.BEAVERNET) {
        result = await generateSvgFromBeaverNet(promptText, selectedResolution, modelToUse);
      } else {
        result = await generateSvgFromLocalModel(
          promptText,
          selectedResolution,
          lmStudioUrl,
          modelToUse
        );
      }

      const newSvg: GeneratedSvg = {
        id: generateUUID(),
        content: result.content,
        prompt: promptText,
        timestamp: Date.now(),
        resolution: selectedResolution,
        generationTime: result.generationTime,
        tokenCount: result.tokenCount,
        origin: result.origin,
        checkReport: result.checkReport,
        palette: result.palette
      };

      setCurrentSvg(newSvg);
      setStatus(GenerationStatus.SUCCESS);
    } catch (err: any) {
      setStatus(GenerationStatus.ERROR);
      setError({
        message: 'Pixelation Failed',
        details: err.message || 'The engine encountered an error while rendering your pixels.'
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-cyan-500/30">
      <Header
        resolution={resolution}
        modelSource={modelSource}
        activeModelId={selectedModelId}
        onOpenDocs={() => setIsDocsOpen(true)}
      />

      <EngineDocsModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
        lmStudioUrl={lmStudioUrl}
        onProviderModelsUpdated={handleProviderModelsUpdatedFromDocs}
      />

      <main className="pb-20 pt-8">
        <div className="max-w-2xl mx-auto flex justify-center mb-8">
          <div className="inline-flex bg-zinc-900 border border-white/5 rounded-xl p-1 shadow-lg shadow-black/40">
            <button
              onClick={() => setActiveTab('single')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'single'
                  ? 'bg-zinc-800 text-white shadow-inner'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Layout className="w-4 h-4" />
              Single Asset
            </button>
            <button
              onClick={() => setActiveTab('batch')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'batch'
                  ? 'bg-zinc-800 text-white shadow-inner'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Layers className="w-4 h-4" />
              Batch Generation
            </button>
            <button
              onClick={() => setActiveTab('edit')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'edit'
                  ? 'bg-zinc-800 text-white shadow-inner'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Wand2 className="w-4 h-4 text-cyan-400" />
              Edit / Remix
            </button>
          </div>
        </div>

        {activeTab === 'single' && (
          <>
            <InputSection
              onGenerate={handleGenerate}
              status={status}
              prompt={prompt}
              onPromptChange={setPrompt}
              resolution={resolution}
              onResolutionChange={setResolution}
              modelSource={modelSource}
              onModelSourceChange={handleModelSourceChange}
              lmStudioUrl={lmStudioUrl}
              onLmStudioUrlChange={setLmStudioUrl}
              availableModels={availableModels}
              selectedModelId={selectedModelId}
              onSelectedModelIdChange={handleSelectedModelIdChange}
              isFetchingModels={isFetchingModels}
              onRefreshModels={() => refreshModelsForSource(modelSource)}
              modelsError={modelsError}
              onOpenDocs={() => setIsDocsOpen(true)}
            />

            {status === GenerationStatus.ERROR && error && (
              <div className="max-w-2xl mx-auto mt-8 px-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3 text-red-200">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-400">{error.message}</h4>
                    <p className="text-sm text-red-300/70 mt-1">{error.details}</p>
                  </div>
                </div>
              </div>
            )}

            {status === GenerationStatus.SUCCESS && currentSvg && (
              <SvgPreview data={currentSvg} />
            )}

            {status === GenerationStatus.IDLE && (
              <div className="max-w-2xl mx-auto mt-16 text-center px-4 opacity-50 pointer-events-none select-none">
                <div className="inline-flex items-center justify-center w-32 h-32 rounded-xl bg-zinc-900/50 border border-white/5 mb-6 rotate-3">
                  <svg
                    className="w-16 h-16 text-zinc-700"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4zM10 10h4v4h-4z" />
                  </svg>
                </div>
                <p className="text-zinc-500 text-lg font-medium tracking-tight">
                  Your {resolution} asset will appear here
                </p>
                <p className="text-zinc-600 text-sm mt-2">
                  Try "Cyberpunk Sword" or "Health Potion"
                </p>
              </div>
            )}
          </>
        )}

        {activeTab === 'batch' && (
          <BatchSection
            modelSource={modelSource}
            lmStudioUrl={lmStudioUrl}
            modelsBySource={modelsBySource}
            selectedModelBySource={selectedModelBySource}
            onRefreshModelsForSource={refreshModelsForSource}
            items={batchItems}
            onItemsChange={setBatchItems}
          />
        )}

        {activeTab === 'edit' && (
          <div className="space-y-10">
            <EditSection
              onSuccess={(result) => setEditResultSvg(result)}
              status={editStatus}
              setStatus={setEditStatus}
              error={editError}
              setError={setEditError}
              modelSource={modelSource}
              onModelSourceChange={handleModelSourceChange}
              lmStudioUrl={lmStudioUrl}
              onLmStudioUrlChange={setLmStudioUrl}
              availableModels={availableModels}
              selectedModelId={selectedModelId}
              onSelectedModelIdChange={handleSelectedModelIdChange}
              isFetchingModels={isFetchingModels}
              onRefreshModels={() => refreshModelsForSource(modelSource)}
              modelsError={modelsError}
              onOpenDocs={() => setIsDocsOpen(true)}
              currentResultSvg={editResultSvg || currentSvg}
            />

            {editStatus === GenerationStatus.ERROR && editError && (
              <div className="max-w-3xl mx-auto px-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3 text-red-200">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-400">Falha na Modificação do SVG</h4>
                    <p className="text-sm text-red-300/70 mt-1">{editError}</p>
                  </div>
                </div>
              </div>
            )}

            {editResultSvg && (
              <div className="max-w-3xl mx-auto px-4">
                <div className="mb-4 text-center">
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                    Resultado da Transformação
                  </span>
                </div>
                <SvgPreview
                  data={editResultSvg}
                  onUpdateSvg={(updated) => setEditResultSvg(updated)}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
