import { NextResponse } from 'next/server';
import { listPublicJobs } from '../../../../lib/agent-jobs.js';
import { bearerFromRequest, getSupabaseUser } from '../../../../lib/supabase-vault.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const supabaseUser = await getSupabaseUser(bearerFromRequest(request)).catch(() => null);
  const userId = supabaseUser?.id || null;
  const list = await listPublicJobs(userId);
  return NextResponse.json({ jobs: list });
}
