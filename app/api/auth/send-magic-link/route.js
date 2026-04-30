import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enforceContentLength, getClientIp, rateLimit, rateLimitResponse } from '../../../../lib/security.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const tooLarge = enforceContentLength(request, 8 * 1024);
    if (tooLarge) return tooLarge;

    const limited = rateLimit(`magic-link:${getClientIp(request)}`, { limit: 5, windowMs: 15 * 60_000 });
    if (!limited.ok) return rateLimitResponse(limited);

    const { email } = await request.json();
    const trimmedEmail = String(email || '').trim().toLowerCase();

    if (!trimmedEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase environment variables are not configured' }, { status: 500 });
    }

    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin).origin;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${origin}/api/auth/callback?next=/studio`,
      },
    });

    if (error) {
      console.error(`[auth magic-link] error=${error.message}`);
      return NextResponse.json({ error: 'Could not send magic link' }, { status: 400 });
    }

    return NextResponse.json({ message: 'Verifique seu email para o link de acesso' });
  } catch (error) {
    console.error(`[auth magic-link] error=${error.message}`);
    return NextResponse.json({ error: 'Could not send magic link' }, { status: 500 });
  }
}
