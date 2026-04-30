import { llmCall } from './llm-call.js';

function stripFence(value) {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function fallbackPlan(job) {
  const roughPrompt = job.roughPrompt || 'Create a cinematic product video';
  return {
    consistencyRules: 'Keep the same subject identity, color palette, lighting direction, and geometry across all segments.',
    segments: [0, 1, 2].map((index) => ({
      index,
      narrativeRole: ['opening', 'development', 'closing'][index],
      startingPrompt: `${roughPrompt}. Segment ${index + 1} of 3.`,
      motionDirection: ['slow reveal', 'controlled movement', 'hero finish'][index],
    })),
    transitions: [
      { between: '0-1', type: 'crossfade', duration: 0.5 },
      { between: '1-2', type: 'crossfade', duration: 0.5 },
    ],
  };
}

function normalizePlan(plan, job) {
  const fallback = fallbackPlan(job);
  const segments = Array.isArray(plan?.segments) ? plan.segments.slice(0, 3) : [];
  while (segments.length < 3) segments.push(fallback.segments[segments.length]);
  return {
    consistencyRules: plan?.consistencyRules || fallback.consistencyRules,
    segments: segments.map((segment, index) => ({
      index,
      narrativeRole: segment.narrativeRole || fallback.segments[index].narrativeRole,
      startingPrompt: segment.startingPrompt || fallback.segments[index].startingPrompt,
      motionDirection: segment.motionDirection || fallback.segments[index].motionDirection,
    })),
    transitions: Array.isArray(plan?.transitions) && plan.transitions.length >= 2 ? plan.transitions.slice(0, 2) : fallback.transitions,
  };
}

export async function runOrchestrator(job) {
  const userMessage = [
    `Rough prompt: ${job.roughPrompt || ''}`,
    `Target model: ${job.targetModel || ''}`,
    `Style: ${job.style || 'Cinematic'}`,
    `Vision briefing: ${JSON.stringify(job.visionBriefing || {})}`,
    `Cinematography plan: ${JSON.stringify(job.cinematographyPlan || {})}`,
    job.replanContext ? `Replan context: ${JSON.stringify(job.replanContext)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const text = await llmCall({
      role: 'orchestrator',
      fallbackRole: 'code_agent',
      temperature: 0.1,
      userId: job.userId || job.user_id,
      apiKeys: job.apiKeys,
      systemPrompt: 'Create exactly 3 video segments and 2 transitions. Return only JSON: {consistencyRules,segments:[{index,narrativeRole,startingPrompt,motionDirection}],transitions:[{between,type,duration}]}.',
      userMessage,
    });
    return normalizePlan(JSON.parse(stripFence(text)), job);
  } catch {
    return fallbackPlan(job);
  }
}
