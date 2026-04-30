import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAuthenticatedUser } from '@/lib/security.mjs';

export async function DELETE(request, { params }) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: lora } = await supabase.from('user_loras').select('id,status').eq('id', id).eq('user_id', auth.user.id).maybeSingle();
  if (!lora) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (lora.status === 'training') return NextResponse.json({ error: 'Nao e possivel deletar durante treinamento' }, { status: 409 });
  await supabase.from('user_loras').delete().eq('id', id).eq('user_id', auth.user.id);
  return NextResponse.json({ ok: true });
}
