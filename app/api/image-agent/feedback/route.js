import { NextResponse } from 'next/server';
import { getImageAgentJob, updateImageAgentJob } from '@/lib/image-agent-jobs';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAuthenticatedUser } from '@/lib/security.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const job = getImageAgentJob(String(body.jobId || ''));
  if (!job || job.userId !== auth.user.id) return NextResponse.json({ error: 'Job não encontrado' }, { status: 404 });
  const outputIndex = Number(body.outputIndex);
  const outputs = [...(job.outputs || [])];
  const output = outputs[outputIndex];
  if (!output) return NextResponse.json({ error: 'Output não encontrado' }, { status: 404 });
  output.humanFeedback = {
    rating: String(body.rating || '').slice(0, 20),
    notes: String(body.notes || '').slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  outputs[outputIndex] = output;
  updateImageAgentJob(job.id, { outputs });
  try {
    const supabase = createServiceClient();
    await supabase.from('image_agent_feedback').insert({
      user_id: auth.user.id,
      job_id: job.id,
      output_index: outputIndex,
      rating: output.humanFeedback.rating,
      notes: output.humanFeedback.notes,
      output_url: output.imageUrl,
      qa_score: output.score || null,
    });
  } catch {
    /* local feedback still saved in job file */
  }
  return NextResponse.json({ ok: true });
}
