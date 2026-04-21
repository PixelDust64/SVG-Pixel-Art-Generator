
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI } from "@google/genai";
import { Resolution, AIModel, LocalModel } from "../types";

// Initialize the client lazily
let genAI: GoogleGenAI | null = null;

const getGenAI = () => {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey && !process.env.API_KEY) {
      throw new Error("Gemini API Key is missing. Please set GEMINI_API_KEY in your environment.");
    }
    genAI = new GoogleGenAI(apiKey || process.env.API_KEY || "");
  }
  return genAI;
};

/**
 * Fetches available models from LM Studio
 */
export const fetchLocalModels = async (baseUrl: string): Promise<LocalModel[]> => {
  try {
    const response = await fetch(`${baseUrl}/v1/models`);
    if (!response.ok) throw new Error('Failed to fetch local models');
    const data = await response.json();
    return data.data.map((m: any) => ({
      id: m.id,
      name: m.id
    }));
  } catch (error) {
    console.error("Error fetching local models:", error);
    throw error;
  }
};

/**
 * Generates a Pixel Art SVG string using a local model (LM Studio)
 */
export const generateSvgFromLocalModel = async (
  prompt: string, 
  resolution: Resolution, 
  baseUrl: string, 
  modelId: string
): Promise<string> => {
  const systemPrompt = `
    You are a World-Class Pixel Art Generator. Your task is to output high-quality ${resolution} resolution game assets as SVG code.
    
    CRITICAL TECHNICAL CONSTRAINTS:
    1. **Structure**: 
       - Root <svg> must have: viewBox="0 0 ${resolution.split('x')[0]} ${resolution.split('x')[1]}" and xmlns="http://www.w3.org/2000/svg".
       - Use shape-rendering="crispEdges" on the root <svg> element.
    2. **Pixel Logic**: 
       - Create pixel art by using <rect> elements.
       - Every <rect> must have integer x, y, width, and height values.
       - Width and height should usually be 1, but can be larger for blocks of the same color.
    3. **Aesthetics**:
       - Style: 16-bit or 32-bit console game assets.
       - Use vibrant color palettes with high contrast.
       - Use dark outlines (usually dark blue or black) to define the shape.
       - Add highlights and shadows (shading) within the ${resolution} grid to give depth.
    4. **Output Format**:
       - Return ONLY the raw SVG code. 
       - Do not include markdown formatting, backticks, or any explanations.
       - Start immediately with <svg and end with </svg>.
    5. **Content**:
       - Focus on the asset only. Ensure it is centered in the ${resolution} space.
       - Leave a small 1-2 pixel margin around the edge if possible to avoid clipping.
  `;

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Create a high-detail ${resolution} pixel art SVG of: "${prompt}"` }
        ],
        temperature: 0.3,
        top_p: 0.8,
        top_k: 40,
      }),
    });

    if (!response.ok) throw new Error('Failed to generate SVG from local model');
    const data = await response.json();
    const rawText = data.choices[0].message.content || '';
    
    const svgMatch = rawText.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch && svgMatch[0]) {
      let content = svgMatch[0];
      if (!content.includes('crispEdges')) {
        content = content.replace('<svg', '<svg shape-rendering="crispEdges"');
      }
      return content;
    }
    return rawText.trim();
  } catch (error) {
    console.error("Local Model Error:", error);
    throw error;
  }
};

/**
 * Generates a Pixel Art SVG string based on the user's prompt and resolution.
 */
export const generateSvgFromPrompt = async (prompt: string, resolution: Resolution, model: AIModel = AIModel.GEMINI_3_PRO): Promise<string> => {
  try {
    const systemPrompt = `
      You are a World-Class Pixel Art Generator. Your task is to output high-quality ${resolution} resolution game assets as SVG code.
      
      CRITICAL TECHNICAL CONSTRAINTS:
      1. **Structure**: 
         - Root <svg> must have: viewBox="0 0 ${resolution.split('x')[0]} ${resolution.split('x')[1]}" and xmlns="http://www.w3.org/2000/svg".
         - Use shape-rendering="crispEdges" on the root <svg> element.
      2. **Pixel Logic**: 
         - Create pixel art by using <rect> elements.
         - Every <rect> must have integer x, y, width, and height values.
         - Width and height should usually be 1, but can be larger for blocks of the same color.
      3. **Aesthetics**:
         - Style: 16-bit or 32-bit console game assets.
         - Use vibrant color palettes with high contrast.
         - Use dark outlines (usually dark blue or black) to define the shape.
         - Add highlights and shadows (shading) within the ${resolution} grid to give depth.
      4. **Output Format**:
         - Return ONLY the raw SVG code. 
         - Do not include markdown formatting, backticks, or any explanations.
         - Start immediately with <svg and end with </svg>.
      5. **Content**:
         - Focus on the asset only. Ensure it is centered in the ${resolution} space.
         - Leave a small 1-2 pixel margin around the edge if possible to avoid clipping.
    `;

    const modelInstance = getGenAI().getGenerativeModel({ 
      model: model,
      systemInstruction: systemPrompt
    });

    const result = await modelInstance.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Create a high-detail ${resolution} pixel art SVG of: "${prompt}"` }] }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
      }
    });
    const response = await result.response;
    const rawText = response.text();
    
    // Extraction to ensure we get only the SVG code
    const svgMatch = rawText.match(/<svg[\s\S]*?<\/svg>/i);
    
    if (svgMatch && svgMatch[0]) {
      let content = svgMatch[0];
      // Ensure the svg has crispEdges
      if (!content.includes('crispEdges')) {
        content = content.replace('<svg', '<svg shape-rendering="crispEdges"');
      }
      return content;
    } else {
      // Fallback cleanup
      return rawText.replace(/```xml/g, '').replace(/```svg/g, '').replace(/```/g, '').trim();
    }

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to generate pixel asset.");
  }
};
