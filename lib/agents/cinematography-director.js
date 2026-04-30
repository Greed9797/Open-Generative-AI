import { llmCall } from './llm-call.js';

const STYLE_EXAMPLES = {
  Cinematic: 'Arri Alexa, anamorphic 35mm, slow dolly-in',
  Commercial: 'Sony FX9, 85mm f/1.4, soft circular product move',
  Documentary: 'Handheld, 24mm, grounded natural movement',
  'Social Media': 'GoPro energy, 16mm, dynamic short-form motion',
  Abstract: 'Drone, fisheye, timelapse-inspired camera movement',
};

function fallbackPlan(style) {
  return {
    camera: 'Arri Alexa',
    lens: '35mm anamorphic',
    movement: 'slow dolly-in',
    lighting: 'soft cinematic key light',
    colorGrade: 'natural contrast with warm highlights',
    mood: style || 'Cinematic',
    cameraInstructions: STYLE_EXAMPLES[style] || STYLE_EXAMPLES.Cinematic,
  };
}

function stripFence(value) {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export async function generateCinematographyPlan({ visionBriefing, style, targetModel, userId, apiKeys }) {
  try {
    const text = await llmCall({
      role: 'code_agent',
      fallbackRole: 'analysis_agent',
      temperature: 0.3,
      userId,
      apiKeys,
      systemPrompt: 'You are a cinematography director. Return only valid JSON.',
      userMessage: `Style: ${style || 'Cinematic'}\nTarget model: ${targetModel}\nVision briefing: ${JSON.stringify(visionBriefing || {})}\nExamples: ${JSON.stringify(STYLE_EXAMPLES)}\nReturn {camera,lens,movement,lighting,colorGrade,mood,cameraInstructions}.`,
    });
    return { ...fallbackPlan(style), ...JSON.parse(stripFence(text)) };
  } catch {
    return fallbackPlan(style);
  }
}
