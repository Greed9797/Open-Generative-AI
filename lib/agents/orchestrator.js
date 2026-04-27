import { resolveApiKey } from '../resolve-api-key.js';

const MINIMAX_URL = 'https://api.minimax.io/v1/chat/completions';

function stripFence(value) {
  return String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonObject(value) {
  const cleaned = stripFence(value);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) throw new Error('Orchestrator returned invalid JSON');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

export async function runOrchestrator(job) {
  const { key } = await resolveApiKey({ userId: job.userId, role: 'orchestrator', fallbackKeys: job.apiKeys });

  const system = 'You are a video production director. Given a base image URL, a rough prompt, a target video model, and a style direction, plan 3 sequential 8-second video segments that together form a cohesive 24-second video. Return ONLY a JSON object with this exact shape: { "consistencyRules": string, "segments": [ { "index": 0, "narrativeRole": string, "startingPrompt": string, "motionDirection": string }, ... ] }';
  const response = await fetch(MINIMAX_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ baseImageUrl: job.baseImageUrl, roughPrompt: job.roughPrompt, targetModel: job.targetModel, style: job.style }) },
      ],
      max_tokens: 2048,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'MiniMax orchestrator request failed');

  const plan = parseJsonObject(data.choices?.[0]?.message?.content);
  if (!plan.segments || plan.segments.length !== 3) {
    throw new Error(`Orchestrator returned invalid plan: expected 3 segments, got ${plan.segments?.length}`);
  }
  plan.segments.forEach((seg, i) => {
    if (!seg.startingPrompt) {
      throw new Error(`Segment ${i} missing startingPrompt`);
    }
  });
  return plan;
}
