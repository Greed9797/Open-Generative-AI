import { createClient as createServerSupabaseClient } from './supabase/server.js';
import { createServiceClient } from './supabase/service.js';

const ENV_FALLBACKS = {
  code_agent: [{ key: 'MINIMAX_API_KEY', providerName: 'MiniMax', modelIdentifier: 'MiniMax-M2.7' }],
  analysis_agent: [{ key: 'GEMINI_API_KEY', providerName: 'Gemini', modelIdentifier: 'gemini-2.5-flash' }],
  orchestrator: [{ key: 'MINIMAX_API_KEY', providerName: 'MiniMax', modelIdentifier: 'MiniMax-M2.7' }],
  image_gen: [
    { key: 'GEMINI_API_KEY', providerName: 'Gemini', modelIdentifier: 'gemini-2.5-flash' },
    { key: 'VERTEX_AI_API_KEY', providerName: 'Vertex AI', modelIdentifier: 'vertex:google-imagen4-fast' },
  ],
  video_gen: [
    { key: 'GEMINI_API_KEY', providerName: 'Gemini', modelIdentifier: 'veo-3.1-generate-preview' },
    { key: 'VERTEX_AI_API_KEY', providerName: 'Vertex AI', modelIdentifier: 'vertex:veo3.1-fast-text-to-video' },
  ],
};

function resolveFallback(role, fallbackKeys = {}) {
  if (role === 'orchestrator' || role === 'code_agent') {
    const key = process.env.MINIMAX_API_KEY || fallbackKeys.minimaxApiKey;
    if (key) return { key, providerName: 'MiniMax', modelIdentifier: 'MiniMax-M2.7' };
  }
  if (role === 'analysis_agent') {
    const key = process.env.GEMINI_API_KEY || fallbackKeys.geminiApiKey;
    if (key) return { key, providerName: 'Gemini', modelIdentifier: 'gemini-2.5-flash' };
  }
  const envMatch = (ENV_FALLBACKS[role] || []).find((item) => process.env[item.key]);
  if (!envMatch) return null;
  return { key: process.env[envMatch.key], providerName: envMatch.providerName, modelIdentifier: envMatch.modelIdentifier };
}

export async function resolveApiKey({ userId, role, fallbackKeys = {} }) {
  let effectiveUserId = userId;

  if (!effectiveUserId) {
    effectiveUserId = await getServerSessionUserId().catch(() => null);
  }

  if (!userId) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data } = await supabase.rpc('resolve_key_by_role', { p_role: role });
      const row = Array.isArray(data) ? data[0] : null;
      if (row?.decrypted_key) {
        return {
          key: row.decrypted_key,
          keyId: row.id,
          providerName: row.provider_name,
          modelIdentifier: row.model_identifier || undefined,
          source: 'vault_rpc',
        };
      }
    } catch {
      // Fall through to service-role lookup and environment fallbacks.
    }
  }

  if (effectiveUserId) {
    const serviceClient = createServiceClient();
    const { data: row } = await serviceClient
      .from('user_api_keys')
      .select('id,provider_name,model_identifier')
      .eq('user_id', effectiveUserId)
      .eq('is_active', true)
      .contains('roles', [role])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (row) {
      const { data: decryptedKey, error } = await serviceClient.rpc('get_decrypted_key_for_user', {
        p_key_id: row.id,
        p_user_id: effectiveUserId,
      });
      if (error) throw new Error(error.message || 'Could not decrypt API key');

      return {
        key: decryptedKey,
        providerName: row.provider_name,
        modelIdentifier: row.model_identifier || undefined,
      };
    }
  }

  const fallback = resolveFallback(role, fallbackKeys);
  if (fallback) return fallback;
  throw new Error(`Nenhuma API key configurada para: ${role}. Acesse Settings → API Keys.`);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeModel(value) {
  return normalizeName(value)
    .replace(/^vertex[:_-]/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function modelFamily(value) {
  const model = normalizeModel(value);
  if (!model) return '';
  if (model.includes('veo31') || model.includes('veo3')) return 'veo';
  if (model.includes('imagen') || model.includes('nanobanana')) return 'imagen';
  if (model.includes('seedance')) return 'seedance';
  if (model.includes('runway') || model.includes('gen4')) return 'runway';
  if (model.includes('wan')) return 'wan';
  if (model.includes('kling')) return 'kling';
  if (model.includes('gemini')) return 'gemini';
  return model.slice(0, 12);
}

function scoreKeyForModel(row, {
  modelId,
  providerNames = [],
  fallbackProviderNames = [],
} = {}) {
  const provider = normalizeName(row.provider_name);
  const model = normalizeModel(row.model_identifier);
  const requested = normalizeModel(modelId);
  const directProviders = providerNames.map(normalizeName);
  const fallbackProviders = fallbackProviderNames.map(normalizeName);
  const isDirectProvider = directProviders.includes(provider);
  const isFallbackProvider = fallbackProviders.includes(provider);

  if (requested && model && model === requested && isDirectProvider) return directProviders.indexOf(provider);
  if (requested && model && model === requested && !isFallbackProvider) return 5;
  if (isDirectProvider) return 10 + directProviders.indexOf(provider);
  if (requested && model && modelFamily(model) === modelFamily(requested) && !isFallbackProvider) return 20;
  if (requested && model && model === requested && isFallbackProvider) return 40 + fallbackProviders.indexOf(provider);
  if (isFallbackProvider) return 50 + fallbackProviders.indexOf(provider);
  return 100;
}

async function decryptUserKey(row, userId) {
  const serviceClient = createServiceClient();
  const { data: decryptedKey, error } = await serviceClient.rpc('get_decrypted_key_for_user', {
    p_key_id: row.id,
    p_user_id: userId,
  });
  if (error || !decryptedKey) return null;
  return {
    key: decryptedKey,
    keyId: row.id,
    providerName: row.provider_name,
    modelIdentifier: row.model_identifier || undefined,
    source: 'database',
  };
}

export async function resolveApiKeysForModel({
  userId,
  role,
  modelId,
  providerNames = [],
  fallbackProviderNames = [],
  envFallbacks = [],
} = {}) {
  const candidates = [];

  if (userId && role) {
    const serviceClient = createServiceClient();
    const { data: rows = [] } = await serviceClient
      .from('user_api_keys')
      .select('id,provider_name,model_identifier,created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .contains('roles', [role])
      .order('created_at', { ascending: false });

    rows
      .map((row, index) => ({
        row,
        index,
        score: scoreKeyForModel(row, { modelId, providerNames, fallbackProviderNames }),
      }))
      .filter((item) => item.score < 100)
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .forEach((item) => candidates.push(item.row));
  }

  const resolved = [];
  for (const row of candidates) {
    const decrypted = await decryptUserKey(row, userId);
    if (decrypted?.key) resolved.push(decrypted);
  }

  for (const fallback of envFallbacks) {
    const key = process.env[fallback.key];
    if (!key) continue;
    resolved.push({
      key,
      envKey: fallback.key,
      providerName: fallback.providerName,
      modelIdentifier: fallback.modelIdentifier,
      source: 'env',
    });
  }

  return resolved;
}

export async function resolveApiKeyByReference({ userId, keyRef, envFallbacks = [] } = {}) {
  if (!keyRef) return null;
  if (keyRef.startsWith('db_')) {
    const keyId = keyRef.slice(3);
    if (!userId || !keyId) return null;
    const serviceClient = createServiceClient();
    const { data: row } = await serviceClient
      .from('user_api_keys')
      .select('id,provider_name,model_identifier')
      .eq('id', keyId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (!row) return null;
    return decryptUserKey(row, userId);
  }

  if (keyRef.startsWith('env_')) {
    const envName = keyRef.slice(4);
    const fallback = envFallbacks.find((item) => item.key === envName);
    const key = process.env[envName];
    if (!fallback || !key) return null;
    return {
      key,
      envKey: envName,
      providerName: fallback.providerName,
      modelIdentifier: fallback.modelIdentifier,
      source: 'env',
    };
  }

  return null;
}

async function getServerSessionUserId() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id || null;
}

// Lookup a user's API key by provider name (case-insensitive)
export async function resolveApiKeyByProvider(userId, providerName) {
  if (!userId || !providerName) return null;
  const serviceClient = createServiceClient();
  const { data: row } = await serviceClient
    .from('user_api_keys')
    .select('id,provider_name')
    .eq('user_id', userId)
    .eq('is_active', true)
    .ilike('provider_name', providerName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return null;
  const { data: decryptedKey, error } = await serviceClient.rpc('get_decrypted_key_for_user', {
    p_key_id: row.id,
    p_user_id: userId,
  });
  if (error) return null;
  return { key: decryptedKey, providerName: row.provider_name };
}
