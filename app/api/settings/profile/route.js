import { NextResponse } from 'next/server';
import { getSessionFromCookies, supabaseRest } from '../../../../lib/supabase-vault.js';
import { enforceContentLength } from '../../../../lib/security.mjs';

export const runtime = 'nodejs';

function publicProfile(row) {
  return {
    id: row?.id || null,
    userId: row?.user_id || null,
    displayName: row?.display_name || '',
    avatarUrl: row?.avatar_url || '',
  };
}

function cleanDisplayName(value) {
  const text = String(value || '').trim().slice(0, 80);
  return text.replace(/[\u0000-\u001f\u007f<>]/g, '') || null;
}

function cleanAvatarUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    const url = new URL(text, 'https://local.invalid');
    if (text.startsWith('/') && !text.startsWith('//')) return text.slice(0, 2048);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString().slice(0, 2048) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const { user, accessToken } = await getSessionFromCookies();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rows = await supabaseRest(`profiles?select=id,user_id,display_name,avatar_url&user_id=eq.${user.id}&limit=1`, { accessToken });
    return NextResponse.json({ profile: publicProfile(rows[0]) });
  } catch (error) {
    console.error(`[profile] get failed: ${error.message}`);
    return NextResponse.json({ error: 'Could not read profile' }, { status: 500 });
  }
}

async function updateProfile(request) {
  try {
    const tooLarge = enforceContentLength(request, 16 * 1024);
    if (tooLarge) return tooLarge;

    const { user, accessToken } = await getSessionFromCookies();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const rows = await supabaseRest('profiles?on_conflict=user_id&select=id,user_id,display_name,avatar_url', {
      method: 'POST',
      accessToken,
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: {
        user_id: user.id,
        display_name: cleanDisplayName(body.displayName),
        avatar_url: cleanAvatarUrl(body.avatarUrl),
        updated_at: new Date().toISOString(),
      },
    });
    return NextResponse.json({ profile: publicProfile(rows[0]) });
  } catch (error) {
    console.error(`[profile] update failed: ${error.message}`);
    return NextResponse.json({ error: 'Could not update profile' }, { status: 500 });
  }
}

export async function PATCH(request) {
  return updateProfile(request);
}

export async function POST(request) {
  return updateProfile(request);
}
