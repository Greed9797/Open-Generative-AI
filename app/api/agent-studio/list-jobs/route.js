import { NextResponse } from 'next/server';
import { listPublicJobs } from '../../../../lib/agent-jobs.js';
import { requireAuthenticatedUser } from '../../../../lib/security.mjs';

export const runtime = 'nodejs';

export async function GET(request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const list = await listPublicJobs(auth.user.id);
  return NextResponse.json({ jobs: list });
}
