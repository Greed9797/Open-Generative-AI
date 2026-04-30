import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { appendImageAgentLog, setImageAgentJob } from '@/lib/image-agent-jobs';
import { runImageAgentPipeline } from '@/lib/image-agent-pipeline';
import { getClientIp, rateLimit, rateLimitResponse, requireAuthenticatedUser } from '@/lib/security.mjs';

export const runtime = 'nodejs';
export const maxDuration = 300;

function clampCount(value) {
  const count = Number(value) || 1;
  return Math.max(1, Math.min(30, Math.floor(count)));
}

function cleanImages(images) {
  return Array.isArray(images)
    ? images.map((url) => String(url || '').trim()).filter((url) => /^https?:\/\//i.test(url)).slice(0, 12)
    : [];
}

export async function POST(request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const limited = rateLimit(`image-agent-start:${auth.user.id}:${getClientIp(request)}`, { limit: 8, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const body = await request.json().catch(() => ({}));
  const prompt = String(body.prompt || '').trim().slice(0, 4000);
  if (!prompt) return NextResponse.json({ error: 'Prompt obrigatório' }, { status: 400 });

  const id = randomUUID();
  const now = new Date().toISOString();
  const targetCount = clampCount(body.targetCount);
  const job = {
    id,
    userId: auth.user.id,
    status: 'pending',
    prompt,
    workflow: String(body.workflow || 'general').trim().slice(0, 80),
    targetModel: String(body.targetModel || 'google-imagen4-fast').trim().slice(0, 160),
    targetCount,
    aspectRatio: String(body.aspectRatio || '1:1').trim().slice(0, 20),
    qualityThreshold: Math.max(5, Math.min(9.5, Number(body.qualityThreshold) || 7)),
    seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : null,
    referenceImages: cleanImages(body.referenceImages),
    outputs: Array.from({ length: targetCount }, (_, index) => ({ index, status: 'pending', attempts: [] })),
    qaSummary: null,
    log: [],
    apiKeys: {
      geminiApiKey: String(request.headers.get('x-gemini-api-key') || '').trim().slice(0, 4096),
      minimaxApiKey: String(request.headers.get('x-minimax-api-key') || '').trim().slice(0, 4096),
    },
    createdAt: now,
    updatedAt: now,
  };
  setImageAgentJob(job);
  appendImageAgentLog(id, 'ImageOrchestrator', 'Job de imagem enfileirado');
  runImageAgentPipeline(id).catch((error) => {
    appendImageAgentLog(id, 'Sistema', `Background start failed: ${error.message}`);
  });

  return NextResponse.json({ jobId: id, targetCount });
}
