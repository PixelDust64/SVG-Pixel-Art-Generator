
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { SvgPreview } from './components/SvgPreview';
import { BatchSection } from './components/BatchSection';
import { generateSvgFromPrompt, generateSvgFromLocalModel } from './services/geminiService';
import { GeneratedSvg, GenerationStatus, ApiError, Resolution, AIModel, ModelSource, LocalModel } from './types';
import { AlertCircle, Layout, Layers } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [currentSvg, setCurrentSvg] = useState<GeneratedSvg | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [prompt, setPrompt] = useState('');
  const [resolution, setResolution] = useState<Resolution>(Resolution.R64x64);
  const [model, setModel] = useState<AIModel>(AIModel.GEMINI_3_PRO);
  
  // Batch State
  const [batchItems, setBatchItems] = useState<BatchItem[]>([
    {
      id: crypto.randomUUID(),
      prompt: '',
      source: ModelSource.GEMINI,
      model: AIModel.GEMINI_3_PRO,
      localModelId: '',
      resolution: Resolution.R64x64,
      status: GenerationStatus.IDLE
    }
  ]);
  
  // Local Model State
  const [modelSource, setModelSource] = useState<ModelSource>(ModelSource.GEMINI);
  const [lmStudioUrl, setLmStudioUrl] = useState('http://localhost:1234');
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [selectedLocalModelId, setSelectedLocalModelId] = useState('');

  const handleGenerate = async (prompt: string, selectedResolution: Resolution, selectedModel: AIModel) => {
    setStatus(GenerationStatus.LOADING);
    setError(null);
    setCurrentSvg(null);

    try {
      let result;
      
      if (modelSource === ModelSource.GEMINI) {
        result = await generateSvgFromPrompt(prompt, selectedResolution, selectedModel);
      } else {
        if (!selectedLocalModelId) throw new Error("Please select a local model first.");
        result = await generateSvgFromLocalModel(prompt, selectedResolution, lmStudioUrl, selectedLocalModelId);
      }
      
      const newSvg: GeneratedSvg = {
        id: crypto.randomUUID(),
        content: result.content,
        prompt: prompt,
        timestamp: Date.now(),
        generationTime: result.generationTime,
        tokenCount: result.tokenCount,
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
      <Header 
        resolution={resolution} 
        model={model} 
        modelSource={modelSource}
        localModelId={selectedLocalModelId}
      />
      
      <main className="pb-20 pt-8">
        <div className="max-w-2xl mx-auto flex justify-center mb-8">
           <div className="inline-flex bg-zinc-900 border border-white/5 rounded-xl p-1 shadow-lg shadow-black/40">
              <button
                onClick={() => setActiveTab('single')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'single' ? 'bg-zinc-800 text-white shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <Layout className="w-4 h-4" />
                Single Asset
              </button>
              <button
                onClick={() => setActiveTab('batch')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'batch' ? 'bg-zinc-800 text-white shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <Layers className="w-4 h-4" />
                Batch Generation
              </button>
           </div>
        </div>

        {activeTab === 'single' ? (
          <>
            <InputSection 
              onGenerate={handleGenerate} 
              status={status} 
              prompt={prompt}
              onPromptChange={setPrompt}
              resolution={resolution}
              onResolutionChange={setResolution}
              model={model}
              onModelChange={setModel}
              
              modelSource={modelSource}
              onModelSourceChange={setModelSource}
              lmStudioUrl={lmStudioUrl}
              onLmStudioUrlChange={setLmStudioUrl}
              localModels={localModels}
              onLocalModelsChange={setLocalModels}
              selectedLocalModelId={selectedLocalModelId}
              onSelectedLocalModelIdChange={setSelectedLocalModelId}
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
              <SvgPreview 
                data={currentSvg} 
              />
            )}
            
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
          </>
        ) : (
          <BatchSection 
            modelSource={modelSource}
            lmStudioUrl={lmStudioUrl}
            localModels={localModels}
            selectedLocalModelId={selectedLocalModelId}
            onLocalModelsChange={setLocalModels}
            onSelectedLocalModelIdChange={setSelectedLocalModelId}
            items={batchItems}
            onItemsChange={setBatchItems}
          />
        )}
      </main>
    </div>
  );
};

export default App;
