
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { Grid3X3, Sparkles } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="w-full py-4 px-4 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-lg shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
            <Grid3X3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tighter uppercase italic">PixelCraft AI</h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono border border-white/5 uppercase">64x64 Mode</span>
              <p className="text-[10px] text-zinc-500 font-medium flex items-center gap-1">
                Gemini 3 Pro <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <a 
            href="https://ai.google.dev/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hidden sm:block text-xs font-semibold text-zinc-500 hover:text-cyan-400 transition-colors tracking-widest uppercase"
          >
            Engine Docs
          </a>
        </div>
      </div>
    </header>
  );
};
