import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '../../../../lib/supabase-vault.js';
import { resolveApiKeyByProvider } from '../../../../lib/resolve-api-key.js';
import { detectProvider, getAdapter, parsePollId, PROVIDER_DB_NAME } from '../../../../lib/providers/index.js';

async function resolveKey(userId, provider) {
  if (!userId || !provider) return null;
  const dbName = PROVIDER_DB_NAME[provider];
  if (!dbName) return null;
  const resolved = await resolveApiKeyByProvider(userId, dbName).catch(() => null);
  return resolved?.key || null;
}

export async function GET(request, { params }) {
  const pathSegments = (await params).path || [];
  const pathStr = pathSegments.join('/');

  const { user } = await getSessionFromCookies().catch(() => ({ user: null }));

  if (pathStr.startsWith('api/v1/predictions/') && pathStr.endsWith('/result')) {
    const encodedId = pathSegments.slice(3, -1).join('/');
    const { provider, taskId } = parsePollId(encodedId);

    if (!provider) {
      return NextResponse.json({ error: 'Unknown provider for this task ID.' }, { status: 400 });
    }

    const apiKey = await resolveKey(user?.id, provider);
    if (!apiKey) {
      return NextResponse.json(
        { error: `No API key configured for ${PROVIDER_DB_NAME[provider]}. Add it in Settings → API Keys.` },
        { status: 401 }
      );
    }

    try {
      const adapter = getAdapter(provider);
      const result = await adapter.poll(taskId, apiKey);
      if (result.status === 'completed') {
        return NextResponse.json({
          status: 'completed',
          outputs: result.outputs || [result.url],
          url: result.url,
        });
      }
      return NextResponse.json({ status: result.status || 'processing' });
    } catch (err) {
      console.error(`[proxy poll] provider=${provider} taskId=${taskId} error=${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request, { params }) {
  const pathSegments = (await params).path || [];
  const pathStr = pathSegments.join('/');

  const { user } = await getSessionFromCookies().catch(() => ({ user: null }));

  if (
    pathStr.startsWith('api/v1/') &&
    !pathStr.startsWith('api/v1/upload_file') &&
    !pathStr.startsWith('api/v1/account')
  ) {
    let body;
    const rawBody = await request.arrayBuffer();
    try { body = JSON.parse(Buffer.from(rawBody).toString()); } catch { body = {}; }

    const modelId = body.model || pathSegments[2];
    const provider = detectProvider(modelId);

    if (!provider) {
      return NextResponse.json(
        { error: `Model "${modelId}" is not supported for direct API access. Check your provider settings.` },
        { status: 400 }
      );
    }

    const apiKey = await resolveKey(user?.id, provider);
    if (!apiKey) {
      return NextResponse.json(
        { error: `No API key configured for ${PROVIDER_DB_NAME[provider]}. Add it in Settings → API Keys.` },
        { status: 401 }
      );
    }

    try {
      const adapter = getAdapter(provider);
      body.model = body.model || modelId;
      const result = await adapter.submit(body, apiKey);
      return NextResponse.json(result);
    } catch (err) {
      console.error(`[proxy submit] provider=${provider} model=${modelId} error=${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
