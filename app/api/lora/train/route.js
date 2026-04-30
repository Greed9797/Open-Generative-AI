import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAuthenticatedUser, validateUploadFile } from '@/lib/security.mjs';

async function archiveToBuffer(files) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
  });
  archive.pipe(stream);
  files.forEach((file) => archive.append(file.buffer, { name: file.name }));
  await archive.finalize();
  return done;
}

export async function POST(request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;
  const form = await request.formData();
  const name = String(form.get('name') || '').trim();
  const triggerWord = String(form.get('trigger_word') || form.get('triggerWord') || '').trim();
  const files = form.getAll('images');
  if (!name || !triggerWord) return NextResponse.json({ error: 'Nome e trigger word sao obrigatorios' }, { status: 400 });
  if (files.length < 10 || files.length > 30) return NextResponse.json({ error: 'Envie entre 10 e 30 imagens' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: lora, error: loraError } = await supabase.from('user_loras').insert({
    user_id: userId,
    name,
    trigger_word: triggerWord,
    training_images_count: files.length,
    status: 'pending',
  }).select('id').single();
  if (loraError) return NextResponse.json({ error: loraError.message }, { status: 500 });

  const validatedFiles = [];
  for (const file of files) {
    const validated = await validateUploadFile(file, { maxBytes: 50 * 1024 * 1024 });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: validated.status });
    const storagePath = `${userId}/${lora.id}/${file.name.replace(/[^a-z0-9_.-]/gi, '_')}`;
    const { error } = await supabase.storage.from('lora-training-images').upload(storagePath, validated.buffer, {
      contentType: validated.mimeType,
      upsert: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: { publicUrl } } = supabase.storage.from('lora-training-images').getPublicUrl(storagePath);
    await supabase.from('lora_training_images').insert({ lora_id: lora.id, storage_path: storagePath, public_url: publicUrl });
    validatedFiles.push({ name: file.name, buffer: validated.buffer });
  }

  const zipBuffer = await archiveToBuffer(validatedFiles);
  const zipPath = `${userId}/${lora.id}/training.zip`;
  const { error: zipError } = await supabase.storage.from('lora-training-images').upload(zipPath, zipBuffer, {
    contentType: 'application/zip',
    upsert: true,
  });
  if (zipError) return NextResponse.json({ error: zipError.message }, { status: 500 });
  const { data: signed } = await supabase.storage.from('lora-training-images').createSignedUrl(zipPath, 60 * 60);

  const response = await fetch('https://api.replicate.com/v1/trainings', {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      destination: `${process.env.REPLICATE_USERNAME}/lora-${lora.id}`,
      input: { input_images: signed?.signedUrl, trigger_word: triggerWord, steps: 1000, lora_rank: 16 },
      webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/lora/webhook`,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    await supabase.from('user_loras').update({ status: 'failed', error_message: data.detail || data.error || 'Replicate training failed' }).eq('id', lora.id);
    return NextResponse.json({ error: data.detail || data.error || 'Replicate training failed' }, { status: 502 });
  }

  await supabase.from('user_loras').update({ status: 'training', provider_training_id: data.id }).eq('id', lora.id);
  return NextResponse.json({ loraId: lora.id, status: 'training' });
}
