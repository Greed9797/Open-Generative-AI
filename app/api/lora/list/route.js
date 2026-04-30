import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAuthenticatedUser } from '@/lib/security.mjs';

export async function GET(request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_loras')
    .select('*, lora_training_images(count)')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ loras: data || [] });
}
