import { NextResponse } from 'next/server';
import { isValidRoles } from '../../../../../lib/api-key-providers.js';
import { resolveAuth, supabaseRest } from '../../../../../lib/supabase-vault.js';
import { enforceContentLength } from '../../../../../lib/security.mjs';

export const runtime = 'nodejs';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function publicKey(row) {
  return {
    id: row.id,
    providerName: row.provider_name,
    modelIdentifier: row.model_identifier,
    roles: row.roles || [],
    isCustom: row.is_custom,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export async function PATCH(request, { params }) {
  try {
    const tooLarge = enforceContentLength(request, 16 * 1024);
    if (tooLarge) return tooLarge;

    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { user, accessToken } = await resolveAuth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const patch = { updated_at: new Date().toISOString() };
    if ('roles' in body) {
      if (!isValidRoles(body.roles)) return NextResponse.json({ error: 'At least one valid role is required' }, { status: 400 });
      patch.roles = body.roles;
    }
    if ('isActive' in body) patch.is_active = Boolean(body.isActive);
    if ('modelIdentifier' in body) patch.model_identifier = body.modelIdentifier ? String(body.modelIdentifier).trim().slice(0, 160) : null;

    const rows = await supabaseRest(
      `user_api_keys?id=eq.${id}&user_id=eq.${user.id}&select=id,provider_name,model_identifier,roles,is_custom,is_active,created_at`,
      {
        method: 'PATCH',
        accessToken,
        body: patch,
        headers: { Prefer: 'return=representation' },
      }
    );
    if (!rows?.[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(publicKey(rows[0]));
  } catch (error) {
    console.error(`[api keys] patch failed: ${error.message}`);
    return NextResponse.json({ error: 'Could not update API key' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { user, accessToken } = await resolveAuth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await supabaseRest(`user_api_keys?id=eq.${id}&user_id=eq.${user.id}`, {
      method: 'DELETE',
      accessToken,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`[api keys] delete failed: ${error.message}`);
    return NextResponse.json({ error: 'Could not delete API key' }, { status: 500 });
  }
}
