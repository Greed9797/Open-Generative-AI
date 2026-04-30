import { createHash } from 'node:crypto';
import { createServiceClient } from '../supabase/service.js';
import { compilePromptForMode } from './contract.js';

const SECRET_KEY_RE = /(api[_-]?key|authorization|token|secret|password|key)$/i;
const BASE64_RE = /^[A-Za-z0-9+/=_-]{160,}$/;

export function hashPrompt(prompt = '') {
  return createHash('sha256').update(String(prompt)).digest('hex').slice(0, 32);
}

export function sanitizePayload(value, depth = 0) {
  if (depth > 8) return '[depth omitted]';
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item, depth + 1));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && BASE64_RE.test(value)) return `[base64 omitted: ${value.length} chars]`;
    return value;
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (SECRET_KEY_RE.test(key)) return [key, '[secret omitted]'];
    if (key.toLowerCase().includes('base64')) return [key, typeof item === 'string' ? `[base64 omitted: ${item.length} chars]` : '[base64 omitted]'];
    return [key, sanitizePayload(item, depth + 1)];
  }));
}

export function buildGenerationAudit({ request, decision, submitBody, result, resolved, fallbackIndex = 0, startedAt = Date.now() }) {
  const promptData = compilePromptForMode(request, { promptEnhancement: result?.audit?.promptEnhancement });
  const rawPayload = sanitizePayload(result?.audit?.rawPayload || submitBody);
  return {
    runId: request.runId,
    requestedProvider: decision.requestedProvider,
    effectiveProvider: decision.effectiveProvider,
    requestedModel: request.model,
    submittedModel: submitBody.model,
    providerModel: result?.audit?.providerModel || decision.providerModel || null,
    modelTier: decision.modelTier,
    registryVersion: decision.registryVersion,
    providerMode: request.providerMode,
    strictProvider: request.strictProvider,
    fallbackPolicy: decision.fallbackPolicy,
    fallbackUsed: decision.fallbackUsed || fallbackIndex > 0,
    fallbackReason: decision.reason,
    keyRef: decision.keyRef,
    keySource: resolved?.source || decision.keySource || null,
    promptHash: hashPrompt(promptData.originalPrompt),
    originalPrompt: promptData.originalPrompt,
    compiledPrompt: promptData.compiledPrompt,
    promptEnhancement: promptData.promptEnhancement,
    resolution: result?.audit?.resolution || request.resolution || null,
    durationSeconds: result?.audit?.durationSeconds || request.duration || null,
    aspectRatio: result?.audit?.aspectRatio || request.aspectRatio || null,
    seed: result?.audit?.seed || request.seed || null,
    exactPrompt: request.exactPrompt,
    maxQuality: request.maxQuality,
    rawPayload,
    status: result?.request_id || result?.id ? 'submitted' : 'completed',
    latencyMs: Date.now() - startedAt,
  };
}

export async function persistGenerationTelemetry({ userId, audit, result }) {
  try {
    const supabase = createServiceClient();
    await supabase.from('generation_runs').insert({
      run_id: audit.runId,
      user_id: userId || null,
      requested_model: audit.requestedModel,
      provider_model: audit.providerModel,
      effective_provider: audit.effectiveProvider,
      key_ref: audit.keyRef,
      fallback_used: audit.fallbackUsed,
      fallback_reason: audit.fallbackReason,
      prompt_hash: audit.promptHash,
      original_prompt: audit.originalPrompt,
      compiled_prompt: audit.compiledPrompt,
      raw_payload: audit.rawPayload,
      seed: audit.seed,
      resolution: audit.resolution,
      duration_seconds: audit.durationSeconds,
      aspect_ratio: audit.aspectRatio,
      status: audit.status,
      latency_ms: audit.latencyMs,
      output_url: result?.url || result?.outputs?.[0] || null,
      audit,
    });
  } catch (err) {
    console.warn('[generation telemetry] skipped:', err.message);
  }
}
