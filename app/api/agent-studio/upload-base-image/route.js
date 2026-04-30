import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase/service.js';
import { enforceContentLength, requireAuthenticatedUser, validateUploadFile } from '../../../../lib/security.mjs';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const tooLarge = enforceContentLength(request);
        if (tooLarge) return tooLarge;

        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) return auth.response;
        const { user } = auth;

        const formData = await request.formData();
        const file = formData.get('file');
        const validated = await validateUploadFile(file);
        if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: validated.status });

        const supabase = createServiceClient();
        const path = `${user.id}/${randomUUID()}.${validated.extension}`;

        const { error } = await supabase.storage
            .from('uploads')
            .upload(path, validated.buffer, { contentType: validated.mimeType, upsert: false });

        if (error) {
            console.error(`[agent upload] user=${user.id} error=${error.message}`);
            return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
        }

    const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(path);
    return NextResponse.json({ url: publicUrl });
    } catch (err) {
        console.error(`[agent upload] error=${err.message}`);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
