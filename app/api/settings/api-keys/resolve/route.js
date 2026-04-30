import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ALL_ROLES } from '@/lib/api-key-providers';

export async function GET(request) {
  const role = new URL(request.url).searchParams.get('role');
  if (!ALL_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Role invalido' }, { status: 400 });
  }

  const secFetchDest = request.headers.get('sec-fetch-dest');
  if (secFetchDest && secFetchDest !== 'empty') {
    return NextResponse.json({ error: 'Endpoint restrito a chamadas server-side' }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('resolve_key_by_role', { p_role: role });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return NextResponse.json({ error: `Nenhuma API key configurada para: ${role}. Acesse Settings → API Keys.` }, { status: 404 });

  return NextResponse.json({
    providerName: row.provider_name,
    decryptedKey: row.decrypted_key,
    modelIdentifier: row.model_identifier,
  });
}
