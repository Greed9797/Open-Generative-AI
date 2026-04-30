import { getAdapter, detectProvider } from '../providers/index.js';
import { resolveApiKeysForModel } from '../resolve-api-key.js';
import { NEGATIVE_PROMPTS_IMAGE } from '../video-quality-config.js';

const DEFAULT_MODEL = 'google-imagen4-fast';

export class ImageProviderError extends Error {
  constructor(message, { retryable = false, provider = null, model = null, cause = null } = {}) {
    super(message);
    this.name = 'ImageProviderError';
    this.retryable = retryable;
    this.provider = provider;
    this.model = model;
    this.cause = cause;
  }
}

function isRetryableProviderMessage(message) {
  const text = String(message || '').toLowerCase();
  return /timeout|timed out|rate limit|429|500|502|503|504|service unavailable|temporarily|network|fetch failed|econnreset|etimedout/.test(text);
}

function normalizeTargetModel(model) {
  const value = String(model || '').trim();
  if (!value || value === 'auto') return DEFAULT_MODEL;
  return value;
}

function extractOutput(polled) {
  return polled?.url || polled?.output_url || polled?.outputs?.[0] || polled?.images?.[0]?.url || null;
}

async function resolveImageKey({ userId, provider, model }) {
  const providerNames = provider === 'gemini' ? ['Gemini'] : undefined;
  const envFallbacks = provider === 'gemini'
    ? [{ key: 'GEMINI_API_KEY', providerName: 'Gemini', modelIdentifier: 'google-imagen4-fast' }]
    : undefined;
  const keys = await resolveApiKeysForModel({
    userId,
    role: 'image_gen',
    modelId: model,
    providerNames,
    envFallbacks,
  });
  const resolved = keys[0];
  if (!resolved?.key) throw new Error('Nenhuma API key configurada para image_gen. Acesse Settings → API Keys.');
  return resolved;
}

export async function generateImageCandidate({
  prompt,
  referenceImages = [],
  targetModel,
  aspectRatio = '1:1',
  seed,
  userId,
}) {
  const model = normalizeTargetModel(targetModel);
  const provider = detectProvider(model) || 'gemini';
  const adapter = getAdapter(provider);
  if (!adapter?.submit) throw new ImageProviderError(`Provider de imagem não suportado: ${provider}`, { provider, model });
  const resolved = await resolveImageKey({ userId, provider, model }).catch((error) => {
    throw new ImageProviderError(error.message, { retryable: false, provider, model, cause: error });
  });
  const payload = {
    model,
    prompt,
    aspect_ratio: aspectRatio,
    negative_prompt: NEGATIVE_PROMPTS_IMAGE.join(', '),
    exact_prompt: true,
    provider_mode: 'production',
  };
  if (referenceImages.length) {
    payload.image_url = referenceImages[0];
    payload.images_list = referenceImages.slice(0, 8);
  }
  if (Number.isFinite(Number(seed))) payload.seed = Number(seed);

  let submitted;
  try {
    submitted = await adapter.submit(payload, resolved.key);
  } catch (error) {
    throw new ImageProviderError(error.message, {
      retryable: isRetryableProviderMessage(error.message),
      provider,
      model,
      cause: error,
    });
  }
  let imageUrl = extractOutput(submitted);
  if (!imageUrl && submitted?.request_id && adapter.poll) {
    const rawId = String(submitted.request_id);
    const taskId = rawId.includes(':') ? rawId.split(':').slice(1).join(':') : rawId;
    const started = Date.now();
    while (Date.now() - started < 180_000) {
      let polled;
      try {
        polled = await adapter.poll(taskId, resolved.key);
      } catch (error) {
        throw new ImageProviderError(error.message, {
          retryable: isRetryableProviderMessage(error.message),
          provider,
          model,
          cause: error,
        });
      }
      if (polled?.status === 'completed' || polled?.status === 'succeeded' || polled?.status === 'done') {
        imageUrl = extractOutput(polled);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  if (!imageUrl) throw new ImageProviderError(`Geração de imagem sem URL de saída — modelo: ${model}`, { retryable: true, provider, model });
  return {
    imageUrl,
    provider,
    providerModel: submitted?.audit?.providerModel || model,
    audit: submitted?.audit || null,
  };
}
