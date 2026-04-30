import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { assertSupabaseConfigured, getSessionFromCookies } from '../../../../../lib/supabase-vault.js';
import { enforceContentLength, validateUploadFile } from '../../../../../lib/security.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const tooLarge = enforceContentLength(request);
    if (tooLarge) return tooLarge;

    const { user, accessToken } = await getSessionFromCookies();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await request.formData();
    const file = form.get('file');
    const validated = await validateUploadFile(file, { maxBytes: Number(process.env.MAX_AVATAR_MB || 5) * 1024 * 1024 });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: validated.status });

    const { url, anonKey } = assertSupabaseConfigured();
    const path = `${user.id}/${randomUUID()}.${validated.extension}`;
    const uploadResponse = await fetch(`${url}/storage/v1/object/avatars/${path}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': validated.mimeType,
        'x-upsert': 'false',
      },
      body: validated.buffer,
    });
    const data = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) {
      console.error(`[avatar upload] user=${user.id} error=${data.message || data.error || uploadResponse.status}`);
      return NextResponse.json({ error: 'Avatar upload failed' }, { status: 500 });
    }

    const avatarUrl = `${url}/storage/v1/object/public/avatars/${path}`;
    await fetch(`${url}/rest/v1/profiles?user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ avatar_url: avatarUrl }),
    }).catch(() => null);

    return NextResponse.json({ avatarUrl });
  } catch (error) {
    console.error(`[avatar upload] error=${error.message}`);
    return NextResponse.json({ error: 'Avatar upload failed' }, { status: 500 });
  }
}
