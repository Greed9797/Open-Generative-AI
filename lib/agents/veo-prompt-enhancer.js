import { createHash } from 'node:crypto';

const MINIMAX_URL = 'https://api.minimax.io/v1/chat/completions';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const enhancementCache = new Map();

const SYSTEM_PROMPT = `You are a Veo 3.1 prompt specialist. Your task is to enhance video generation prompts to maximize visual quality and cinematic impact in Veo 3.1.

RULES:
- NEVER change the subject, story, or intent of the original prompt
- ADD cinematic details: camera movement (tracking shot, dolly in/out, crane, handheld), lens characteristics (wide angle, telephoto, shallow depth of field), lighting quality (golden hour, dramatic side lighting, soft diffused), atmosphere (fog, dust particles, lens flare, bokeh), motion quality (fluid, dynamic, slow-motion)
- Describe the visual result directly — never reference editing software or post-production techniques
- Keep the enhanced prompt under 150 words, focused and specific
- Output ONLY the enhanced prompt text. No explanations, no headers, no quotes, no labels.`;

export async function enhanceVeoPromptWithMeta(originalPrompt) {
  const key = process.env.VEO_PROMPT_ENHANCER_KEY;
  if (!key || !originalPrompt) {
    return { prompt: originalPrompt, enhanced: false, provider: null, reason: key ? 'empty_prompt' : 'disabled' };
  }

  try {
    const promptHash = createHash('sha256').update(originalPrompt).digest('hex').slice(0, 32);
    const cached = enhancementCache.get(promptHash);
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      return { ...cached.result, cached: true, promptHash };
    }

    const response = await fetch(MINIMAX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: originalPrompt },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('[veo-enhancer] MiniMax error:', data.error?.message);
      return { prompt: originalPrompt, enhanced: false, provider: 'MiniMax-M2.7', reason: 'provider_error' };
    }

    const enhanced = data.choices?.[0]?.message?.content?.trim();
    if (!enhanced) {
      return { prompt: originalPrompt, enhanced: false, provider: 'MiniMax-M2.7', reason: 'empty_response' };
    }

    console.log('[veo-enhancer] prompt enhanced via MiniMax M2.7');
    const result = {
      prompt: enhanced,
      enhanced: enhanced !== originalPrompt,
      provider: 'MiniMax-M2.7',
      reason: enhanced !== originalPrompt ? 'enhanced' : 'unchanged',
      cached: false,
      promptHash,
    };
    enhancementCache.set(promptHash, { createdAt: Date.now(), result });
    return result;
  } catch (err) {
    console.warn('[veo-enhancer] failed, using original prompt:', err.message);
    return { prompt: originalPrompt, enhanced: false, provider: 'MiniMax-M2.7', reason: 'exception' };
  }
}

export async function enhanceVeoPrompt(originalPrompt) {
  const result = await enhanceVeoPromptWithMeta(originalPrompt);
  return result.prompt;
}
