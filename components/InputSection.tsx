
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback } from 'react';
import { Cpu, Loader2, Zap, Settings2, Globe, Monitor, RefreshCw } from 'lucide-react';
import { GenerationStatus, Resolution, AIModel, MODEL_DISPLAY_NAMES, ModelSource, LocalModel } from '../types';
import { fetchLocalModels } from '../services/geminiService';

interface InputSectionProps {
  onGenerate: (prompt: string, resolution: Resolution, model: AIModel) => void;
  status: GenerationStatus;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  resolution: Resolution;
  onResolutionChange: (res: Resolution) => void;
  model: AIModel;
  onModelChange: (model: AIModel) => void;
  
  modelSource: ModelSource;
  onModelSourceChange: (source: ModelSource) => void;
  lmStudioUrl: string;
  onLmStudioUrlChange: (url: string) => void;
  localModels: LocalModel[];
  onLocalModelsChange: (models: LocalModel[]) => void;
  selectedLocalModelId: string;
  onSelectedLocalModelIdChange: (id: string) => void;
}

export const InputSection: React.FC<InputSectionProps> = ({ 
  onGenerate, 
  status, 
  prompt,
  onPromptChange,
  resolution, 
  onResolutionChange,
  model,
  onModelChange,
  modelSource,
  onModelSourceChange,
  lmStudioUrl,
  onLmStudioUrlChange,
  localModels,
  onLocalModelsChange,
  selectedLocalModelId,
  onSelectedLocalModelIdChange
}) => {
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && status !== GenerationStatus.LOADING) {
      onGenerate(prompt.trim(), resolution, model);
    }
  }, [prompt, status, onGenerate, resolution, model]);

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    try {
      const models = await fetchLocalModels(lmStudioUrl);
      onLocalModelsChange(models);
      if (models.length > 0 && !selectedLocalModelId) {
        onSelectedLocalModelIdChange(models[0].id);
      }
    } catch (error) {
      alert("Failed to fetch models from LM Studio. Make sure it's running and CORS is enabled.");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const isLoading = status === GenerationStatus.LOADING;

  const suggestions = [
    'Health Potion', 
    'Crystal Sword', 
    'Cyberpunk Helmet', 
    'Forest Slime', 
    'Retro Coin',
    'Magic Wand'
  ];

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="text-center mb-10">
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4 uppercase italic">
          Forge Pixel Assets
        </h2>
        <p className="text-zinc-400 text-base sm:text-lg max-w-lg mx-auto leading-relaxed">
          Describe an item, and PixelCraft will generate a sharp SVG sprite.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl opacity-20 group-hover:opacity-30 transition duration-500 blur"></div>
        <div className="relative flex flex-col bg-zinc-900/90 rounded-lg border border-white/10 shadow-2xl overflow-hidden p-1.5">
          <div className="flex items-center">
            <div className="pl-4 text-zinc-500">
              <Cpu className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Describe your asset (e.g. 'Golden crown with rubies')..."
              className="flex-1 bg-transparent border-none outline-none text-white placeholder-zinc-600 px-4 py-3 text-base"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!prompt.trim() || isLoading}
              className={`
                flex items-center justify-center gap-2 px-6 py-3 rounded font-bold uppercase tracking-wider transition-all duration-200
                ${!prompt.trim() || isLoading 
                  ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' 
                  : 'bg-cyan-500 text-white hover:bg-cyan-400 active:scale-95 shadow-lg shadow-cyan-500/20'}
              `}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Forging...</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline text-sm">Forge</span>
                  <Zap className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
          <div className="flex items-center gap-4 px-4 py-2 border-t border-white/5 bg-zinc-950/50 flex-wrap">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-zinc-500" />
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Resolution:</span>
              {Object.values(Resolution).map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => onResolutionChange(res)}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    resolution === res 
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
            
            <div className="w-px h-4 bg-white/10 hidden sm:block"></div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Source:</span>
              <div className="flex bg-zinc-900 rounded p-0.5 border border-white/5">
                <button
                  type="button"
                  onClick={() => onModelSourceChange(ModelSource.GEMINI)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                    modelSource === ModelSource.GEMINI 
                      ? 'bg-cyan-500 text-white' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  Gemini
                </button>
                <button
                  type="button"
                  onClick={() => onModelSourceChange(ModelSource.LOCAL)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                    modelSource === ModelSource.LOCAL 
                      ? 'bg-cyan-500 text-white' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Monitor className="w-3 h-3" />
                  Local
                </button>
              </div>
            </div>

            <div className="w-px h-4 bg-white/10 hidden sm:block"></div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Model:</span>
              {modelSource === ModelSource.GEMINI ? (
                <select
                  value={model}
                  onChange={(e) => onModelChange(e.target.value as AIModel)}
                  className="bg-zinc-900 border border-white/10 text-zinc-300 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500/50 transition-all cursor-pointer"
                >
                  {Object.values(AIModel).map((m) => (
                    <option key={m} value={m}>{MODEL_DISPLAY_NAMES[m]}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedLocalModelId}
                    onChange={(e) => onSelectedLocalModelIdChange(e.target.value)}
                    className="bg-zinc-900 border border-white/10 text-zinc-300 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500/50 transition-all cursor-pointer min-w-[120px]"
                    disabled={localModels.length === 0}
                  >
                    {localModels.length === 0 ? (
                      <option value="">No models fetched</option>
                    ) : (
                      localModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels}
                    className="p-1.5 bg-zinc-900 border border-white/10 rounded hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-all"
                    title="Fetch models from LM Studio"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
            </div>

            {modelSource === ModelSource.LOCAL && (
              <>
                <div className="w-px h-4 bg-white/10 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">URL:</span>
                  <input
                    type="text"
                    value={lmStudioUrl}
                    onChange={(e) => onLmStudioUrlChange(e.target.value)}
                    placeholder="http://localhost:1234"
                    className="bg-zinc-900 border border-white/10 text-zinc-300 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500/50 transition-all w-32"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </form>
      
      {/* Quick suggestions */}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onPromptChange(suggestion)}
            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 bg-zinc-900 border border-white/5 rounded hover:bg-zinc-800 hover:text-cyan-400 hover:border-cyan-500/50 transition-all"
            disabled={isLoading}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
};
