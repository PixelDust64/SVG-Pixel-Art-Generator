import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  RefreshCw,
  Grid,
  Columns,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import {
  Resolution,
  GenerationStatus,
  BatchItem,
  GeneratedSvg,
  ModelSource,
  LocalModel
} from '../types';
import {
  generateSvgFromPrompt,
  generateSvgFromLocalModel,
  generateSvgFromBeaverNet
} from '../services/geminiService';
import { generateUUID } from '../utils/uuid';
import {
  exportBatchCompareSheet,
  exportBatchSpriteSheet,
  exportPngFile,
  exportSvgFile
} from '../utils/exporter';

interface BatchSectionProps {
  modelSource: ModelSource;
  lmStudioUrl: string;
  modelsBySource: Record<ModelSource, LocalModel[]>;
  selectedModelBySource: Record<ModelSource, string>;
  onRefreshModelsForSource: (source: ModelSource) => Promise<void>;
  items: BatchItem[];
  onItemsChange: React.Dispatch<React.SetStateAction<BatchItem[]>>;
}

export const BatchSection: React.FC<BatchSectionProps> = ({
  modelSource,
  lmStudioUrl,
  modelsBySource,
  selectedModelBySource,
  onRefreshModelsForSource,
  items,
  onItemsChange
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isExportingSheet, setIsExportingSheet] = useState(false);
  const [isExportingCompare, setIsExportingCompare] = useState(false);

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    try {
      await onRefreshModelsForSource(modelSource);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const addRow = () => {
    const defaultSource = modelSource;
    const defaultModel = selectedModelBySource[defaultSource] || modelsBySource[defaultSource]?.[0]?.id || '';
    onItemsChange((prev) => [
      ...prev,
      {
        id: generateUUID(),
        prompt: '',
        source: defaultSource,
        model: defaultModel,
        localModelId: defaultModel,
        resolution: prev.length > 0 ? prev[prev.length - 1].resolution : Resolution.R64x64,
        status: GenerationStatus.IDLE
      }
    ]);
  };

  const removeRow = (id: string) => {
    if (items.length <= 1) return;
    onItemsChange((prev) => prev.filter((item) => item.id !== id));
  };

  const updateRow = (id: string, updates: Partial<BatchItem>) => {
    onItemsChange((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const runBatch = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    const pendingItems = items.filter((item) => item.status !== GenerationStatus.SUCCESS);

    for (const item of pendingItems) {
      if (!item.prompt.trim()) continue;

      updateRow(item.id, { status: GenerationStatus.LOADING });

      try {
        let result;
        if (item.source === ModelSource.GEMINI) {
          const targetModel = item.model || selectedModelBySource[ModelSource.GEMINI];
          if (!targetModel) throw new Error('Nenhum modelo Gemini selecionado.');
          result = await generateSvgFromPrompt(item.prompt, item.resolution, targetModel);
        } else if (item.source === ModelSource.BEAVERNET) {
          const targetModel = item.localModelId || item.model || selectedModelBySource[ModelSource.BEAVERNET];
          if (!targetModel) throw new Error('Nenhum modelo BeaverNet selecionado.');
          result = await generateSvgFromBeaverNet(item.prompt, item.resolution, targetModel);
        } else {
          const targetModel = item.localModelId || selectedModelBySource[ModelSource.LOCAL];
          if (!targetModel) throw new Error('Nenhum modelo Local selecionado.');
          result = await generateSvgFromLocalModel(
            item.prompt,
            item.resolution,
            lmStudioUrl,
            targetModel
          );
        }

        const newSvg: GeneratedSvg = {
          id: generateUUID(),
          content: result.content,
          prompt: item.prompt,
          timestamp: Date.now(),
          resolution: item.resolution,
          generationTime: result.generationTime,
          tokenCount: result.tokenCount,
          origin: result.origin,
          checkReport: result.checkReport,
          palette: result.palette
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

  const handleExportSpriteSheet = async () => {
    if (isExportingSheet) return;
    setIsExportingSheet(true);
    try {
      await exportBatchSpriteSheet(items, 'pixelcraft_spritesheet');
    } catch (err: any) {
      alert(err.message || 'Failed to export Sprite Sheet.');
    } finally {
      setIsExportingSheet(false);
    }
  };

  const handleExportCompareSheet = async () => {
    if (isExportingCompare) return;
    setIsExportingCompare(true);
    try {
      await exportBatchCompareSheet(items, 'pixelcraft_compare');
    } catch (err: any) {
      alert(err.message || 'Failed to export Compare Sheet.');
    } finally {
      setIsExportingCompare(false);
    }
  };

  const completedCount = items.filter((i) => i.result && i.status === GenerationStatus.SUCCESS).length;

  return (
    <div className="max-w-6xl mx-auto px-4 mt-8">
      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm shadow-2xl">
        <div className="p-6 border-b border-white/5 flex flex-wrap justify-between items-center gap-4 bg-zinc-900/80">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Batch Generation</h3>
            <p className="text-zinc-400 text-sm mt-1">
              Queue multiple assets for sequential rendering and export game-ready sheets
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {completedCount > 0 && (
              <>
                <button
                  onClick={handleExportSpriteSheet}
                  disabled={isExportingSheet || isGenerating}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  title="Pack all completed items into a transparent PNG grid + Aseprite JSON"
                >
                  {isExportingSheet ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Grid className="w-4 h-4" />
                  )}
                  <span>Export Sprite Sheet (.png + .json)</span>
                </button>
                <button
                  onClick={handleExportCompareSheet}
                  disabled={isExportingCompare || isGenerating}
                  className="flex items-center gap-2 px-3.5 py-2 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  title="Generate a dark-background contact sheet comparing all items side by side"
                >
                  {isExportingCompare ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Columns className="w-4 h-4" />
                  )}
                  <span>Export Compare Sheet (.png)</span>
                </button>
              </>
            )}

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
              disabled={
                isGenerating ||
                !items.some((i) => i.prompt.trim() && i.status !== GenerationStatus.SUCCESS)
              }
              className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all
                ${
                  isGenerating
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-cyan-500 text-white hover:bg-cyan-400 shadow-lg shadow-cyan-500/20 active:scale-95'
                }
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
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">
                  Prompt
                </th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">
                  Model
                </th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">
                  Resolution
                </th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5 w-40 text-center">
                  Status / Check
                </th>
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
                        onChange={(e) => {
                          const nextSource = e.target.value as ModelSource;
                          const nextList = modelsBySource[nextSource] || [];
                          const nextModelId = selectedModelBySource[nextSource] || nextList[0]?.id || '';
                          updateRow(item.id, {
                            source: nextSource,
                            model: nextModelId,
                            localModelId: nextModelId
                          });
                          if (nextList.length === 0) {
                            onRefreshModelsForSource(nextSource);
                          }
                        }}
                        className="bg-zinc-900 border border-white/10 text-zinc-400 text-[10px] rounded px-1.5 py-0.5 outline-none focus:border-cyan-500/50 transition-all cursor-pointer w-fit"
                        disabled={isGenerating || item.status === GenerationStatus.SUCCESS}
                      >
                        <option value={ModelSource.LOCAL}>OpenAI / Local</option>
                        <option value={ModelSource.BEAVERNET}>BeaverNet</option>
                        <option value={ModelSource.GEMINI}>Gemini</option>
                      </select>

                      {(() => {
                        const rowModels = modelsBySource[item.source] || [];
                        const currentVal =
                          item.source === ModelSource.GEMINI ? item.model : item.localModelId;
                        return (
                          <select
                            value={currentVal}
                            onChange={(e) =>
                              updateRow(item.id, {
                                model: e.target.value,
                                localModelId: e.target.value
                              })
                            }
                            className="bg-zinc-900 border border-white/10 text-zinc-400 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500/50 transition-all cursor-pointer min-w-[120px] max-w-[200px]"
                            disabled={
                              isGenerating ||
                              item.status === GenerationStatus.SUCCESS ||
                              rowModels.length === 0
                            }
                          >
                            {rowModels.length === 0 ? (
                              <option value="">Nenhum modelo</option>
                            ) : (
                              rowModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))
                            )}
                          </select>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={item.resolution}
                      onChange={(e) =>
                        updateRow(item.id, { resolution: e.target.value as Resolution })
                      }
                      className="bg-zinc-900 border border-white/10 text-zinc-400 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500/50 transition-all cursor-pointer"
                      disabled={isGenerating || item.status === GenerationStatus.SUCCESS}
                    >
                      {Object.values(Resolution).map((res) => (
                        <option key={res} value={res}>
                          {res}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center items-center gap-2">
                      {item.status === GenerationStatus.IDLE && (
                        <span className="w-2 h-2 rounded-full bg-zinc-800" />
                      )}
                      {item.status === GenerationStatus.LOADING && (
                        <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                      )}
                      {item.status === GenerationStatus.SUCCESS && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          {item.result?.checkReport && (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                item.result.checkReport.warnings.length > 0
                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              }`}
                              title={
                                item.result.checkReport.warnings.join('; ') || 'Passed all checks'
                              }
                            >
                              {item.result.checkReport.warnings.length > 0
                                ? `${item.result.checkReport.warnings.length}W`
                                : 'OK'}
                            </span>
                          )}
                          <button
                            onClick={() =>
                              item.result && exportSvgFile(item.result.content, item.prompt)
                            }
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
        {items
          .filter((i) => i.result)
          .map((item) => {
            const report = item.result?.checkReport;
            return (
              <div
                key={item.id}
                className="group relative bg-zinc-900 border border-white/5 rounded-xl aspect-square overflow-hidden hover:border-cyan-500/30 transition-all"
              >
                <div
                  className="w-full h-full p-2 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: item.result?.content || '' }}
                  style={{ imageRendering: 'pixelated', backgroundColor: '#0c0b10' }}
                />

                {/* Top Check Badge */}
                {report && (
                  <div className="absolute top-2 left-2 z-10 pointer-events-none">
                    {report.warnings.length > 0 ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/80 text-amber-300 border border-amber-500/30 text-[9px] font-mono">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {report.uniqueColors}c
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/80 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        {report.uniqueColors}c
                      </span>
                    )}
                  </div>
                )}

                {/* Hover Download Overlay */}
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() =>
                      item.result && exportSvgFile(item.result.content, item.prompt)
                    }
                    className="px-2.5 py-1.5 bg-zinc-800 text-zinc-200 border border-white/10 rounded text-[10px] font-bold uppercase hover:bg-zinc-700 transition-all shadow-xl"
                    title="Download SVG"
                  >
                    SVG
                  </button>
                  <button
                    onClick={() =>
                      item.result &&
                      exportPngFile(item.result.content, 8, item.prompt, {
                        resolution: item.resolution,
                        applyEdgeFade: true
                      })
                    }
                    className="px-2.5 py-1.5 bg-cyan-500 text-black rounded text-[10px] font-bold uppercase hover:bg-cyan-400 transition-all shadow-xl"
                    title="Download 8x PNG"
                  >
                    PNG 8x
                  </button>
                </div>

                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
                  <p className="text-[10px] text-white font-medium truncate">{item.prompt}</p>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
