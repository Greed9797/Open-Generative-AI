import { NextResponse } from 'next/server';
import { getSessionFromCookies, supabaseRest } from '../../../../lib/supabase-vault.js';

export const runtime = 'nodejs';

function publicProfile(row) {
  return {
    id: row?.id || null,
    userId: row?.user_id || null,
    displayName: row?.display_name || '',
    avatarUrl: row?.avatar_url || '',
  };
}

export async function GET() {
  try {
    const { user, accessToken } = await getSessionFromCookies();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rows = await supabaseRest(`profiles?select=id,user_id,display_name,avatar_url&user_id=eq.${user.id}&limit=1`, { accessToken });
    return NextResponse.json({ profile: publicProfile(rows[0]) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, accessToken } = await getSessionFromCookies();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const rows = await supabaseRest('profiles?on_conflict=user_id&select=id,user_id,display_name,avatar_url', {
      method: 'POST',
      accessToken,
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: {
        user_id: user.id,
        display_name: body.displayName ? String(body.displayName).trim() : null,
        avatar_url: body.avatarUrl ? String(body.avatarUrl).trim() : null,
        updated_at: new Date().toISOString(),
      },
    });
    return NextResponse.json({ profile: publicProfile(rows[0]) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
