import { createServiceClient } from '../supabase/service.js';
import { CINEMATIC_SUFFIXES_BY_MODEL, modelFamilyFromTarget } from '../video-quality-config.js';
import { buildMotionPrompt } from './motion-director.js';
import { expandPrompt } from './prompt-expander.js';
import { llmCall } from './llm-call.js';

const MODEL_PROMPT_STYLES = {
  seedance: 'Seedance prefers clear motion verbs, subject continuity, camera movement, visual pacing, and concise scene constraints.',
  veo3: 'Veo3 prefers cinematic language, lens/camera direction, lighting, atmosphere, and realistic temporal continuity.',
  kling: 'Kling prefers precise physical motion, subject pose continuity, camera path, and explicit artifact avoidance.',
  wan: 'Wan prefers descriptive motion, clean composition, stable subject identity, and direct visual instructions.',
  runway: 'Runway prefers concise prompt text, strong first-frame continuity, and direct camera instructions.',
  default: 'Use direct cinematic instructions, concrete motion, consistent subject details, and avoid contradictory style notes.',
};

async function loadPromptLearnings({ userId, targetModel }) {
  if (!userId) return [];
  try {
    const supabase = createServiceClient();
    const { data = [] } = await supabase
      .from('prompt_learnings')
      .select('prompt_text,score_avg,problems')
      .eq('user_id', userId)
      .eq('target_model', targetModel)
      .gte('score_avg', 8)
      .order('score_avg', { ascending: false })
      .limit(3);
    return data;
  } catch {
    return [];
  }
}

function stripFence(value) {
  return String(value || '').replace(/^```[\s\S]*?\n/, '').replace(/```$/g, '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function attemptsContext(attempts = []) {
  if (!attempts.length) return 'First attempt.';
  return attempts.map((attempt, index) => (
    `Tentativa ${index + 1} — Score: ${attempt.score || 0} — Prompt: ${attempt.prompt || ''} — Problemas: ${(attempt.problems || []).join('; ')}`
  )).join('\n');
}

export async function refinePrompt({
  segmentSpec,
  previousAttempt,
  allAttempts,
  targetModel,
  roughPrompt,
  consistencyRules,
  baseImageUrl,
  apiKeys,
  userId,
  visionBriefing,
  cinematographyPlan,
}) {
  const family = modelFamilyFromTarget(targetModel);
  const expandedPrompt = await expandPrompt({ roughPrompt, targetModel, visionBriefing, apiKeys, userId });
  const learnings = await loadPromptLearnings({ userId, targetModel });
  const system = `You are a video prompt engineer for ${targetModel}. ${MODEL_PROMPT_STYLES[family] || MODEL_PROMPT_STYLES.default}
RULES:
1. Preserve the user intent.
2. Fix ALL problems from ALL previous attempts.
3. Add only useful camera, lighting, motion, and continuity detail.
4. Return only the final prompt string.
Successful learnings: ${JSON.stringify(learnings)}`;

  const userMessage = [
    `Expanded prompt: ${expandedPrompt || roughPrompt || 'none'}`,
    `Consistency rules: ${consistencyRules || 'none'}`,
    `Segment: ${JSON.stringify(segmentSpec || {})}`,
    `Vision briefing: ${JSON.stringify(visionBriefing || {})}`,
    `Cinematography plan: ${JSON.stringify(cinematographyPlan || {})}`,
    `Reference image URL: ${baseImageUrl || 'none'}`,
    `Previous attempt: ${previousAttempt ? JSON.stringify(previousAttempt) : 'none'}`,
    attemptsContext(allAttempts || []),
  ].join('\n');

  const refined = await llmCall({
    role: 'code_agent',
    fallbackRole: 'analysis_agent',
    systemPrompt: system,
    userMessage,
    temperature: 0.1,
    apiKeys,
    userId,
  });

  const motionPrompt = buildMotionPrompt({
    userPrompt: stripFence(refined),
    cinematographyPlan,
    visionBriefing,
    targetModel,
    segmentIndex: segmentSpec?.index || 0,
    motionDirection: segmentSpec?.motionDirection,
  });

  const suffix = CINEMATIC_SUFFIXES_BY_MODEL[family] || CINEMATIC_SUFFIXES_BY_MODEL.default;
  return `${motionPrompt}${suffix}`;
}
