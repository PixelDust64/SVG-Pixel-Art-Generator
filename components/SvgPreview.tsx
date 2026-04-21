
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef } from 'react';
import { Download, CheckCircle2, Code, Share2 } from 'lucide-react';
import { GeneratedSvg } from '../types';

interface SvgPreviewProps {
  data: GeneratedSvg | null;
}

export const SvgPreview: React.FC<SvgPreviewProps> = ({ data }) => {
  const [copied, setCopied] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCopied(false);
  }, [data]);

  if (!data) return null;

  const handleDownload = () => {
    const blob = new Blob([data.content], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pixelcraft-${data.id}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-zinc-900 border border-white/10 rounded shadow-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-950 border-b border-white/10">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
            <h3 className="text-xs font-bold text-zinc-400 truncate uppercase tracking-widest">
              ASSET_RENDER: <span className="text-white italic">"{data.prompt}"</span>
            </h3>
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleCopyCode}
              className="p-2 text-zinc-500 hover:text-cyan-400 hover:bg-white/5 rounded transition-colors"
              title="Copy Code"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Code className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1 text-xs font-bold text-black bg-cyan-400 rounded hover:bg-cyan-300 transition-colors uppercase tracking-tight"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="relative p-12 flex items-center justify-center bg-zinc-950 min-h-[450px]">
           {/* Transparency Checkerboard */}
           <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                style={{ 
                  backgroundImage: `conic-gradient(#fff 90deg, #000 90deg 180deg, #fff 180deg 270deg, #000 270deg)`,
                  backgroundSize: '20px 20px'
                }}>
           </div>
           
           <div 
             ref={containerRef}
             className="relative z-10 w-full max-w-[448px] aspect-square transition-all duration-300 transform group"
             style={{ imageRendering: 'pixelated' }}
             dangerouslySetInnerHTML={{ __html: data.content }} 
           />
           
           {/* Pixel Info Overlay */}
           <div className="absolute bottom-4 right-4 text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
             Render Size: 512px / Source: 64x64px
           </div>
        </div>
        
        {/* Metadata Footer */}
        <div className="px-4 py-1.5 bg-zinc-950 border-t border-white/5 flex justify-between items-center">
          <div className="flex gap-4">
             <span className="text-[10px] text-zinc-600 font-mono">ID: {data.id.slice(0, 8)}</span>
             <span className="text-[10px] text-zinc-600 font-mono italic">MIME: IMAGE/SVG+XML</span>
          </div>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">Powered by Gemini Engine</span>
        </div>
      </div>
    </div>
  );
};
