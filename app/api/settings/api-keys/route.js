import { NextResponse } from 'next/server';
import { ALL_ROLES, isValidRoles } from '../../../../lib/api-key-providers.js';
import { resolveAuth, supabaseRest, supabaseRpc } from '../../../../lib/supabase-vault.js';
import { enforceContentLength } from '../../../../lib/security.mjs';

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

export async function GET(request) {
  try {
    const { user, accessToken } = await resolveAuth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await supabaseRest(
      `user_api_keys?select=id,provider_name,model_identifier,roles,is_custom,is_active,created_at&user_id=eq.${user.id}&order=created_at.desc`,
      { accessToken }
    );
    return NextResponse.json({ keys: rows.map(publicKey) });
  } catch (error) {
    console.error(`[api keys] list failed: ${error.message}`);
    return NextResponse.json({ error: 'Could not list API keys' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const tooLarge = enforceContentLength(request, 16 * 1024);
    if (tooLarge) return tooLarge;

    const { user, accessToken } = await resolveAuth(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const providerName = String(body.providerName || '').trim().slice(0, 120);
    const rawKey = String(body.rawKey || '').trim();
    const roles = body.roles;

    if (!providerName) return NextResponse.json({ error: 'providerName is required' }, { status: 400 });
    if (!rawKey || rawKey.length > 4096) return NextResponse.json({ error: 'rawKey is invalid' }, { status: 400 });
    if (!isValidRoles(roles)) {
      return NextResponse.json({ error: `roles must include at least one of: ${ALL_ROLES.join(', ')}` }, { status: 400 });
    }

    const id = await supabaseRpc('insert_api_key', {
      p_provider_name: providerName,
      p_raw_key: rawKey,
      p_model_identifier: body.modelIdentifier ? String(body.modelIdentifier).trim().slice(0, 160) : null,
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
    console.error(`[api keys] create failed: ${error.message}`);
    return NextResponse.json({ error: 'Could not save API key' }, { status: 500 });
  }
}
