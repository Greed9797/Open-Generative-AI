import { NextResponse } from 'next/server';
import { ALL_ROLES, isValidRoles } from '../../../../lib/api-key-providers.js';
import { getSessionFromCookies, supabaseRest, supabaseRpc } from '../../../../lib/supabase-vault.js';

export const runtime = 'nodejs';

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

export async function GET() {
  try {
    const { user, accessToken } = await getSessionFromCookies();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await supabaseRest(
      `user_api_keys?select=id,provider_name,model_identifier,roles,is_custom,is_active,created_at&user_id=eq.${user.id}&order=created_at.desc`,
      { accessToken }
    );
    return NextResponse.json({ keys: rows.map(publicKey) });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, accessToken } = await getSessionFromCookies();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const providerName = String(body.providerName || '').trim();
    const rawKey = String(body.rawKey || '').trim();
    const roles = body.roles;

    if (!providerName) return NextResponse.json({ error: 'providerName is required' }, { status: 400 });
    if (!rawKey) return NextResponse.json({ error: 'rawKey is required' }, { status: 400 });
    if (!isValidRoles(roles)) {
      return NextResponse.json({ error: `roles must include at least one of: ${ALL_ROLES.join(', ')}` }, { status: 400 });
    }

    const id = await supabaseRpc('insert_api_key', {
      p_provider_name: providerName,
      p_raw_key: rawKey,
      p_model_identifier: body.modelIdentifier ? String(body.modelIdentifier).trim() : null,
      p_roles: roles,
      p_is_custom: Boolean(body.isCustom),
    }, { accessToken });

    return NextResponse.json({
      id,
      providerName,
      roles,
      isCustom: Boolean(body.isCustom),
      createdAt: new Date().toISOString(),
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
