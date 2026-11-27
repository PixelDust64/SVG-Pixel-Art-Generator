/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  Wand2,
  Upload,
  Plus,
  Trash2,
  FileCode,
  Loader2,
  Monitor,
  Globe,
  Server,
  RefreshCw,
  Sparkles,
  Info
} from 'lucide-react';
import {
  GeneratedSvg,
  GenerationStatus,
  InputSvgFile,
  LocalModel,
  ModelSource,
  Resolution
} from '../types';
import {
  BEAVERNET_OPENAI_BASE_URL,
  editSvgWithBeaverNet,
  editSvgWithLocalModel,
  editSvgWithPrompt
} from '../services/geminiService';
import { generateUUID } from '../utils/uuid';
import { getSvgDimensions } from '../utils/rasterizer';

interface EditSectionProps {
  onSuccess: (result: GeneratedSvg) => void;
  status: GenerationStatus;
  setStatus: (status: GenerationStatus) => void;
  error: string | null;
  setError: (err: string | null) => void;

  // Shared model configurations (dynamically queried — never baked!)
  modelSource: ModelSource;
  onModelSourceChange: (source: ModelSource) => void;
  lmStudioUrl: string;
  onLmStudioUrlChange: (url: string) => void;
  availableModels: LocalModel[];
  selectedModelId: string;
  onSelectedModelIdChange: (id: string) => void;
  isFetchingModels: boolean;
  onRefreshModels: () => void;
  modelsError?: string | null;
  onOpenDocs: () => void;

  // Optional chained SVG result to add
  currentResultSvg?: GeneratedSvg | null;
}

export const EditSection: React.FC<EditSectionProps> = ({
  onSuccess,
  status,
  setStatus,
  error,
  setError,
  modelSource,
  onModelSourceChange,
  lmStudioUrl,
  onLmStudioUrlChange,
  availableModels,
  selectedModelId,
  onSelectedModelIdChange,
  isFetchingModels,
  onRefreshModels,
  modelsError,
  onOpenDocs,
  currentResultSvg
}) => {
  const [inputSvgs, setInputSvgs] = useState<InputSvgFile[]>([]);
  const [instruction, setInstruction] = useState('');
  const [targetResolution, setTargetResolution] = useState<string>('auto');
  const [isDragging, setIsDragging] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pastedSvgCode, setPastedSvgCode] = useState('');
  const [pastedSvgName, setPastedSvgName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = status === GenerationStatus.LOADING;

  const extractSvgInfo = (content: string, fallbackName: string): InputSvgFile => {
    const [w, h] = getSvgDimensions(content);
    return {
      id: generateUUID(),
      name: fallbackName,
      content,
      width: w,
      height: h
    };
  };

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === 'string' && text.includes('<svg')) {
          setInputSvgs((prev) => [...prev, extractSvgInfo(text, file.name.replace(/\.svg$/i, ''))]);
        }
      };
      reader.readAsText(file);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handlePasteAdd = () => {
    if (!pastedSvgCode.trim() || !pastedSvgCode.includes('<svg')) {
      alert('Por favor cole um código SVG válido contendo a tag <svg>');
      return;
    }
    const name = pastedSvgName.trim() || `SVG ${inputSvgs.length + 1}`;
    setInputSvgs((prev) => [...prev, extractSvgInfo(pastedSvgCode.trim(), name)]);
    setPastedSvgCode('');
    setPastedSvgName('');
    setPasteModalOpen(false);
  };

  const handleAddCurrentResult = () => {
    if (!currentResultSvg) return;
    const name = `Remix ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    setInputSvgs((prev) => [...prev, extractSvgInfo(currentResultSvg.content, name)]);
  };

  const handleRemoveSvg = (id: string) => {
    setInputSvgs((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputSvgs.length === 0) {
      setError('Adicione pelo menos um arquivo SVG de referência para editar.');
      return;
    }
    if (!instruction.trim()) {
      setError('Insira as instruções de edição ou modificação desejadas.');
      return;
    }
    if (!selectedModelId) {
      setError('Nenhum modelo carregado. Consulte os modelos disponíveis ou configure a chave em Engine Docs.');
      return;
    }

    setStatus(GenerationStatus.LOADING);
    setError(null);

    try {
      const chosenRes = targetResolution === 'auto' ? undefined : (targetResolution as Resolution);
      const svgsPayload = inputSvgs.map((s) => ({ name: s.name, content: s.content }));

      let result;
      if (modelSource === ModelSource.GEMINI) {
        result = await editSvgWithPrompt(instruction.trim(), svgsPayload, chosenRes, selectedModelId);
      } else if (modelSource === ModelSource.BEAVERNET) {
        result = await editSvgWithBeaverNet(instruction.trim(), svgsPayload, chosenRes, selectedModelId);
      } else {
        result = await editSvgWithLocalModel(
          instruction.trim(),
          svgsPayload,
          chosenRes,
          lmStudioUrl,
          selectedModelId
        );
      }

      const generated: GeneratedSvg = {
        id: generateUUID(),
        content: result.content,
        prompt: `[Remix] ${instruction.trim()}`,
        timestamp: Date.now(),
        resolution: chosenRes,
        generationTime: result.generationTime,
        tokenCount: result.tokenCount,
        origin: result.origin,
        checkReport: result.checkReport,
        palette: result.palette
      };

      onSuccess(generated);
      setStatus(GenerationStatus.SUCCESS);
    } catch (err: any) {
      setStatus(GenerationStatus.ERROR);
      setError(err?.message || 'Falha ao processar edição do SVG.');
    }
  };

  const editPromptPresets = [
    { label: '🔥 Tema Fogo / Lava', prompt: 'Mude as cores para tons quentes de fogo e adicione chamas de pixel ardentes.' },
    { label: '🗡️ Adicionar Espada & Escudo', prompt: 'Adicione uma espada brilhante e um escudo estilizado combinando com o design.' },
    { label: '👑 Versão Dourada / Realeza', prompt: 'Transforme o item em uma versão lendária dourada com gemas e coroa reluzente.' },
    { label: '❄️ Tema Gelo / Cristalino', prompt: 'Recolora com tons de ciano/azul gelo e adicione cristais brilhantes pontiagudos.' },
    { label: '⚔️ Pose de Ataque', prompt: 'Recrie o personagem em uma pose dinâmica de ataque, empunhando a arma para a frente.' },
    { label: '💔 Pose de Dano / Impacto', prompt: 'Crie a animação/pose do personagem sendo atingido por dano com recuo.' }
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <Wand2 className="w-3.5 h-3.5" />
          Remix & Modificação Livre
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2 uppercase italic">
          Editar & Remixar SVGs
        </h2>
        <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto">
          Envie um ou mais SVGs existentes e peça alterações, novas poses, fusões ou trocas de tema sem limite fixo de tamanho.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Upload / Reference Area */}
        <div className="bg-zinc-900/90 rounded-2xl border border-white/10 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-400" />
              SVGs de Entrada ({inputSvgs.length})
            </label>
            <div className="flex items-center gap-2">
              {currentResultSvg && (
                <button
                  type="button"
                  onClick={handleAddCurrentResult}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg transition-all"
                  title="Usa o SVG gerado anteriormente como entrada"
                >
                  <Sparkles className="w-3 h-3" />
                  Usar Último Resultado
                </button>
              )}
              <button
                type="button"
                onClick={() => setPasteModalOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/5 rounded-lg transition-all"
              >
                <Plus className="w-3 h-3" />
                Colar Código SVG
              </button>
            </div>
          </div>

          {/* SVG Cards Grid */}
          {inputSvgs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {inputSvgs.map((svg, idx) => (
                <div
                  key={svg.id}
                  className="relative group bg-zinc-950/80 border border-white/10 rounded-xl p-3 flex flex-col justify-between hover:border-cyan-500/40 transition-all shadow-md"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-300 truncate max-w-[140px]" title={svg.name}>
                      {svg.name || `SVG #${idx + 1}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSvg(svg.id)}
                      className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                      title="Remover SVG"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Thumbnail Preview */}
                  <div className="w-full h-28 bg-zinc-900/60 rounded-lg flex items-center justify-center p-2 overflow-hidden border border-white/5 relative">
                    <div
                      className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:object-contain"
                      dangerouslySetInnerHTML={{ __html: svg.content }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-mono bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-300">
                      {svg.width}x{svg.height} px
                    </span>
                    <span className="text-zinc-500 text-[10px]">SVG #{idx + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-all ${
              isDragging
                ? 'border-cyan-500 bg-cyan-500/10'
                : 'border-zinc-700/60 hover:border-zinc-500 bg-zinc-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              multiple
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-medium text-zinc-300">
              Arraste e solte arquivos <span className="text-cyan-400">.svg</span> aqui ou clique para selecionar
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Você pode adicionar vários SVGs para fazer fusão ou usar como base de estilo
            </p>
          </div>
        </div>

        {/* Prompt / Instruction Area */}
        <div className="bg-zinc-900/90 rounded-2xl border border-white/10 p-5 shadow-xl space-y-4">
          <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            O que você deseja alterar ou remixar?
          </label>

          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Exemplo: Mude a espada para um machado de batalha flamejante com chamas de pixel, e mantenha o resto do corpo inalterado..."
            rows={3}
            disabled={isLoading}
            className="w-full bg-zinc-950/80 border border-white/10 rounded-xl p-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-500/60 transition-all resize-y"
          />

          {/* Quick Idea Chips */}
          <div>
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
              Sugestões rápidas de edição:
            </span>
            <div className="flex flex-wrap gap-2">
              {editPromptPresets.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInstruction(item.prompt)}
                  disabled={isLoading}
                  className="px-2.5 py-1 text-xs rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-white/5 transition-all text-left"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Configuration Bar: Resolution & Model */}
        <div className="bg-zinc-900/90 rounded-2xl border border-white/10 p-5 shadow-xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Resolution Selector */}
            <div>
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block mb-2">
                Resolução Alvo
              </label>
              <select
                value={targetResolution}
                onChange={(e) => setTargetResolution(e.target.value)}
                disabled={isLoading}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-cyan-500/60"
              >
                <option value="auto">Auto (Preservar viewBox original do SVG)</option>
                <option value={Resolution.R64x64}>64x64 (Quadrado Padrão)</option>
                <option value={Resolution.R64x128}>64x128 (Alto / Personagem)</option>
                <option value={Resolution.R128x64}>128x64 (Largo / Cenário)</option>
              </select>
              <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3 flex-shrink-0" />
                "Auto" mantém as proporções e dimensões dos arquivos fornecidos.
              </p>
            </div>

            {/* Model Engine Selector */}
            <div>
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block mb-2">
                Motor de IA
              </label>
              <div className="flex bg-zinc-950 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => onModelSourceChange(ModelSource.LOCAL)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    modelSource === ModelSource.LOCAL
                      ? 'bg-cyan-500 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  Local
                </button>
                <button
                  type="button"
                  onClick={() => onModelSourceChange(ModelSource.BEAVERNET)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    modelSource === ModelSource.BEAVERNET
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  BeaverNet
                </button>
                <button
                  type="button"
                  onClick={() => onModelSourceChange(ModelSource.GEMINI)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    modelSource === ModelSource.GEMINI
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Gemini
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Model Selection (zero baked names) */}
          <div className="pt-2 border-t border-white/5 space-y-3">
            {modelSource === ModelSource.LOCAL && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={lmStudioUrl}
                  onChange={(e) => onLmStudioUrlChange(e.target.value)}
                  placeholder="http://127.0.0.1:1234"
                  className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 outline-none"
                  disabled={isLoading}
                />
              </div>
            )}

            {modelSource === ModelSource.BEAVERNET && (
              <p className="text-[11px] text-emerald-400/80 font-mono">
                BeaverNet API: {BEAVERNET_OPENAI_BASE_URL}
              </p>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={selectedModelId}
                onChange={(e) => onSelectedModelIdChange(e.target.value)}
                disabled={isLoading || isFetchingModels || availableModels.length === 0}
                className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-300 outline-none focus:border-cyan-500/60"
              >
                {isFetchingModels ? (
                  <option value="">Consultando modelos disponíveis...</option>
                ) : availableModels.length === 0 ? (
                  <option value="">Nenhum modelo carregado (clique em Consultar)</option>
                ) : (
                  availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={onRefreshModels}
                disabled={isFetchingModels || isLoading}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition-all border border-white/5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} />
                Consultar Modelos
              </button>
            </div>

            {modelsError && (
              <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <span>{modelsError}</span>
                <button
                  type="button"
                  onClick={onOpenDocs}
                  className="underline font-bold text-cyan-400 hover:text-cyan-300 flex-shrink-0"
                >
                  Configurar Chave
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || inputSvgs.length === 0 || !instruction.trim() || !selectedModelId}
          className={`w-full py-4 rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 text-sm transition-all shadow-xl ${
            isLoading || inputSvgs.length === 0 || !instruction.trim() || !selectedModelId
              ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-white/5'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 active:scale-[0.99]'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processando Remix / Modificação...
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5" />
              Executar Modificação do SVG
            </>
          )}
        </button>
      </form>

      {/* Paste Code Modal */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileCode className="w-5 h-5 text-cyan-400" />
              Colar Código SVG
            </h3>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">Nome de Referência (opcional)</label>
              <input
                type="text"
                value={pastedSvgName}
                onChange={(e) => setPastedSvgName(e.target.value)}
                placeholder="Ex: Personagem Base, Espada 1..."
                className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">Conteúdo SVG</label>
              <textarea
                value={pastedSvgCode}
                onChange={(e) => setPastedSvgCode(e.target.value)}
                placeholder="<svg viewBox='0 0 64 64' ...>...</svg>"
                rows={8}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2.5 text-xs font-mono text-zinc-200 outline-none resize-y"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePasteAdd}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-white transition-colors"
              >
                Adicionar SVG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
