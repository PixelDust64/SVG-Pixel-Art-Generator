
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { SvgPreview } from './components/SvgPreview';
import { generateSvgFromPrompt } from './services/geminiService';
import { GeneratedSvg, GenerationStatus, ApiError } from './types';
import { AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [currentSvg, setCurrentSvg] = useState<GeneratedSvg | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const handleGenerate = async (prompt: string) => {
    setStatus(GenerationStatus.LOADING);
    setError(null);
    setCurrentSvg(null);

    try {
      const svgContent = await generateSvgFromPrompt(prompt);
      
      const newSvg: GeneratedSvg = {
        id: crypto.randomUUID(),
        content: svgContent,
        prompt: prompt,
        timestamp: Date.now()
      };
      
      setCurrentSvg(newSvg);
      setStatus(GenerationStatus.SUCCESS);
    } catch (err: any) {
      setStatus(GenerationStatus.ERROR);
      setError({
        message: "Pixelation Failed",
        details: err.message || "The engine encountered an error while rendering your pixels."
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-cyan-500/30">      
      <Header />
      <main className="pb-20 pt-8">
        <InputSection onGenerate={handleGenerate} status={status} />
        
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
          <SvgPreview 
            data={currentSvg} 
          />
        )}
        
        {/* Empty State / Placeholder */}
        {status === GenerationStatus.IDLE && (
          <div className="max-w-2xl mx-auto mt-16 text-center px-4 opacity-50 pointer-events-none select-none">
             <div className="inline-flex items-center justify-center w-32 h-32 rounded-xl bg-zinc-900/50 border border-white/5 mb-6 rotate-3">
                <svg className="w-16 h-16 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                   <path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4zM10 10h4v4h-4z" />
                </svg>
             </div>
             <p className="text-zinc-500 text-lg font-medium tracking-tight">Your 64x64 asset will appear here</p>
             <p className="text-zinc-600 text-sm mt-2">Try "Cyberpunk Sword" or "Health Potion"</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
