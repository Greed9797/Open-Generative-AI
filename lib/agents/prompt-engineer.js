import { resolveApiKey } from '../resolve-api-key.js';

const MINIMAX_URL = 'https://api.minimax.io/v1/chat/completions';

const MODEL_PROMPT_STYLES = {
  seedance: 'Seedance prefers clear motion verbs, subject continuity, camera movement, visual pacing, and concise scene constraints.',
  veo3: 'Veo3 prefers cinematic language, lens/camera direction, lighting, atmosphere, and realistic temporal continuity.',
  kling: 'Kling prefers precise physical motion, subject pose continuity, camera path, and explicit artifact avoidance.',
  wan: 'Wan prefers descriptive motion, clean composition, stable subject identity, and direct visual instructions.',
  default: 'Use direct cinematic instructions, concrete motion, consistent subject details, and avoid contradictory style notes.',
};

function modelFamily(targetModel = '') {
  const value = targetModel.toLowerCase();
  if (value.includes('veo')) return 'veo3';
  if (value.includes('kling')) return 'kling';
  if (value.includes('wan')) return 'wan';
  if (value.includes('seedance')) return 'seedance';
  return 'default';
}

export async function refinePrompt({ segmentSpec, previousAttempt, targetModel, roughPrompt, consistencyRules, apiKeys, userId }) {
  const { key } = await resolveApiKey({ userId, role: 'code_agent', fallbackKeys: apiKeys });

  const family = modelFamily(targetModel);
  const system = `You are Agent B, a video prompt engineer. Optimize prompts for ${targetModel}. ${MODEL_PROMPT_STYLES[family] || MODEL_PROMPT_STYLES.default} Return only the final refined prompt string.`;
  const retryContext = previousAttempt
    ? `Previous score: ${previousAttempt.score}. Problems: ${(previousAttempt.problems || []).join('; ')}. Suggestions: ${(previousAttempt.suggestions || []).join('; ')}.`
    : 'This is the first attempt.';

  const response = await fetch(MINIMAX_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Rough prompt: ${roughPrompt || 'none'}\nConsistency rules: ${consistencyRules || 'none'}\nSegment: ${JSON.stringify(segmentSpec)}\n${retryContext}` },
      ],
      max_tokens: 2048,
      temperature: 0.4,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'MiniMax prompt refinement failed');
  return String(data.choices?.[0]?.message?.content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```[\s\S]*?\n/, '')
    .replace(/```$/g, '')
    .trim();
}
