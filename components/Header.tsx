/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Grid3X3, Sparkles, BookOpen } from 'lucide-react';
import { Resolution, ModelSource } from '../types';

interface HeaderProps {
  resolution: Resolution;
  modelSource: ModelSource;
  activeModelId?: string;
  onOpenDocs: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  resolution,
  modelSource,
  activeModelId,
  onOpenDocs
}) => {
  const sourceLabel =
    modelSource === ModelSource.BEAVERNET
      ? 'BeaverNet'
      : modelSource === ModelSource.GEMINI
      ? 'Gemini'
      : 'Local';

  return (
    <header className="w-full py-4 px-4 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-lg shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
            <Grid3X3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tighter uppercase italic">
              PixelCraft AI
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono border border-white/5 uppercase">
                {resolution} Mode
              </span>
              <p className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                <span className="text-cyan-400 font-bold uppercase">{sourceLabel}:</span>
                <span className="truncate max-w-[180px]" title={activeModelId || 'Nenhum modelo carregado'}>
                  {activeModelId || 'Nenhum modelo selecionado'}
                </span>
                <Sparkles className="w-2.5 h-2.5 text-cyan-400 flex-shrink-0" />
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenDocs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-cyan-500/40 text-xs font-semibold text-zinc-300 hover:text-cyan-400 transition-all tracking-widest uppercase"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Engine Docs</span>
          </button>
        </div>
      </div>
    </header>
  );
};
