
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback } from 'react';
import { Cpu, Loader2, Zap } from 'lucide-react';
import { GenerationStatus } from '../types';

interface InputSectionProps {
  onGenerate: (prompt: string) => void;
  status: GenerationStatus;
}

export const InputSection: React.FC<InputSectionProps> = ({ onGenerate, status }) => {
  const [input, setInput] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status !== GenerationStatus.LOADING) {
      onGenerate(input.trim());
    }
  }, [input, status, onGenerate]);

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
          Describe an item, and PixelCraft will generate a sharp <span className="text-cyan-400 font-bold">64x64</span> SVG sprite.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl opacity-20 group-hover:opacity-30 transition duration-500 blur"></div>
        <div className="relative flex items-center bg-zinc-900/90 rounded-lg border border-white/10 shadow-2xl overflow-hidden p-1.5">
          <div className="pl-4 text-zinc-500">
            <Cpu className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your asset (e.g. 'Golden crown with rubies')..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-zinc-600 px-4 py-3 text-base"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`
              flex items-center justify-center gap-2 px-6 py-3 rounded font-bold uppercase tracking-wider transition-all duration-200
              ${!input.trim() || isLoading 
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
      </form>
      
      {/* Quick suggestions */}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => setInput(suggestion)}
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
