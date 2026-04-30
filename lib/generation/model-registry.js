export const MODEL_REGISTRY_VERSION = 'quality-os-v1';

const MODELS = {
  'nano-banana': {
    kind: 'image',
    mode: 't2i',
    provider: 'gemini',
    providerModel: 'imagen-4.0-fast-generate-001',
    tier: 'fast',
    family: 'imagen',
  },
  'google-imagen4': {
    kind: 'image',
    mode: 't2i',
    provider: 'gemini',
    providerModel: 'imagen-4.0-generate-001',
    tier: 'standard',
    family: 'imagen',
  },
  'google-imagen4-fast': {
    kind: 'image',
    mode: 't2i',
    provider: 'gemini',
    providerModel: 'imagen-4.0-fast-generate-001',
    tier: 'fast',
    family: 'imagen',
  },
  'google-imagen4-ultra': {
    kind: 'image',
    mode: 't2i',
    provider: 'gemini',
    providerModel: 'imagen-4.0-ultra-generate-001',
    tier: 'full',
    family: 'imagen',
  },
  'veo3.1-lite-text-to-video': {
    kind: 'video',
    mode: 't2v',
    provider: 'gemini',
    providerModel: 'veo-3.1-lite-generate-preview',
    tier: 'lite',
    family: 'veo',
  },
  'veo3.1-fast-text-to-video': {
    kind: 'video',
    mode: 't2v',
    provider: 'gemini',
    providerModel: 'veo-3.1-fast-generate-preview',
    tier: 'fast',
    family: 'veo',
  },
  'veo3.1-text-to-video': {
    kind: 'video',
    mode: 't2v',
    provider: 'gemini',
    providerModel: 'veo-3.1-generate-preview',
    tier: 'full',
    family: 'veo',
  },
  'veo3.1-lite-image-to-video': {
    kind: 'video',
    mode: 'i2v',
    provider: 'gemini',
    providerModel: 'veo-3.1-lite-generate-preview',
    tier: 'lite',
    family: 'veo',
  },
  'veo3.1-fast-image-to-video': {
    kind: 'video',
    mode: 'i2v',
    provider: 'gemini',
    providerModel: 'veo-3.1-fast-generate-preview',
    tier: 'fast',
    family: 'veo',
  },
  'veo3.1-image-to-video': {
    kind: 'video',
    mode: 'i2v',
    provider: 'gemini',
    providerModel: 'veo-3.1-generate-preview',
    tier: 'full',
    family: 'veo',
  },
};

const PREFIX_PROVIDERS = [
  ['vertex:', 'vertex'],
  ['kling', 'kling'],
  ['minimax', 'minimax'],
  ['wan', 'wan'],
  ['runway', 'runway'],
  ['seedance', 'seedance'],
  ['veo', 'gemini'],
  ['google-imagen', 'gemini'],
  ['gemini-', 'gemini'],
];

export function normalizeModelId(modelId) {
  return String(modelId || '').trim();
}

export function getModelDefinition(modelId) {
  const id = normalizeModelId(modelId);
  return MODELS[id] || null;
}

export function detectProviderFromRegistry(modelId) {
  const id = normalizeModelId(modelId);
  if (!id) return null;
  const known = getModelDefinition(id);
  if (known) return known.provider;
  const lower = id.toLowerCase();
  if (lower === 'nano-banana') return 'gemini';
  const match = PREFIX_PROVIDERS.find(([prefix]) => lower.startsWith(prefix));
  return match?.[1] || null;
}

export function resolveProviderModel(modelId) {
  const id = normalizeModelId(modelId);
  const known = getModelDefinition(id);
  if (known) return known.providerModel;
  if (id.startsWith('vertex:')) return id.slice('vertex:'.length);
  return id;
}

export function resolveModelTier(modelId) {
  const known = getModelDefinition(modelId);
  if (known?.tier) return known.tier;
  const id = normalizeModelId(modelId).toLowerCase();
  if (id.includes('lite')) return 'lite';
  if (id.includes('fast')) return 'fast';
  if (id.includes('ultra') || id.includes('pro')) return 'full';
  return 'standard';
}

export function isImageModel(modelId) {
  const known = getModelDefinition(modelId);
  if (known) return known.kind === 'image';
  const id = normalizeModelId(modelId).toLowerCase();
  return id === 'nano-banana' || id.includes('imagen') || id.includes('image');
}

export function modelFamily(modelId) {
  const known = getModelDefinition(modelId);
  if (known?.family) return known.family;
  const id = normalizeModelId(modelId).toLowerCase().replace(/^vertex[:_-]/, '');
  if (id.includes('veo')) return 'veo';
  if (id.includes('imagen') || id.includes('nano-banana')) return 'imagen';
  if (id.includes('seedance')) return 'seedance';
  if (id.includes('runway') || id.includes('gen4')) return 'runway';
  if (id.includes('wan')) return 'wan';
  if (id.includes('kling')) return 'kling';
  if (id.includes('gemini')) return 'gemini';
  return id.slice(0, 16) || 'unknown';
}

export function listRegisteredModels() {
  return Object.entries(MODELS).map(([id, definition]) => ({ id, ...definition }));
}
