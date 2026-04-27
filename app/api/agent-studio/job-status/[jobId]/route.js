import { NextResponse } from 'next/server';
import { getPublicJob } from '../../../../../lib/agent-jobs.js';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  const { jobId } = await params;
  const job = await getPublicJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json(job);
}
