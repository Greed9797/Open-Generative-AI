import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { assertSupabaseConfigured, getSessionFromCookies } from '../../../../../lib/supabase-vault.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { user, accessToken } = await getSessionFromCookies();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const { url, anonKey } = assertSupabaseConfigured();
    const ext = String(file.name || 'avatar.jpg').split('.').pop() || 'jpg';
    const path = `${user.id}/${randomUUID()}.${ext}`;
    const uploadResponse = await fetch(`${url}/storage/v1/object/avatars/${path}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: Buffer.from(await file.arrayBuffer()),
    });
    const data = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) throw new Error(data.message || data.error || 'Avatar upload failed');

    return NextResponse.json({ avatarUrl: `${url}/storage/v1/object/public/avatars/${path}` });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
