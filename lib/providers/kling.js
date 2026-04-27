import { createHmac } from 'node:crypto';

function parseKey(apiKey) {
  // Format stored: "accessKeyId:accessKeySecret"
  const sep = apiKey.indexOf(':');
  if (sep === -1) return { accessKeyId: apiKey, accessKeySecret: null };
  return {
    accessKeyId: apiKey.slice(0, sep),
    accessKeySecret: apiKey.slice(sep + 1),
  };
}

function generateJWT(accessKeyId, accessKeySecret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: accessKeyId, exp: now + 1800, nbf: now - 5 })).toString('base64url');
  const sig = createHmac('sha256', accessKeySecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function bearerToken(apiKey) {
  const { accessKeyId, accessKeySecret } = parseKey(apiKey);
  return accessKeySecret ? generateJWT(accessKeyId, accessKeySecret) : accessKeyId;
}

export async function submit(payload, apiKey) {
  const token = bearerToken(apiKey);
  const isI2V = !!payload.image_url;
  const endpoint = isI2V
    ? 'https://api.klingai.com/v1/videos/image2video'
    : 'https://api.klingai.com/v1/videos/text2video';

  const body = {
    model_name: payload.model || 'kling-v2-master',
    prompt: payload.prompt || '',
    negative_prompt: payload.negative_prompt || '',
    cfg_scale: payload.cfg_scale ?? 0.5,
    mode: payload.mode || 'std',
    duration: String(payload.duration || 5),
    aspect_ratio: payload.aspect_ratio || '16:9',
  };
  if (isI2V) body.image_url = payload.image_url;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.code !== 0) throw new Error(`Kling submit: ${data.message || res.status}`);

  const taskType = isI2V ? 'image2video' : 'text2video';
  return { request_id: `kling_${taskType}:${data.data.task_id}` };
}

export async function poll(encodedId, apiKey) {
  const token = bearerToken(apiKey);
  // encodedId format: "kling_text2video:taskId" or "kling_image2video:taskId"
  const [prefix, taskId] = encodedId.split(':');
  const taskType = prefix.includes('image2video') ? 'image2video' : 'text2video';

  const res = await fetch(`https://api.klingai.com/v1/videos/${taskType}/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || data.code !== 0) throw new Error(`Kling poll: ${data.message || res.status}`);

  const task = data.data;
  const status = task.task_status;
  if (status === 'succeed') {
    const url = task.task_result?.videos?.[0]?.url;
    return { status: 'completed', url, outputs: [url] };
  }
  if (status === 'failed') throw new Error(`Kling failed: ${task.task_status_msg || 'unknown'}`);
  return { status: 'processing' };
}
