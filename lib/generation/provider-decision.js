import { MODEL_REGISTRY_VERSION, resolveModelTier, resolveProviderModel } from './model-registry.js';

export function fallbackPolicyForRequest(request) {
  if (request.strictProvider || request.providerMode === 'parity' || request.providerMode === 'benchmark') return 'none';
  return 'quota_only';
}

export function buildProviderDecision({
  requestedProvider,
  effectiveProvider,
  adapter,
  resolved,
  request,
  fallbackUsed = false,
  reason = 'primary_provider',
}) {
  const providerModel = effectiveProvider === 'vertex' && !String(request.model || '').startsWith('vertex:')
    ? resolveProviderModel(`vertex:${request.model}`)
    : resolveProviderModel(request.model);

  return {
    registryVersion: MODEL_REGISTRY_VERSION,
    requestedProvider,
    effectiveProvider,
    providerModel,
    modelTier: resolveModelTier(request.model),
    adapter,
    keyRef: resolved?.keyId ? `db_${resolved.keyId}` : resolved?.envKey ? `env_${resolved.envKey}` : null,
    keySource: resolved?.source || null,
    fallbackPolicy: fallbackPolicyForRequest(request),
    fallbackUsed,
    reason,
  };
}
