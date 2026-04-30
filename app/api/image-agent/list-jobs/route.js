import { NextResponse } from 'next/server';
import { listPublicImageAgentJobs } from '@/lib/image-agent-jobs';
import { requireAuthenticatedUser } from '@/lib/security.mjs';

export const runtime = 'nodejs';

export async function GET(request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const jobs = await listPublicImageAgentJobs(auth.user.id);
  return NextResponse.json({ jobs });
}
