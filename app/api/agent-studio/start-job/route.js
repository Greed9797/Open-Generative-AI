import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { setJob, appendLog } from '../../../../lib/agent-jobs.js';
import { createServiceClient } from '../../../../lib/supabase/service.js';
import { runPipeline } from '../../../../lib/pipeline.js';
import { bearerFromRequest, getSupabaseUser } from '../../../../lib/supabase-vault.js';

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

export async function POST(request) {
  try {
    const body = await request.json();
    const supabaseUser = await getSupabaseUser(bearerFromRequest(request)).catch(() => null);
    const baseImageUrl = String(body.baseImageUrl || '').trim();
    if (!baseImageUrl) {
      return NextResponse.json({ error: 'baseImageUrl is required' }, { status: 400 });
    }
    const roughPrompt = String(body.roughPrompt || '');
    const targetModel = body.targetModel || 'seedance';
    const userId = supabaseUser?.id || null;

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

    const id = body.jobId || randomUUID();
    const now = new Date().toISOString();
    const job = {
      id,
      status: 'pending',
      baseImageUrl,
      roughPrompt,
      targetModel,
      style: body.style || 'cinematic',
      segments: makeSegments(),
      orchestratorPlan: null,
      finalVideoUrl: null,
      log: [],
      userId,
      apiKeys: {
        minimaxApiKey: request.headers.get('x-minimax-api-key') || '',
        geminiApiKey: request.headers.get('x-gemini-api-key') || '',
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
    return NextResponse.json({ error: error.message || 'Failed to start job' }, { status: 500 });
  }
}
