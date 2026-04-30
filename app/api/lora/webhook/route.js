import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request) {
  if (request.headers.get('webhook-secret') !== process.env.REPLICATE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const supabase = createServiceClient();
  const patch = {};
  if (body.status === 'succeeded') {
    patch.status = 'ready';
    patch.lora_url = body.output?.weights || body.output?.lora || body.output;
    patch.cost_usd = body.metrics?.predict_time ? Number(body.metrics.predict_time) : null;
  } else if (body.status === 'failed') {
    patch.status = 'failed';
    patch.error_message = body.error || 'Training failed';
  } else {
    return NextResponse.json({ ok: true });
  }
  await supabase.from('user_loras').update(patch).eq('provider_training_id', body.id);
  return NextResponse.json({ ok: true });
}
