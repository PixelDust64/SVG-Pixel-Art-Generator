/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  CheckCircle2,
  Code,
  Palette,
  RotateCcw,
  Crosshair,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  Image as ImageIcon,
  Eye
} from 'lucide-react';
import { BackdropType, GeneratedSvg, Resolution } from '../types';
import { PRESET_PALETTES, extractPaletteFromSvg, recolorSvg } from '../utils/palettes';
import { checkAndSanitizeSvg } from '../utils/svgChecker';
import { exportPngFile, exportSvgFile } from '../utils/exporter';
import { getSvgDimensions, svgToImageData, upscale } from '../utils/rasterizer';

interface SvgPreviewProps {
  data: GeneratedSvg | null;
  onUpdateSvg?: (updated: GeneratedSvg) => void;
}

export const SvgPreview: React.FC<SvgPreviewProps> = ({ data, onUpdateSvg }) => {
  const [copied, setCopied] = useState(false);
  const [activePaletteId, setActivePaletteId] = useState<string>('original');
  const [recoloredContent, setRecoloredContent] = useState<string>('');
  const [backdrop, setBackdrop] = useState<BackdropType>('none');
  const [showOrigin, setShowOrigin] = useState<boolean>(true);
  const [edgeFadeEnabled, setEdgeFadeEnabled] = useState<boolean>(true);
  const [rasterPreviewUrl, setRasterPreviewUrl] = useState<string | null>(null);
  const [isExportingPng, setIsExportingPng] = useState<'1x' | '8x' | null>(null);

  useEffect(() => {
    setCopied(false);
    setActivePaletteId('original');
    setRecoloredContent(data?.content || '');
  }, [data?.id, data?.content]);

  const currentSvgContent = recoloredContent || data?.content || '';

  const checkResult = useMemo(() => {
    if (!currentSvgContent) return null;
    return checkAndSanitizeSvg(currentSvgContent, data?.resolution || Resolution.R64x64);
  }, [currentSvgContent, data?.resolution]);

  const [svgW, svgH] = useMemo(() => {
    if (!currentSvgContent) return [64, 64];
    return getSvgDimensions(currentSvgContent, data?.resolution);
  }, [currentSvgContent, data?.resolution]);

  const origin: [number, number] = useMemo(() => {
    if (data?.origin) return data.origin;
    if (checkResult?.origin) return checkResult.origin;
    return [Math.round(svgW / 2), svgH];
  }, [data?.origin, checkResult?.origin, svgW, svgH]);

  const currentPalette = useMemo(() => {
    if (!currentSvgContent) return [];
    return extractPaletteFromSvg(currentSvgContent);
  }, [currentSvgContent]);

  // Render live raster preview when edgeFade is active and SVG has light layer (or to preview exact pixel output)
  useEffect(() => {
    let cancelled = false;
    let currentUrl: string | null = null;

    if (!currentSvgContent || !edgeFadeEnabled) {
      setRasterPreviewUrl(null);
      return;
    }

    (async () => {
      try {
        const { data: rgba, width, height } = await svgToImageData(currentSvgContent, {
          resolution: data?.resolution,
          applyEdgeFade: true,
          backdrop: 'none'
        });
        if (cancelled) return;
        const k = 8;
        const scaled = upscale(rgba, width, height, k);
        const canvas = document.createElement('canvas');
        canvas.width = width * k;
        canvas.height = height * k;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(new ImageData(new Uint8ClampedArray(scaled), width * k, height * k), 0, 0);
          canvas.toBlob((blob) => {
            if (cancelled || !blob) return;
            currentUrl = URL.createObjectURL(blob);
            setRasterPreviewUrl(currentUrl);
          }, 'image/png');
        }
      } catch {
        if (!cancelled) setRasterPreviewUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [currentSvgContent, edgeFadeEnabled, data?.resolution]);

  if (!data) return null;

  const handleApplyPalette = (paletteId: string, colors?: string[]) => {
    setActivePaletteId(paletteId);
    if (paletteId === 'original' || !colors) {
      setRecoloredContent(data.content);
      return;
    }
    // Always recolor from original SVG so luminance order stays faithful
    const updated = recolorSvg(data.content, colors);
    setRecoloredContent(updated);
    if (onUpdateSvg) {
      onUpdateSvg({
        ...data,
        content: updated,
        palette: extractPaletteFromSvg(updated)
      });
    }
  };

  const handleDownloadSvg = () => {
    exportSvgFile(currentSvgContent, data.prompt || `pixelcraft-${data.id.slice(0, 8)}`);
  };

  const handleDownloadPng = async (scale: 1 | 8) => {
    const tag = scale === 1 ? '1x' : '8x';
    setIsExportingPng(tag);
    try {
      await exportPngFile(
        currentSvgContent,
        scale,
        data.prompt || `pixelcraft-${data.id.slice(0, 8)}`,
        {
          resolution: data.resolution,
          applyEdgeFade: edgeFadeEnabled,
          backdrop: 'none',
          horizonY: origin[1]
        }
      );
    } finally {
      setIsExportingPng(null);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentSvgContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const report = checkResult?.report || data.checkReport;
  const originLeftPct = Math.max(0, Math.min(100, (origin[0] / svgW) * 100));
  const originTopPct = Math.max(0, Math.min(100, (origin[1] / svgH) * 100));

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* Top Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-zinc-950 border-b border-white/10">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
            <h3 className="text-xs font-bold text-zinc-400 truncate uppercase tracking-widest">
              ASSET_RENDER: <span className="text-white italic">"{data.prompt}"</span>
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleCopyCode}
              className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-white/5 rounded transition-colors border border-white/5"
              title="Copy SVG Code"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Code className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownloadSvg}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded transition-colors uppercase tracking-tight"
              title="Download vector SVG"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>SVG</span>
            </button>
            <button
              onClick={() => handleDownloadPng(1)}
              disabled={isExportingPng !== null}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded transition-colors uppercase tracking-tight disabled:opacity-50"
              title={`Download native ${svgW}x${svgH} PNG (1x)`}
            >
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>PNG (1x)</span>
            </button>
            <button
              onClick={() => handleDownloadPng(8)}
              disabled={isExportingPng !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-black bg-cyan-400 hover:bg-cyan-300 rounded transition-colors uppercase tracking-tight disabled:opacity-50 shadow-sm shadow-cyan-500/20"
              title={`Download nearest-neighbour upscaled ${svgW * 8}x${svgH * 8} PNG (8x)`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>PNG Upscaled (8x)</span>
            </button>
          </div>
        </div>

        {/* Viewport Controls Bar (Backdrop, Edge Fade, Origin Crosshair) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-zinc-900/90 border-b border-white/5 text-xs">
          {/* Backdrop Selector */}
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Backdrop:</span>
            <div className="flex bg-zinc-950 rounded p-0.5 border border-white/5">
              {([
                { id: 'none', label: 'Checker' },
                { id: 'dark', label: 'Dark' },
                { id: 'ground', label: 'Game Ground' }
              ] as { id: BackdropType; label: string }[]).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBackdrop(b.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
                    backdrop === b.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Edge Fade & Pivot Toggles */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEdgeFadeEnabled((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase border transition-all ${
                edgeFadeEnabled
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
                  : 'bg-zinc-950 text-zinc-500 border-white/5 hover:text-zinc-300'
              }`}
              title="Cubic smoothstep attenuation on outer E=8 pixels to prevent sharp box clipping"
            >
              <Sparkles className="w-3 h-3" />
              <span>Edge Fade (E=8)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowOrigin((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase border transition-all ${
                showOrigin
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-zinc-950 text-zinc-500 border-white/5 hover:text-zinc-300'
              }`}
              title="Toggle sprite anchor/pivot marker (data-origin-x, data-origin-y)"
            >
              <Crosshair className="w-3 h-3" />
              <span>Pivot ({origin[0]}, {origin[1]})</span>
            </button>
          </div>
        </div>

        {/* Dynamic Palette Recoloring Bar */}
        <div className="px-4 py-2.5 bg-zinc-950/60 border-b border-white/5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Dynamic Palette Ramp ({currentPalette.length} colors):
              </span>
              {/* Extracted Luminance-Sorted Swatches */}
              <div className="flex items-center gap-0.5 bg-zinc-900 p-1 rounded border border-white/10">
                {currentPalette.slice(0, 16).map((hex, i) => (
                  <span
                    key={`${hex}-${i}`}
                    className="w-3 h-3 rounded-[2px] border border-black/40"
                    style={{ backgroundColor: hex }}
                    title={`#${i + 1}: ${hex}`}
                  />
                ))}
                {currentPalette.length > 16 && (
                  <span className="text-[9px] text-zinc-500 px-1 font-mono">
                    +{currentPalette.length - 16}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyPalette('original')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase border transition-all ${
                  activePaletteId === 'original'
                    ? 'bg-zinc-800 text-white border-white/20'
                    : 'bg-zinc-900 text-zinc-400 border-white/5 hover:text-zinc-200'
                }`}
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Original</span>
              </button>

              {PRESET_PALETTES.map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => handleApplyPalette(pal.id, pal.colors)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase border transition-all ${
                    activePaletteId === pal.id
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : 'bg-zinc-900 text-zinc-400 border-white/5 hover:border-white/15 hover:text-zinc-200'
                  }`}
                  title={`Apply ${pal.name} ramp`}
                >
                  <span className="flex -space-x-0.5">
                    {pal.colors.slice(1, 5).map((c, idx) => (
                      <span
                        key={idx}
                        className="w-2 h-2.5 first:rounded-l-[2px] last:rounded-r-[2px]"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                  <span>{pal.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div
          className="relative p-12 flex items-center justify-center min-h-[450px] transition-colors"
          style={{
            backgroundColor: backdrop === 'none' ? '#09090b' : '#0c0b10'
          }}
        >
          {/* Transparency Checkerboard (when backdrop === 'none') */}
          {backdrop === 'none' && (
            <div
              className="absolute inset-0 opacity-[0.04] pointer-events-none"
              style={{
                backgroundImage: `conic-gradient(#fff 90deg, #000 90deg 180deg, #fff 180deg 270deg, #000 270deg)`,
                backgroundSize: '20px 20px'
              }}
            />
          )}

          {/* Sprite Container */}
          <div
            className="relative z-10 w-full max-w-[448px] transition-all duration-300 transform group border border-white/5 shadow-inner overflow-hidden"
            style={{
              aspectRatio: `${svgW} / ${svgH}`,
              imageRendering: 'pixelated',
              backgroundColor: backdrop === 'none' ? 'transparent' : '#0c0b10'
            }}
          >
            {/* Game Ground Horizon Backdrop Overlay inside the sprite frame */}
            {backdrop === 'ground' && (
              <div className="absolute inset-0 pointer-events-none z-0">
                <div
                  className="absolute inset-x-0 top-0"
                  style={{
                    height: `${originTopPct}%`,
                    backgroundColor: '#0c0b12'
                  }}
                />
                <div
                  className="absolute inset-x-0"
                  style={{
                    top: `${originTopPct}%`,
                    bottom: 0,
                    backgroundColor: '#161420',
                    borderTop: '2px solid #342e48'
                  }}
                />
              </div>
            )}

            {/* Render either Edge-Faded Raster Preview or Crisp SVG */}
            {edgeFadeEnabled && rasterPreviewUrl ? (
              <img
                src={rasterPreviewUrl}
                alt={data.prompt}
                className="relative z-10 w-full h-full object-contain block"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div
                className="relative z-10 w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                style={{ imageRendering: 'pixelated' }}
                dangerouslySetInnerHTML={{ __html: currentSvgContent }}
              />
            )}

            {/* Origin / Pivot Crosshair Marker */}
            {showOrigin && (
              <div
                className="absolute z-20 pointer-events-none"
                style={{
                  left: `${originLeftPct}%`,
                  top: `${originTopPct}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div className="relative flex items-center justify-center">
                  <div className="w-5 h-px bg-amber-400 shadow-[0_0_4px_#000]" />
                  <div className="h-5 w-px bg-amber-400 shadow-[0_0_4px_#000] absolute" />
                  <div className="w-2 h-2 rounded-full border border-amber-400 bg-amber-400/30 absolute" />
                  <span className="absolute left-3 top-2 px-1 py-0.5 rounded bg-black/80 text-amber-300 font-mono text-[9px] whitespace-nowrap border border-amber-500/30">
                    ({origin[0]}, {origin[1]})
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Pixel Info Overlay */}
          <div className="absolute bottom-4 right-4 text-[10px] font-mono text-zinc-500 uppercase tracking-widest bg-zinc-950/80 px-2 py-1 rounded border border-white/5">
            Upscale: {svgW * 8}x{svgH * 8}px (8x) / Native: {svgW}x{svgH}px
          </div>
        </div>

        {/* SvgChecker Diagnostics & Quality Report Bar */}
        {report && (
          <div className="px-4 py-2.5 bg-zinc-900/95 border-t border-white/10 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {report.passed && report.warnings.length === 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    CHECK: PASS
                  </span>
                ) : report.passed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <AlertTriangle className="w-3 h-3" />
                    CHECK: PASS ({report.warnings.length} WARN)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/15 text-red-400 border border-red-500/30">
                    <AlertTriangle className="w-3 h-3" />
                    CHECK: FAIL
                  </span>
                )}

                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-white/5">
                  COLORS: <strong className="text-zinc-200">{currentPalette.length}</strong>
                </span>

                {report.bounds && (
                  <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-white/5">
                    BOUNDS: x[{report.bounds.bx0}..{report.bounds.bx1}] y[{report.bounds.by0}..{report.bounds.by1}]
                  </span>
                )}

                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-white/5">
                  SPILL: <strong className={report.spillCount > 0 ? 'text-amber-400' : 'text-emerald-400'}>{report.spillCount}</strong>
                </span>

                {report.hasLightLayer && (
                  <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    LAYER: #light (plus-lighter)
                  </span>
                )}
              </div>
            </div>

            {(report.errors.length > 0 || report.warnings.length > 0) && (
              <div className="flex flex-col gap-1 mt-1">
                {report.errors.map((err, i) => (
                  <div key={`err-${i}`} className="text-[11px] font-mono text-red-400 flex items-center gap-1.5">
                    <span>• [FAIL] {err}</span>
                  </div>
                ))}
                {report.warnings.map((warn, i) => (
                  <div key={`warn-${i}`} className="text-[11px] font-mono text-amber-300/90 flex items-center gap-1.5">
                    <span>• [WARN] {warn}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Metadata Footer */}
        <div className="px-4 py-2 bg-zinc-950 border-t border-white/10">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-[10px] text-zinc-600 font-mono italic">ID: {data.id.slice(0, 8)}</span>
              {data.generationTime !== undefined && (
                <span className="text-[10px] text-cyan-500/80 font-mono">
                  TIME: {data.generationTime.toFixed(2)}s
                </span>
              )}
              {data.tokenCount && (
                <span className="text-[10px] text-zinc-500 font-mono">
                  TOKENS: {data.tokenCount.total} ({data.tokenCount.prompt}in / {data.tokenCount.completion}out)
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">
              Processed by {data.tokenCount?.total ? 'AI Engine' : 'Legacy Engine'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
