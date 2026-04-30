import { resolveApiKeysForModel } from '../resolve-api-key.js';
import * as kling from '../providers/kling.js';
import * as wan from '../providers/wan.js';
import * as seedance from '../providers/seedance.js';
import * as gemini from '../providers/gemini.js';
import * as vertex from '../providers/vertex.js';
import * as runway from '../providers/runway.js';
import { MODEL_HYPERPARAMS, NEGATIVE_PROMPTS_VIDEO, modelFamilyFromTarget } from '../video-quality-config.js';

const T2V_CONFIGS = {
  kling:    { provider: 'kling',    adapter: kling,    model: 'kling-v3.0-pro-text-to-video' },
  wan:      { provider: 'wan',      adapter: wan,      model: 'wan2.6-text-to-video' },
  seedance: { provider: 'seedance', adapter: seedance, model: 'seedance-lite-t2v' },
  veo:      { provider: 'gemini',   adapter: gemini,   model: 'veo3.1-fast-text-to-video' },
  vertex:   { provider: 'vertex',   adapter: vertex,   model: 'vertex:veo3.1-fast-text-to-video' },
  runway:   { provider: 'runway',   adapter: runway,   model: 'gen4_turbo' },
};

// When baseImageUrl is present, prefer i2v variants for higher visual fidelity
const I2V_CONFIGS = {
  kling:    { provider: 'kling',    adapter: kling,    model: 'kling-v2.5-turbo-pro-i2v' },
  wan:      { provider: 'wan',      adapter: wan,      model: 'wan2.5-image-to-video' },
  seedance: { provider: 'seedance', adapter: seedance, model: 'seedance-pro-i2v' },
  veo:      { provider: 'gemini',   adapter: gemini,   model: 'veo3.1-fast-image-to-video' },
  vertex:   { provider: 'vertex',   adapter: vertex,   model: 'vertex:veo3.1-fast-image-to-video' },
  runway:   { provider: 'runway',   adapter: runway,   model: 'gen4_turbo' },
};

// Each entry can be a string or array of names tried in order (first match wins)
const PROVIDER_DB_NAMES = {
  kling: ['Kling'],
  wan: ['Wan'],
  seedance: ['Seedance'],
  // Veo keys may be stored as "Veo 3.1", "Veo", or "Gemini" depending on how user registered them
  gemini: ['Gemini', 'Veo 3.1'],
  vertex: ['Vertex AI'],
  runway: ['Runway'],
};

async function resolveKeysWithFallback(userId, provider, model) {
  const providerNames = PROVIDER_DB_NAMES[provider] || [provider];
  const fallbackProviderNames = provider === 'gemini' ? ['Vertex AI'] : [];
  const envFallbacks = [];
  if (provider === 'gemini') {
    envFallbacks.push(
      { key: 'GEMINI_API_KEY', providerName: 'Gemini', modelIdentifier: 'veo-3.1-generate-preview' },
      { key: 'VERTEX_AI_API_KEY', providerName: 'Vertex AI', modelIdentifier: 'vertex:veo3.1-fast-text-to-video' }
    );
  } else if (provider === 'vertex') {
    envFallbacks.push({ key: 'VERTEX_AI_API_KEY', providerName: 'Vertex AI', modelIdentifier: 'vertex:veo3.1-fast-text-to-video' });
  }
  return resolveApiKeysForModel({
    userId,
    role: 'video_gen',
    modelId: model,
    providerNames,
    fallbackProviderNames,
    envFallbacks,
  });
}

function resolveConfig(targetModel = 'kling', baseImageUrl = null) {
  const value = targetModel.toLowerCase();
  const configs = baseImageUrl ? I2V_CONFIGS : T2V_CONFIGS;
  if (value.includes('runway') || value.includes('gen4')) return configs.runway;
  if (value.includes('wan')) return configs.wan;
  if (value.includes('seedance')) return configs.seedance;
  if (value.includes('vertex')) return configs.vertex;
  if (value.includes('veo') || value.includes('gemini')) return configs.veo;
  return configs.kling;
}

function configForResolvedKey(config, resolved) {
  if (config.provider === 'gemini' && resolved?.providerName?.toLowerCase().includes('vertex')) {
    return { ...config, provider: 'vertex', adapter: vertex, model: `vertex:${config.model}` };
  }
  return config;
}

export async function generateClip({ prompt, baseImageUrl, targetModel, userId }) {
  const initialConfig = resolveConfig(targetModel, baseImageUrl);
  const resolvedKeys = await resolveKeysWithFallback(userId, initialConfig.provider, initialConfig.model);
  if (resolvedKeys.length === 0) throw new Error(`No API key configured for ${initialConfig.provider}. Add it in Settings → API Keys.`);

  let lastError;
  for (let keyIndex = 0; keyIndex < resolvedKeys.length; keyIndex += 1) {
    const resolved = resolvedKeys[keyIndex];
    const config = configForResolvedKey(initialConfig, resolved);
    const family = modelFamilyFromTarget(config.model || targetModel);
    const payload = {
      model: config.model,
      prompt,
      negative_prompt: NEGATIVE_PROMPTS_VIDEO.join(', '),
      ...(MODEL_HYPERPARAMS[family] || MODEL_HYPERPARAMS.default),
      duration: 8,
      aspect_ratio: '16:9',
      ...(baseImageUrl ? { image_url: baseImageUrl } : {}),
    };

    try {
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
      throw new Error(`Timeout após 5min — modelo: ${targetModel}, prompt: ${String(prompt || '').slice(0, 80)}...`);
    } catch (err) {
      lastError = err;
      const message = String(err.message || '').toLowerCase();
      const retryable = message.includes('quota') || message.includes('rate limit') || message.includes('resource exhausted') || message.includes('denied access') || message.includes('permission denied');
      if (keyIndex === resolvedKeys.length - 1 || !retryable) throw err;
    }
  }
  throw lastError || new Error(`Video generation failed — model: ${targetModel}`);
}
