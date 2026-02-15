/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI } from "@google/genai";

// REMOVEMOS a inicialização do cliente daqui.

/**
 * Generates a 64x64 Pixel Art SVG string based on the user's prompt.
 */
export const generateSvgFromPrompt = async (prompt: string): Promise<string> => {
  try {
    // 1. Verificamos se a chave de API existe PRIMEIRO.
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("A chave de API do Gemini não foi configurada. Por favor, adicione-a ao seu arquivo .env.local.");
    }

    // 2. Inicializamos o cliente AQUI, somente quando a função é chamada.
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const systemPrompt = `
      You are a World-Class Pixel Art Generator. Your task is to output high-quality 64x64 resolution game assets as SVG code.
      
      CRITICAL TECHNICAL CONSTRAINTS:
      1. **Structure**: 
         - Root <svg> must have: viewBox="0 0 64 64" and xmlns="http://www.w3.org/2000/svg".
         - Use shape-rendering="crispEdges" on the root <svg> element.
      2. **Pixel Logic**: 
         - Create pixel art by using <rect> elements.
         - Every <rect> must have integer x, y, width, and height values.
         - Width and height should usually be 1, but can be larger for blocks of the same color.
      3. **Aesthetics**:
         - Style: 16-bit or 32-bit console game assets.
         - Use vibrant color palettes with high contrast.
         - Use dark outlines (usually dark blue or black) to define the shape.
         - Add highlights and shadows (shading) within the 64x64 grid to give depth.
      4. **Output Format**:
         - Return ONLY the raw SVG code. 
         - Do not include markdown formatting, backticks, or any explanations.
         - Start immediately with <svg and end with </svg>.
      5. **Content**:
         - Focus on the asset only. Ensure it is centered in the 64x64 space.
         - Leave a small 1-2 pixel margin around the edge if possible to avoid clipping.
    `;

    const fullPrompt = `Create a high-detail 64x64 pixel art SVG of: "${prompt}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: fullPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3, 
        topP: 0.8,
        topK: 40,
      },
    });

    const rawText = response.text || '';
    
    const svgMatch = rawText.match(/<svg[\s\S]*?<\/svg>/i);
    
    if (svgMatch && svgMatch[0]) {
      let content = svgMatch[0];
      if (!content.includes('crispEdges')) {
        content = content.replace('<svg', '<svg shape-rendering="crispEdges"');
      }
      return content;
    } else {
      return rawText.replace(/```xml/g, '').replace(/```svg/g, '').replace(/```/g, '').trim();
    }

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Repassa o erro para a UI poder exibi-lo.
    throw new Error(error.message || "Falha ao gerar o pixel asset.");
  }
};
