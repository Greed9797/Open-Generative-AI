import { NextResponse } from 'next/server';
import { getPublicJob } from '../../../../../lib/agent-jobs.js';
import { requireAuthenticatedUser } from '../../../../../lib/security.mjs';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const { jobId } = await params;
  const job = await getPublicJob(jobId, auth.user.id);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json(job);
}
