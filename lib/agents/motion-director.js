import { MOTION_PRESERVATION_PROMPTS } from '../video-quality-config.js';

function subjectType(visionBriefing) {
  const text = `${visionBriefing?.subject || ''} ${visionBriefing?.environment || ''}`.toLowerCase();
  if (/person|face|human|woman|man|portrait|model/.test(text)) return 'person';
  if (/product|bottle|box|shoe|device|object|packaging/.test(text)) return 'product';
  if (/landscape|mountain|forest|room|street|environment/.test(text)) return 'landscape';
  if (/abstract|shape|pattern/.test(text)) return 'abstract';
  return 'default';
}

export function buildMotionPrompt({ userPrompt, cinematographyPlan, visionBriefing, targetModel, segmentIndex, motionDirection }) {
  const type = subjectType(visionBriefing);
  const preservation = MOTION_PRESERVATION_PROMPTS[type] || MOTION_PRESERVATION_PROMPTS.default;
  const camera = cinematographyPlan?.cameraInstructions || cinematographyPlan?.movement || 'cinematic camera movement';
  return [
    userPrompt,
    `Segment ${segmentIndex + 1}: ${motionDirection || 'controlled cinematic motion'}.`,
    camera,
    preservation,
    `Target model: ${targetModel}.`,
  ].filter(Boolean).join(' ');
}
