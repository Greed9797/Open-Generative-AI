import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAuthenticatedUser } from '@/lib/security.mjs';
import { NEGATIVE_PROMPTS_IMAGE } from '@/lib/video-quality-config';

async function pollPrediction(id) {
  for (let i = 0; i < 90; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
    });
    const data = await response.json().catch(() => ({}));
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(data.error || 'Prediction failed');
  }
  throw new Error('Timeout ao gerar ancora');
}

export async function POST(request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const { loraId, prompt, resolution } = await request.json().catch(() => ({}));
  const supabase = createServiceClient();
  const { data: lora } = await supabase.from('user_loras').select('*').eq('id', loraId).eq('user_id', auth.user.id).eq('status', 'ready').maybeSingle();
  if (!lora) return NextResponse.json({ error: 'LoRA nao encontrada ou ainda nao pronta' }, { status: 404 });

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'black-forest-labs/flux-dev-lora',
      input: {
        prompt: `${lora.trigger_word} ${prompt || ''}`,
        lora_weights: lora.lora_url,
        lora_scale: 0.9,
        negative_prompt: NEGATIVE_PROMPTS_IMAGE.join(', '),
        num_inference_steps: 28,
        guidance_scale: 3.5,
        width: resolution === 'square' ? 1024 : 1280,
        height: resolution === 'square' ? 1024 : 720,
      },
    }),
  });
  const submitted = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: submitted.detail || submitted.error || 'Replicate failed' }, { status: 502 });
  const done = await pollPrediction(submitted.id);
  const sourceUrl = Array.isArray(done.output) ? done.output[0] : done.output;
  const imageResponse = await fetch(sourceUrl);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const anchorId = randomUUID();
  const storagePath = `anchors/${auth.user.id}/${anchorId}.jpg`;
  await supabase.storage.from('renders').upload(storagePath, imageBuffer, { contentType: 'image/jpeg', upsert: true });
  const { data: { publicUrl } } = supabase.storage.from('renders').getPublicUrl(storagePath);
  await supabase.from('anchor_images').insert({
    id: anchorId,
    user_id: auth.user.id,
    lora_id: lora.id,
    prompt,
    image_url: publicUrl,
    provider: 'replicate',
  });
  return NextResponse.json({ anchorId, imageUrl: publicUrl });
}
