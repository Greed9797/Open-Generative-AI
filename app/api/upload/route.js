import { createServiceClient } from '../../../lib/supabase/service.js';
import { getSessionFromCookies } from '../../../lib/supabase-vault.js';
import crypto from 'crypto';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const { user } = await getSessionFromCookies().catch(() => ({ user: null }));
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
        }

        const supabase = createServiceClient();
        const filename = file.name || 'upload';
        const path = `${user.id}/${crypto.randomUUID()}-${filename}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from('uploads')
            .upload(path, buffer, {
                upsert: true,
                contentType: file.type || 'application/octet-stream',
            });

        if (uploadError) {
            return Response.json({ error: uploadError.message }, { status: 500 });
        }

        const { data } = supabase.storage.from('uploads').getPublicUrl(path);

        return Response.json({ url: data.publicUrl });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
}
