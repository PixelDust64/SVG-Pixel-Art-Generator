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

export enum AIModel {
  GEMINI_3_PRO = 'gemini-3-pro-preview',
  GEMINI_2_5_PRO = 'gemini-2.5-pro',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash'
}

export enum ModelSource {
  GEMINI = 'GEMINI',
  LOCAL = 'LOCAL'
}

export interface LocalModel {
  id: string;
  name: string;
}

export const MODEL_DISPLAY_NAMES: Record<AIModel, string> = {
  [AIModel.GEMINI_3_PRO]: 'Gemini 3 Pro',
  [AIModel.GEMINI_2_5_PRO]: 'Gemini 2.5 Pro',
  [AIModel.GEMINI_2_5_FLASH]: 'Gemini 2.5 Flash'
};

export interface GeneratedSvg {
  id: string;
  content: string;
  prompt: string;
  timestamp: number;
}

export interface ApiError {
  message: string;
  details?: string;
}
