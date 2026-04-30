import { NextResponse } from 'next/server';
import { resolveApiKeyByReference, resolveApiKeysForModel } from '../../../../lib/resolve-api-key.js';
import { detectProvider, getAdapter, parsePollId, PROVIDER_DB_NAME } from '../../../../lib/providers/index.js';
import { normalizeGenerationRequest, toProviderPayload } from '../../../../lib/generation/contract.js';
import { buildProviderDecision } from '../../../../lib/generation/provider-decision.js';
import { buildGenerationAudit, persistGenerationTelemetry } from '../../../../lib/generation/telemetry.js';
import {
  enforceContentLength,
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireAuthenticatedUser,
} from '../../../../lib/security.mjs';

const KEY_PROVIDERS = {
  kling: { providerNames: ['Kling'], envFallbacks: [] },
  minimax: { providerNames: ['MiniMax'], envFallbacks: [{ key: 'MINIMAX_API_KEY', providerName: 'MiniMax', modelIdentifier: 'MiniMax-M2.7' }] },
  wan: { providerNames: ['Wan'], envFallbacks: [] },
  runway: { providerNames: ['Runway'], envFallbacks: [] },
  vertex: { providerNames: ['Vertex AI'], envFallbacks: [{ key: 'VERTEX_AI_API_KEY', providerName: 'Vertex AI', modelIdentifier: 'vertex:veo3.1-fast-text-to-video' }] },
  gemini: {
    providerNames: ['Gemini', 'Veo 3.1'],
    fallbackProviderNames: ['Vertex AI'],
    envFallbacks: [
      { key: 'GEMINI_API_KEY', providerName: 'Gemini', modelIdentifier: 'veo-3.1-generate-preview' },
      { key: 'VERTEX_AI_API_KEY', providerName: 'Vertex AI', modelIdentifier: 'vertex:veo3.1-fast-text-to-video' },
    ],
  },
  seedance: { providerNames: ['Seedance'], envFallbacks: [] },
};

function roleForModel(modelId, requestKind) {
  if (requestKind === 'image') return 'image_gen';
  const model = String(modelId || '').toLowerCase();
  if (model.startsWith('image:') || model === 'nano-banana' || model.startsWith('google-imagen')) return 'image_gen';
  return 'video_gen';
}

async function resolveKeys(userId, provider, modelId, { allowFallbackProviders = true, requestKind } = {}) {
  if (!userId || !provider) return [];
  const config = KEY_PROVIDERS[provider] || { providerNames: [PROVIDER_DB_NAME[provider]].filter(Boolean) };
  return resolveApiKeysForModel({
    userId,
    role: roleForModel(modelId, requestKind),
    modelId,
    providerNames: config.providerNames,
    fallbackProviderNames: allowFallbackProviders ? config.fallbackProviderNames : [],
    envFallbacks: allowFallbackProviders
      ? config.envFallbacks
      : (config.envFallbacks || []).filter((item) => config.providerNames?.includes(item.providerName)),
  });
}

function providerForResolvedKey(provider, resolved) {
  if (provider === 'gemini' && resolved?.providerName?.toLowerCase().includes('vertex')) return 'vertex';
  return provider;
}

function providerLabel(provider) {
  return PROVIDER_DB_NAME[provider] || provider;
}

function keyRefForResolved(resolved) {
  if (resolved?.keyId) return `db_${resolved.keyId}`;
  if (resolved?.envKey) return `env_${resolved.envKey}`;
  return null;
}

function keyedRequestId(requestId, resolved) {
  const keyRef = keyRefForResolved(resolved);
  const colonIdx = String(requestId || '').indexOf(':');
  if (!keyRef || colonIdx === -1) return requestId;
  const prefix = requestId.slice(0, colonIdx);
  const taskId = prefix.startsWith('kling') ? requestId : requestId.slice(colonIdx + 1);
  const encodedTaskId = Buffer.from(taskId, 'utf8').toString('base64url');
  return `${prefix}_key:${keyRef}:${encodedTaskId}`;
}

async function resolvePollKey(userId, provider, taskId, keyRef) {
  const config = KEY_PROVIDERS[provider] || { providerNames: [PROVIDER_DB_NAME[provider]].filter(Boolean) };
  if (keyRef) {
    return resolveApiKeyByReference({
      userId,
      keyRef,
      envFallbacks: config.envFallbacks || [],
    });
  }
  const [resolved] = await resolveKeys(userId, provider, taskId, { allowFallbackProviders: false });
  return resolved || null;
}

function shouldTryFallback(err) {
  const message = String(err?.message || '').toLowerCase();
  return (
    message.includes('denied access') ||
    message.includes('permission denied') ||
    message.includes('not been allowlisted') ||
    message.includes('not allowlisted') ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('resource exhausted') ||
    message.includes('429')
  );
}

function providerErrorResponse(err) {
  const message = err.message || 'Provider request failed';
  const lower = message.toLowerCase();
  if (
    lower.includes('denied access') ||
    lower.includes('do not have permission') ||
    lower.includes('permission denied') ||
    lower.includes('not been allowlisted') ||
    lower.includes('not allowlisted')
  ) {
    return NextResponse.json(
      {
        error: message,
        hint: 'This provider key is valid, but the project does not have access to the selected model. Use a Gemini API key for Gemini/Veo models or select a model enabled for this Vertex AI project.',
      },
      { status: 403 }
    );
  }
  return NextResponse.json({ error: message }, { status: 502 });
}

export async function GET(request, { params }) {
  const pathSegments = (await params).path || [];
  const pathStr = pathSegments.join('/');

  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const limited = rateLimit(`proxy-get:${user.id}:${getClientIp(request)}`, { limit: 60, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  if (pathStr.startsWith('api/v1/predictions/') && pathStr.endsWith('/result')) {
    const encodedId = pathSegments.slice(3, -1).join('/');
    const { provider, taskId, keyRef } = parsePollId(encodedId);

    if (!provider) {
      return NextResponse.json({ error: 'Unknown provider for this task ID.' }, { status: 400 });
    }

    const resolved = await resolvePollKey(user?.id, provider, taskId, keyRef);
    if (!resolved?.key) {
      return NextResponse.json(
        { error: `No API key configured for ${PROVIDER_DB_NAME[provider]}. Add it in Settings → API Keys.` },
        { status: 401 }
      );
    }

    try {
      const adapter = getAdapter(providerForResolvedKey(provider, resolved));
      const result = await adapter.poll(taskId, resolved.key);
      if (result.status === 'completed') {
        return NextResponse.json({
          status: 'completed',
          outputs: result.outputs || [result.url],
          url: result.url,
        });
      }
      return NextResponse.json({ status: result.status || 'processing' });
    } catch (err) {
      console.error(`[proxy poll] provider=${provider} taskId=${taskId} error=${err.message}`);
      return providerErrorResponse(err);
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request, { params }) {
  const tooLarge = enforceContentLength(request, 10 * 1024 * 1024);
  if (tooLarge) return tooLarge;

  const pathSegments = (await params).path || [];
  const pathStr = pathSegments.join('/');

  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const limited = rateLimit(`proxy-post:${user.id}:${getClientIp(request)}`, { limit: 20, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  if (
    pathStr.startsWith('api/v1/') &&
    !pathStr.startsWith('api/v1/upload_file') &&
    !pathStr.startsWith('api/v1/account')
  ) {
    let body;
    const rawBody = await request.arrayBuffer();
    try { body = JSON.parse(Buffer.from(rawBody).toString()); } catch { body = {}; }

    const modelId = String(body.model || pathSegments[2] || '').trim().slice(0, 120);
    const generationRequest = normalizeGenerationRequest(body, modelId);
    const provider = detectProvider(generationRequest.model);

    if (!provider) {
      return NextResponse.json(
        { error: `Model "${generationRequest.model}" is not supported for direct API access. Check your provider settings.` },
        { status: 400 }
      );
    }

    const strictProvider = Boolean(generationRequest.strictProvider || generationRequest.maxQuality);
    const resolvedKeys = await resolveKeys(user?.id, provider, generationRequest.model, {
      allowFallbackProviders: !strictProvider,
      requestKind: generationRequest.kind,
    });
    if (resolvedKeys.length === 0) {
      return NextResponse.json(
        { error: `No API key configured for ${PROVIDER_DB_NAME[provider]}. Add it in Settings → API Keys.` },
        { status: 401 }
      );
    }

try {
  let lastError;
  let attemptedProvider = false;
  for (let index = 0; index < resolvedKeys.length; index += 1) {
    const startedAt = Date.now();
    const resolved = resolvedKeys[index];
    const effectiveProvider = providerForResolvedKey(provider, resolved);
    if (strictProvider && provider === 'gemini' && effectiveProvider !== 'gemini') {
      continue;
    }
    attemptedProvider = true;
    const adapter = getAdapter(effectiveProvider);
        const submitBody = { ...body, ...toProviderPayload(generationRequest), model: generationRequest.model || modelId };
        if (effectiveProvider === 'vertex' && !String(submitBody.model).startsWith('vertex')) {
          submitBody.model = `vertex:${submitBody.model}`;
        }
        try {
          const result = await adapter.submit(submitBody, resolved.key);
          if (result?.request_id) result.request_id = keyedRequestId(result.request_id, resolved);
          if (result?.id) result.id = keyedRequestId(result.id, resolved);
          const decision = buildProviderDecision({
            requestedProvider: providerLabel(provider),
            effectiveProvider,
            adapter: effectiveProvider,
            resolved,
            request: generationRequest,
            fallbackUsed: index > 0,
            reason: index > 0 ? 'fallback_after_provider_error' : 'primary_provider',
          });
          result.audit = buildGenerationAudit({
            request: generationRequest,
            decision,
            submitBody,
            resolved,
            result,
            fallbackIndex: index,
            startedAt,
          });
          await persistGenerationTelemetry({ userId: user?.id, audit: result.audit, result });
          console.info('[proxy submit audit]', JSON.stringify(result.audit));
          return NextResponse.json(result);
        } catch (err) {
          lastError = err;
          console.error(`[proxy submit] provider=${provider} resolvedProvider=${resolved.providerName} model=${generationRequest.model} error=${err.message}`);
      if (index === resolvedKeys.length - 1 || !shouldTryFallback(err)) break;
    }
  }
  if (!attemptedProvider && strictProvider && provider === 'gemini') {
    throw new Error('Gemini parity mode requires a Gemini/Veo API key. Vertex fallback is disabled for exact comparison.');
  }
  throw lastError || new Error('Provider submission failed');
} catch (err) {
      console.error(`[proxy submit] provider=${provider} model=${generationRequest.model} error=${err.message}`);
      return providerErrorResponse(err);
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
