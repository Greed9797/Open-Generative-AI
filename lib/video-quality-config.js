export const NEGATIVE_PROMPTS_VIDEO = [
  'low quality', 'blurry', 'pixelated', 'watermark', 'text overlay', 'subtitles',
  'logo', 'distorted faces', 'extra limbs', 'missing limbs', 'deformed hands',
  'extra fingers', 'fused fingers', 'mutated body', 'ugly', 'bad anatomy',
  'bad proportions', 'disfigured', 'malformed', 'duplicate', 'cloned face',
  'multiple heads', 'floating objects', 'cut off', 'out of frame',
  'poorly drawn', 'artifacts', 'noise', 'grain', 'overexposed', 'underexposed',
  'washed out', 'flat lighting', 'amateur', 'stock photo look', 'cartoon',
  'anime', 'illustration', 'painting', 'drawing', 'sketch', 'CGI obvious',
  'plastic look', 'unnatural colors', 'color banding', 'compression artifacts',
  'interlacing', 'frame drop', 'stuttering motion', 'jello effect',
  'camera shake excessive', 'lens flare artificial', 'chromatic aberration',
  'vignette heavy', 'HDR overdone', 'sharpening halo', 'motion smear',
  'temporal inconsistency', 'flickering',
];

export const NEGATIVE_PROMPTS_IMAGE = NEGATIVE_PROMPTS_VIDEO.filter((term) => ![
  'interlacing',
  'frame drop',
  'stuttering motion',
  'jello effect',
  'camera shake excessive',
  'motion smear',
  'temporal inconsistency',
  'flickering',
].includes(term));

export const MODEL_HYPERPARAMS = {
  seedance: { guidance_scale: 7.5, num_inference_steps: 30, fps: 24, motion_bucket_id: 127, noise_aug_strength: 0.02 },
  veo3: { guidance_scale: 7.0, temperature: 1.0, top_p: 0.95 },
  kling: { cfg_scale: 0.5, mode: 'pro' },
  runway: { guidance_scale: 7.5 },
  default: { guidance_scale: 7.5 },
};

export const CINEMATIC_SUFFIXES_BY_MODEL = {
  seedance: ', cinematic 4K, shallow depth of field, natural film grain, color graded, professional lighting, Arri Alexa look',
  veo3: ', photorealistic 8K, anamorphic lens, volumetric lighting, motion blur, teal and orange color grade, IMAX quality',
  kling: ', high fidelity, cinematic motion, professional color grading, 24fps film look, sharp focus on subject',
  runway: ', cinematic quality, professional cinematography, natural lighting, film grain, color graded footage',
  default: ', cinematic 4K, professional lighting, color graded, high quality',
};

export const MOTION_PRESERVATION_PROMPTS = {
  product: 'rigid body persistence, zero morphological changes, object geometry locked, subtle parallax depth effect, camera movement only',
  person: 'facial feature consistency, natural micro-expressions, no morphing, skin texture stable, clothing wrinkles preserved',
  landscape: 'environmental consistency, stable horizon line, natural atmospheric movement, wind effect on vegetation only',
  abstract: 'shape coherence, color palette locked, smooth transitions, no sudden geometry changes',
  default: 'subject consistency, no morphing, stable geometry, cinematic camera movement, photorealistic physics',
};

export function modelFamilyFromTarget(targetModel = '') {
  const model = String(targetModel).toLowerCase();
  if (model.includes('seedance')) return 'seedance';
  if (model.includes('veo')) return 'veo3';
  if (model.includes('kling')) return 'kling';
  if (model.includes('runway') || model.includes('gen4')) return 'runway';
  return 'default';
}
