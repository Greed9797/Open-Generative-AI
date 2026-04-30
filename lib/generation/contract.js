import { randomUUID } from 'node:crypto';
import { isImageModel } from './model-registry.js';

function cleanString(value, max = 4000) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text.slice(0, max) : undefined;
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function providerModeFromPayload(payload = {}) {
  const explicit = cleanString(payload.providerMode || payload.provider_mode, 40);
  if (['parity', 'production', 'benchmark'].includes(explicit)) return explicit;
  if (payload.exactPrompt || payload.exact_prompt || payload.disableFallback || payload.disable_fallback) return 'parity';
  return 'production';
}

export function normalizeGenerationRequest(payload = {}, fallbackModel = '') {
  const model = cleanString(payload.model || fallbackModel, 160);
  const kind = payload.kind || (isImageModel(model) ? 'image' : 'video');
  const imageUrl = cleanString(payload.imageUrl || payload.image_url, 4000);
  const images = Array.isArray(payload.images)
    ? payload.images.map((url) => cleanString(url, 4000)).filter(Boolean)
    : Array.isArray(payload.images_list)
      ? payload.images_list.map((url) => cleanString(url, 4000)).filter(Boolean)
      : undefined;
  const mode = payload.mode && ['t2i', 'i2i', 't2v', 'i2v'].includes(payload.mode)
    ? payload.mode
    : kind === 'image'
      ? (imageUrl || images?.length ? 'i2i' : 't2i')
      : (imageUrl || images?.length ? 'i2v' : 't2v');
  const providerMode = providerModeFromPayload(payload);
  const exactPrompt = Boolean(payload.exactPrompt || payload.exact_prompt || providerMode === 'parity');
  const strictProvider = Boolean(payload.strictProvider || payload.strict_provider || payload.disableFallback || payload.disable_fallback || providerMode === 'parity');

  return {
    runId: cleanString(payload.run_id || payload.runId, 120) || randomUUID(),
    kind,
    mode,
    model,
    prompt: cleanString(payload.prompt, 12000) || '',
    imageUrl,
    images,
    aspectRatio: cleanString(payload.aspectRatio || payload.aspect_ratio, 40),
    resolution: cleanString(payload.resolution || payload.quality, 40),
    duration: cleanNumber(payload.duration),
    seed: cleanNumber(payload.seed),
    strictProvider,
    providerMode,
    exactPrompt,
    maxQuality: Boolean(payload.maxQuality || payload.max_quality),
  };
}

export function toProviderPayload(request) {
  const payload = {
    model: request.model,
    prompt: request.prompt,
    provider_mode: request.providerMode,
    exact_prompt: request.exactPrompt,
    disable_fallback: request.strictProvider,
    max_quality: request.maxQuality,
    run_id: request.runId,
  };
  if (request.imageUrl) payload.image_url = request.imageUrl;
  if (request.images?.length) payload.images_list = request.images;
  if (request.aspectRatio) payload.aspect_ratio = request.aspectRatio;
  if (request.resolution) payload.resolution = request.resolution;
  if (request.duration) payload.duration = request.duration;
  if (request.seed !== undefined) payload.seed = request.seed;
  return payload;
}

export function compilePromptForMode(request, { promptEnhancement } = {}) {
  if (request.providerMode === 'parity' || request.exactPrompt) {
    return {
      originalPrompt: request.prompt,
      compiledPrompt: request.prompt,
      promptEnhancement: promptEnhancement || { enhanced: false, provider: null, reason: 'parity_exact_prompt' },
    };
  }
  return {
    originalPrompt: request.prompt,
    compiledPrompt: promptEnhancement?.prompt || request.prompt,
    promptEnhancement: promptEnhancement || { enhanced: false, provider: null, reason: 'provider_adapter' },
  };
}
