import { createClient as createServerSupabaseClient } from './supabase/server.js';
import { createServiceClient } from './supabase/service.js';

const ENV_FALLBACKS = {
  code_agent: [{ key: 'MINIMAX_API_KEY', providerName: 'MiniMax', modelIdentifier: 'MiniMax-M2.7' }],
  analysis_agent: [{ key: 'GEMINI_API_KEY', providerName: 'Gemini', modelIdentifier: 'gemini-2.5-flash' }],
  orchestrator: [{ key: 'MINIMAX_API_KEY', providerName: 'MiniMax', modelIdentifier: 'MiniMax-M2.7' }],
  image_gen: [
    { key: 'GEMINI_API_KEY', providerName: 'Gemini', modelIdentifier: 'gemini-2.5-flash' },
  ],
  video_gen: [
    { key: 'GEMINI_API_KEY', providerName: 'Gemini', modelIdentifier: 'veo-3.1-generate-preview' },
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
