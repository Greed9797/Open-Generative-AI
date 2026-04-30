import { createServiceClient } from '../../../lib/supabase/service.js';
import { enforceContentLength, requireAuthenticatedUser, validateUploadFile } from '../../../lib/security.mjs';
import crypto from 'crypto';

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
        if (!validated.ok) return Response.json({ error: validated.error }, { status: validated.status });

        const supabase = createServiceClient();
        const path = `${user.id}/${crypto.randomUUID()}.${validated.extension}`;

        const { error: uploadError } = await supabase.storage
            .from('uploads')
            .upload(path, validated.buffer, {
                upsert: false,
                contentType: validated.mimeType,
            });

        if (uploadError) {
            console.error(`[upload] user=${user.id} error=${uploadError.message}`);
            return Response.json({ error: 'Upload failed' }, { status: 500 });
        }

        const { data } = supabase.storage.from('uploads').getPublicUrl(path);

        return Response.json({ url: data.publicUrl });
    } catch (err) {
        console.error(`[upload] error=${err.message}`);
        return Response.json({ error: 'Upload failed' }, { status: 500 });
    }
}
