
import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Play, Loader2, CheckCircle, AlertCircle, Download, RefreshCw } from 'lucide-react';
import { AIModel, Resolution, GenerationStatus, BatchItem, MODEL_DISPLAY_NAMES, GeneratedSvg, ModelSource, LocalModel } from '../types';
import { generateSvgFromPrompt, generateSvgFromLocalModel, fetchLocalModels } from '../services/geminiService';

interface BatchSectionProps {
  modelSource: ModelSource;
  lmStudioUrl: string;
  localModels: LocalModel[];
  selectedLocalModelId: string;
  onLocalModelsChange: (models: LocalModel[]) => void;
  onSelectedLocalModelIdChange: (id: string) => void;
  items: BatchItem[];
  onItemsChange: React.Dispatch<React.SetStateAction<BatchItem[]>>;
}

export const BatchSection: React.FC<BatchSectionProps> = ({
  modelSource,
  lmStudioUrl,
  localModels,
  selectedLocalModelId,
  onLocalModelsChange,
  onSelectedLocalModelIdChange,
  items,
  onItemsChange
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

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

  const addRow = () => {
    onItemsChange(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        prompt: '',
        source: modelSource,
        model: prev.length > 0 ? prev[prev.length - 1].model : AIModel.GEMINI_3_PRO,
        localModelId: selectedLocalModelId,
        resolution: prev.length > 0 ? prev[prev.length - 1].resolution : Resolution.R64x64,
        status: GenerationStatus.IDLE
      }
    ]);
  };

  const removeRow = (id: string) => {
    if (items.length <= 1) return;
    onItemsChange(prev => prev.filter(item => item.id !== id));
  };

  const updateRow = (id: string, updates: Partial<BatchItem>) => {
    onItemsChange(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const runBatch = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    const pendingItems = items.filter(item => item.status !== GenerationStatus.SUCCESS);
    
    for (const item of pendingItems) {
      if (!item.prompt.trim()) continue;

      updateRow(item.id, { status: GenerationStatus.LOADING });

      try {
        let result;
        if (item.source === ModelSource.GEMINI) {
          result = await generateSvgFromPrompt(item.prompt, item.resolution, item.model);
        } else {
          result = await generateSvgFromLocalModel(item.prompt, item.resolution, lmStudioUrl, item.localModelId);
        }
        
        const newSvg: GeneratedSvg = {
          id: crypto.randomUUID(),
          content: result.content,
          prompt: item.prompt,
          timestamp: Date.now(),
          generationTime: result.generationTime,
          tokenCount: result.tokenCount,
        };

        updateRow(item.id, { 
          status: GenerationStatus.SUCCESS,
          result: newSvg
        });
      } catch (error) {
        console.error(`Failed to generate ${item.prompt}:`, error);
        updateRow(item.id, { status: GenerationStatus.ERROR });
      }
    }

    setIsGenerating(false);
  };

  const downloadSvg = (content: string, name: string) => {
    const blob = new Blob([content], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/\s+/g, '_').toLowerCase()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 mt-8">
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-900/80">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Batch Generation</h3>
            <p className="text-zinc-400 text-sm mt-1">Queue multiple assets for sequential rendering</p>
          </div>
          <div className="flex gap-3">
             <button
              onClick={handleFetchModels}
              disabled={isFetchingModels || isGenerating}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-cyan-400 rounded-lg text-sm font-medium transition-all"
              title="Fetch models from LM Studio"
            >
              <RefreshCw className={`w-4 h-4 ${isFetchingModels ? 'animate-spin' : ''}`} />
            </button>
             <button
              onClick={addRow}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Row
            </button>
            <button
              onClick={runBatch}
              disabled={isGenerating || !items.some(i => i.prompt.trim() && i.status !== GenerationStatus.SUCCESS)}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all
                ${isGenerating 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                  : 'bg-cyan-500 text-white hover:bg-cyan-400 shadow-lg shadow-cyan-500/20 active:scale-95'}
              `}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Start Batch
                </>
              )}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950/50">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">Prompt</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">Model</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">Resolution</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5 w-32 text-center">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((item) => (
                <tr key={item.id} className="group hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <input
                      type="text"
                      value={item.prompt}
                      onChange={(e) => updateRow(item.id, { prompt: e.target.value })}
                      placeholder="e.g. Flaming sword"
                      className="w-full bg-transparent border-none outline-none text-zinc-200 placeholder-zinc-700 text-sm py-1"
                      disabled={isGenerating || item.status === GenerationStatus.SUCCESS}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      <select
                        value={item.source}
                        onChange={(e) => updateRow(item.id, { source: e.target.value as ModelSource })}
                        className="bg-zinc-900 border border-white/10 text-zinc-400 text-[10px] rounded px-1.5 py-0.5 outline-none focus:border-cyan-500/50 transition-all cursor-pointer w-fit"
                        disabled={isGenerating || item.status === GenerationStatus.SUCCESS}
                      >
                        <option value={ModelSource.GEMINI}>Gemini</option>
                        <option value={ModelSource.LOCAL}>Local</option>
                      </select>
                      
                      {item.source === ModelSource.GEMINI ? (
                        <select
                          value={item.model}
                          onChange={(e) => updateRow(item.id, { model: e.target.value as AIModel })}
                          className="bg-zinc-900 border border-white/10 text-zinc-400 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500/50 transition-all cursor-pointer"
                          disabled={isGenerating || item.status === GenerationStatus.SUCCESS}
                        >
                          {Object.values(AIModel).map((m) => (
                            <option key={m} value={m}>{MODEL_DISPLAY_NAMES[m]}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={item.localModelId}
                          onChange={(e) => updateRow(item.id, { localModelId: e.target.value })}
                          className="bg-zinc-900 border border-white/10 text-zinc-400 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500/50 transition-all cursor-pointer min-w-[100px]"
                          disabled={isGenerating || item.status === GenerationStatus.SUCCESS || localModels.length === 0}
                        >
                          {localModels.length === 0 ? (
                            <option value="">No models</option>
                          ) : (
                            localModels.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))
                          )}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={item.resolution}
                      onChange={(e) => updateRow(item.id, { resolution: e.target.value as Resolution })}
                      className="bg-zinc-900 border border-white/10 text-zinc-400 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500/50 transition-all cursor-pointer"
                      disabled={isGenerating || item.status === GenerationStatus.SUCCESS}
                    >
                      {Object.values(Resolution).map((res) => (
                        <option key={res} value={res}>{res}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center">
                      {item.status === GenerationStatus.IDLE && (
                        <span className="w-2 h-2 rounded-full bg-zinc-800" />
                      )}
                      {item.status === GenerationStatus.LOADING && (
                        <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                      )}
                      {item.status === GenerationStatus.SUCCESS && (
                        <div className="flex items-center gap-2">
                           <CheckCircle className="w-4 h-4 text-emerald-500" />
                           <button 
                            onClick={() => item.result && downloadSvg(item.result.content, item.prompt)}
                            className="text-zinc-500 hover:text-zinc-300 transition-colors"
                            title="Download SVG"
                           >
                            <Download className="w-3.5 h-3.5" />
                           </button>
                        </div>
                      )}
                      {item.status === GenerationStatus.ERROR && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => removeRow(item.id)}
                      disabled={isGenerating || items.length <= 1}
                      className="text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {items.length === 0 && (
           <div className="p-12 text-center text-zinc-600">
              No items in queue. Click "Add Row" to start.
           </div>
        )}
      </div>

      {/* Batch Previews */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items.filter(i => i.result).map((item) => (
          <div key={item.id} className="group relative bg-zinc-900 border border-white/5 rounded-xl aspect-square overflow-hidden hover:border-cyan-500/30 transition-all">
             <div 
              className="w-full h-full p-2 flex items-center justify-center bg-[url('https://pixelcraft-ai.com/grid.png')] bg-repeat"
              dangerouslySetInnerHTML={{ __html: item.result?.content || '' }}
              style={{ imageRendering: 'pixelated' }}
             />
             
             {/* Hover Download Overlay */}
             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={() => item.result && downloadSvg(item.result.content, item.prompt)}
                  className="p-3 bg-cyan-500 text-white rounded-full hover:bg-cyan-400 transform scale-90 group-hover:scale-100 transition-all shadow-xl"
                  title="Download Asset"
                >
                  <Download className="w-5 h-5" />
                </button>
             </div>

             <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                <p className="text-[10px] text-white font-medium truncate">{item.prompt}</p>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};
