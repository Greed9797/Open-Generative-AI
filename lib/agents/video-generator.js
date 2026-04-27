import { resolveApiKeyByProvider } from '../resolve-api-key.js';
import * as kling from '../providers/kling.js';
import * as wan from '../providers/wan.js';
import * as seedance from '../providers/seedance.js';
import * as gemini from '../providers/gemini.js';
import * as runway from '../providers/runway.js';

const MODEL_CONFIGS = {
  kling: { provider: 'kling', adapter: kling, model: 'kling-v3.0-pro-text-to-video', requiresImage: false },
  wan: { provider: 'wan', adapter: wan, model: 'wan2.6-text-to-video', requiresImage: false },
  seedance: { provider: 'seedance', adapter: seedance, model: 'seedance-lite-t2v', requiresImage: false },
  veo: { provider: 'gemini', adapter: gemini, model: 'veo3.1-fast-text-to-video', requiresImage: false },
  runway: { provider: 'runway', adapter: runway, model: 'gen4_turbo', requiresImage: true },
};

const PROVIDER_DB_NAME = { kling: 'Kling', wan: 'Wan', seedance: 'Seedance', gemini: 'Gemini', runway: 'Runway' };

function resolveConfig(targetModel = 'kling') {
  const value = targetModel.toLowerCase();
  if (value.includes('runway') || value.includes('gen4')) return MODEL_CONFIGS.runway;
  if (value.includes('wan')) return MODEL_CONFIGS.wan;
  if (value.includes('seedance')) return MODEL_CONFIGS.seedance;
  if (value.includes('veo') || value.includes('gemini')) return MODEL_CONFIGS.veo;
  return MODEL_CONFIGS.kling;
}

export async function generateClip({ prompt, baseImageUrl, targetModel, userId }) {
  const config = resolveConfig(targetModel);
  const resolved = await resolveApiKeyByProvider(userId, PROVIDER_DB_NAME[config.provider]);
  if (!resolved?.key) throw new Error(`No API key configured for ${PROVIDER_DB_NAME[config.provider]}. Add it in Settings → API Keys.`);

  const payload = {
    model: config.model,
    prompt,
    duration: 8,
    aspect_ratio: '16:9',
    ...(config.requiresImage && baseImageUrl ? { image_url: baseImageUrl } : {}),
  };

  const submitResult = await config.adapter.submit(payload, resolved.key);
  const encodedId = submitResult.request_id;

  // Strip provider prefix from encodedId if needed
  const colonIdx = encodedId.indexOf(':');
  const taskId = colonIdx !== -1 ? encodedId.slice(colonIdx + 1) : encodedId;
  // For kling, pass full encodedId; for others pass taskId
  const pollId = config.provider === 'kling' ? encodedId : taskId;

  for (let attempt = 0; attempt < 150; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const result = await config.adapter.poll(pollId, resolved.key);
    if (result.status === 'completed') {
      const clipUrl = result.url || result.outputs?.[0];
      if (!clipUrl) throw new Error('Generation completed without a clip URL');
      return clipUrl;
    }
    if (result.status === 'failed') throw new Error('Video generation failed');
  }
  throw new Error(`Video generation timeout — model: ${targetModel}`);
}
