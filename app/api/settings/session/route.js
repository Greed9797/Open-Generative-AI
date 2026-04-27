import { NextResponse } from 'next/server';
import { createAnonymousSession, getSupabaseUser, bearerFromRequest } from '../../../../lib/supabase-vault.js';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const user = await getSupabaseUser(bearerFromRequest(request));
    if (!user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: { id: user.id, email: user.email || null } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await createAnonymousSession();
    const response = NextResponse.json({
      expiresAt: session.expires_at,
      user: session.user ? { id: session.user.id, email: session.user.email || null } : null,
    });

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    };

    if (session.access_token) {
      response.cookies.set('sb-access-token', session.access_token, {
        ...cookieOpts,
        maxAge: 60 * 60,
      });
    }
    if (session.refresh_token) {
      response.cookies.set('sb-refresh-token', session.refresh_token, {
        ...cookieOpts,
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return response;
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
