import { resolveApiKey } from '../resolve-api-key.js';

const MINIMAX_URL = 'https://api.minimax.io/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function stripThink(value) {
  return String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function callMiniMax({ key, systemPrompt, userMessage, temperature }) {
  const response = await fetch(MINIMAX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [
        { role: 'system', content: systemPrompt || '' },
        { role: 'user', content: userMessage || '' },
      ],
      max_tokens: 2048,
      temperature: temperature ?? 0.2,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || 'MiniMax request failed');
  return stripThink(data.choices?.[0]?.message?.content || '');
}

async function callGemini({ key, systemPrompt, userMessage, temperature }) {
  const response = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt || ''}\n\n${userMessage || ''}` }] }],
      generationConfig: { temperature: temperature ?? 0.2 },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || 'Gemini request failed');
  return stripThink(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

export async function llmCall({ role, fallbackRole, systemPrompt, userMessage, temperature, fallbackKeys, apiKeys, userId }) {
  let resolved = null;
  let firstError = null;

  try {
    resolved = await resolveApiKey({ userId, role, fallbackKeys: fallbackKeys || apiKeys });
  } catch (err) {
    firstError = err;
  }

  if (!resolved?.key && fallbackRole) {
    try {
      resolved = await resolveApiKey({ userId, role: fallbackRole, fallbackKeys: fallbackKeys || apiKeys });
    } catch (err) {
      firstError = firstError || err;
    }
  }

  if (!resolved?.key) {
    throw new Error(`Nenhuma API key configurada para: ${role}${fallbackRole ? ` ou ${fallbackRole}` : ''}. Acesse Settings → API Keys.`);
  }

  const provider = String(resolved.providerName || '').toLowerCase();
  if (provider.includes('minimax')) {
    return callMiniMax({ key: resolved.key, systemPrompt, userMessage, temperature });
  }
  if (provider.includes('gemini') || provider.includes('veo')) {
    return callGemini({ key: resolved.key, systemPrompt, userMessage, temperature });
  }

  if (firstError) console.warn('[llm-call] primary resolution warning:', firstError.message);
  return callGemini({ key: resolved.key, systemPrompt, userMessage, temperature });
}
