import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { setJob, appendLog } from '../../../../lib/agent-jobs.js';
import { createServiceClient } from '../../../../lib/supabase/service.js';
import { runPipeline } from '../../../../lib/pipeline.js';
import {
  enforceContentLength,
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireAuthenticatedUser,
} from '../../../../lib/security.mjs';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes (requires Pro plan on Vercel; Railway has no limit)

function makeSegments() {
  return ['A', 'B', 'C'].map((label, index) => ({
    index,
    label,
    status: 'pending',
    attempts: [],
    finalClipUrl: null,
  }));
}

function safeProvider(value) {
  const provider = String(value || 'seedance').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(provider) ? provider : 'seedance';
}

function safeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export async function POST(request) {
  try {
    const tooLarge = enforceContentLength(request, 64 * 1024);
    if (tooLarge) return tooLarge;

    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const { user: supabaseUser } = auth;

    const limited = rateLimit(`agent-start:${supabaseUser.id}:${getClientIp(request)}`, { limit: 8, windowMs: 60_000 });
    if (!limited.ok) return rateLimitResponse(limited);

    const body = await request.json();
    const baseImageUrl = safeHttpUrl(body.baseImageUrl);
    if (!baseImageUrl) {
      return NextResponse.json({ error: 'A valid baseImageUrl is required' }, { status: 400 });
    }
    const roughPrompt = safeText(body.roughPrompt, 4000);
    const targetModel = safeProvider(body.targetModel);
    const style = safeText(body.style || 'cinematic', 80) || 'cinematic';
    const userId = supabaseUser.id;

    // Deduplication: only when authenticated. Anonymous jobs would collide across users.
    if (userId) {
      try {
        const supabase = createServiceClient();
        const { data } = await supabase
          .from('agent_jobs')
          .select('id')
          .in('status', ['pending', 'running'])
          .eq('base_image_url', baseImageUrl)
          .eq('rough_prompt', roughPrompt)
          .eq('target_model', targetModel)
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();
        if (data) return NextResponse.json({ jobId: data.id, deduplicated: true });
      } catch {
        // If Supabase check fails, proceed without deduplication.
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const job = {
      id,
      status: 'pending',
      baseImageUrl,
      roughPrompt,
      targetModel,
      style,
      segments: makeSegments(),
      orchestratorPlan: null,
      finalVideoUrl: null,
      log: [],
      userId,
      apiKeys: {
        minimaxApiKey: String(request.headers.get('x-minimax-api-key') || '').trim().slice(0, 4096),
        geminiApiKey: String(request.headers.get('x-gemini-api-key') || '').trim().slice(0, 4096),
      },
      createdAt: now,
      updatedAt: now,
    };

    setJob(job);
    appendLog(id, 'Orchestrator', 'Queued job');
    runPipeline(id).catch((error) => {
      appendLog(id, 'Orchestrator', `Background start failed: ${error.message}`);
    });

    return NextResponse.json({ jobId: id });
  } catch (error) {
    console.error(`[agent start] error=${error.message}`);
    return NextResponse.json({ error: 'Failed to start job' }, { status: 500 });
  }
}
