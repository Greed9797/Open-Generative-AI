import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase/service.js';
import { getSessionFromCookies } from '../../../../lib/supabase-vault.js';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { user } = await getSessionFromCookies().catch(() => ({ user: null }));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const ext = file.name?.split('.').pop() || 'bin';
    const path = `${user.id}/${randomUUID()}.${ext}`;
    const buffer = await file.arrayBuffer();

    const { error } = await supabase.storage
      .from('uploads')
      .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(path);
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
