/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export enum GenerationStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export enum Resolution {
  R64x64 = '64x64',
  R64x128 = '64x128',
  R128x64 = '128x64'
}

export type AIModel = string;

export enum ModelSource {
  GEMINI = 'GEMINI',
  LOCAL = 'LOCAL',
  BEAVERNET = 'BEAVERNET'
}

export type ProviderId = 'local' | 'beavernet' | 'gemini';

export interface ProviderKeyStatus {
  local: { configured: boolean };
  beavernet: { configured: boolean };
  gemini: { configured: boolean };
}

export interface LocalModel {
  id: string;
  name: string;
}

export type ProviderModel = LocalModel;

export type BackdropType = 'none' | 'dark' | 'ground';

export interface SvgCheckReport {
  passed: boolean;
  isEmpty: boolean;
  spillCount: number;
  bounds: { bx0: number; by0: number; bx1: number; by1: number } | null;
  uniqueColors: number;
  rectCount: number;
  invalidFills: number;
  hasLightLayer: boolean;
  roundedRects: number;
  warnings: string[];
  errors: string[];
}

export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
}

export interface AsepriteFrame {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

export interface AsepriteJson {
  frames: AsepriteFrame[];
  meta: {
    app: string;
    version: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
    frameTags: { name: string; from: number; to: number; direction: string }[];
    pixelfx: {
      id: string;
      name: string;
      fps: number;
      loop: boolean;
      frames: number;
      frameSize: [number, number];
      pivot: [number, number];
      columns: number;
    };
  };
}

export interface InputSvgFile {
  id: string;
  name: string;
  content: string;
  width?: number;
  height?: number;
}

export interface GeneratedSvg {
  id: string;
  content: string;
  prompt: string;
  timestamp: number;
  resolution?: Resolution;
  generationTime?: number;
  tokenCount?: {
    prompt: number;
    completion: number;
    total: number;
  };
  origin?: [number, number];
  checkReport?: SvgCheckReport;
  palette?: string[];
}

export interface GenerationResult {
  content: string;
  generationTime: number;
  tokenCount: {
    prompt: number;
    completion: number;
    total: number;
  };
  origin?: [number, number];
  checkReport?: SvgCheckReport;
  palette?: string[];
}

export interface BatchItem {
  id: string;
  prompt: string;
  source: ModelSource;
  model: AIModel;
  localModelId: string;
  resolution: Resolution;
  status: GenerationStatus;
  result?: GeneratedSvg;
}

export interface ApiError {
  message: string;
  details?: string;
}
