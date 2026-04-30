import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeRedirectPath, validateUploadFile } from '../lib/security.mjs';
import { detectProvider, parsePollId } from '../lib/providers/index.js';
import { normalizeGenerationRequest, toProviderPayload } from '../lib/generation/contract.js';
import { detectProviderFromRegistry, resolveProviderModel, resolveModelTier } from '../lib/generation/model-registry.js';
import { sanitizePayload } from '../lib/generation/telemetry.js';
import { QUALITY_BENCHMARK_CASES } from '../lib/generation/benchmark-cases.js';

test('safeRedirectPath accepts internal relative paths', () => {
  assert.equal(safeRedirectPath('/studio'), '/studio');
  assert.equal(safeRedirectPath('/studio/settings?tab=api'), '/studio/settings?tab=api');
});

test('safeRedirectPath blocks external and protocol-relative redirects', () => {
  assert.equal(safeRedirectPath('https://evil.example'), '/studio');
  assert.equal(safeRedirectPath('//evil.example'), '/studio');
  assert.equal(safeRedirectPath('/%2f%2fevil.example'), '/studio');
  assert.equal(safeRedirectPath('/\\evil.example'), '/studio');
});

test('validateUploadFile accepts a valid png file', async () => {
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
  ]);
  const file = new File([pngBytes], 'avatar.png', { type: 'image/png' });

  const result = await validateUploadFile(file, { maxBytes: 1024 });
  assert.equal(result.ok, true);
  assert.equal(result.extension, 'png');
  assert.equal(result.mimeType, 'image/png');
});

test('validateUploadFile rejects mismatched file content', async () => {
  const file = new File([Buffer.from('not an image')], 'avatar.png', { type: 'image/png' });

  const result = await validateUploadFile(file, { maxBytes: 1024 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 415);
});

test('validateUploadFile rejects oversized files', async () => {
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
  ]);
  const file = new File([pngBytes], 'avatar.png', { type: 'image/png' });

  const result = await validateUploadFile(file, { maxBytes: 4 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 413);
});

test('provider registry detects Vertex AI models and poll ids', () => {
  assert.equal(detectProvider('vertex:veo3.1-fast-text-to-video'), 'vertex');
  assert.deepEqual(parsePollId('vertex:projects/demo/locations/us-central1/operations/123'), {
    provider: 'vertex',
    taskId: 'projects/demo/locations/us-central1/operations/123',
  });
  assert.deepEqual(parsePollId('vertex_image:DONE:https%3A%2F%2Fexample.com%2Fimage.png'), {
    provider: 'vertex',
    taskId: 'image:DONE:https%3A%2F%2Fexample.com%2Fimage.png',
  });
});

test('provider registry preserves key references in poll ids', () => {
  const taskId = 'models/veo-3.1-fast-generate-preview/operations/bzfapdeaz6lq';
  const encodedTaskId = Buffer.from(taskId, 'utf8').toString('base64url');

  assert.deepEqual(parsePollId(`gemini_key:db_abc123:${encodedTaskId}`), {
    provider: 'gemini',
    keyRef: 'db_abc123',
    taskId,
  });
});

test('quality os model registry resolves Gemini tiers and aliases', () => {
  assert.equal(detectProviderFromRegistry('veo3.1-lite-text-to-video'), 'gemini');
  assert.equal(resolveProviderModel('veo3.1-lite-text-to-video'), 'veo-3.1-lite-generate-preview');
  assert.equal(resolveModelTier('veo3.1-text-to-video'), 'full');
  assert.equal(detectProvider('google-imagen4-ultra'), 'gemini');
});

test('quality os contract preserves parity as exact strict payload', () => {
  const request = normalizeGenerationRequest({
    model: 'veo3.1-text-to-video',
    prompt: 'literal prompt',
    provider_mode: 'gemini_parity',
    exact_prompt: true,
    disable_fallback: true,
    seed: 424242,
  });

  assert.equal(request.providerMode, 'parity');
  assert.equal(request.exactPrompt, true);
  assert.equal(request.strictProvider, true);
  assert.equal(request.seed, 424242);

  const payload = toProviderPayload(request);
  assert.equal(payload.prompt, 'literal prompt');
  assert.equal(payload.exact_prompt, true);
  assert.equal(payload.disable_fallback, true);
});

test('quality os sanitizer removes secrets and base64 payloads', () => {
  const clean = sanitizePayload({
    apiKey: 'secret',
    Authorization: 'Bearer secret',
    image: { bytesBase64Encoded: 'a'.repeat(220) },
    prompt: 'keep me',
  });

  assert.equal(clean.apiKey, '[secret omitted]');
  assert.equal(clean.Authorization, '[secret omitted]');
  assert.match(clean.image.bytesBase64Encoded, /base64 omitted/);
  assert.equal(clean.prompt, 'keep me');
});

test('quality os benchmark includes required first-pass coverage', () => {
  assert.equal(QUALITY_BENCHMARK_CASES.filter((item) => item.mode === 't2v').length, 30);
  assert.equal(QUALITY_BENCHMARK_CASES.filter((item) => item.mode === 'i2v').length, 20);
  assert.equal(QUALITY_BENCHMARK_CASES.filter((item) => item.mode === 't2i').length, 10);
  assert.equal(QUALITY_BENCHMARK_CASES.every((item) => item.seeds.length === 3), true);
});
