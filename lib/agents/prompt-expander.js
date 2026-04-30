import { llmCall } from './llm-call.js';

export async function expandPrompt({ roughPrompt, targetModel, visionBriefing, apiKey, provider, userId, apiKeys }) {
  const systemPrompt = 'Transform a rough idea into an 80-120 word cinematic generation prompt. Preserve the original intent. Add camera, lighting, subject continuity, and production detail. Return only the prompt.';
  const userMessage = `Provider: ${provider || 'auto'}\nTarget model: ${targetModel}\nVision briefing: ${JSON.stringify(visionBriefing || {})}\nRough prompt: ${roughPrompt || ''}`;
  try {
    return await llmCall({
      role: 'code_agent',
      fallbackRole: 'analysis_agent',
      systemPrompt,
      userMessage,
      temperature: 0.2,
      userId,
      apiKeys: apiKeys || (apiKey ? { minimaxApiKey: apiKey, geminiApiKey: apiKey } : undefined),
    });
  } catch {
    return roughPrompt || '';
  }
}
