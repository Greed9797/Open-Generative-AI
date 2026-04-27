// Runway Gen-4
const BASE = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION = '2024-11-06';

export async function submit(payload, apiKey) {
  const body = {
    promptText: payload.prompt || '',
    model: payload.model || 'gen4_turbo',
    ratio: payload.aspect_ratio === '9:16' ? '768:1280' : '1280:768',
    duration: Number(payload.duration) || 5,
  };
  if (payload.image_url) {
    body.promptImage = payload.image_url;
    delete body.promptText;
  }

  const endpoint = payload.image_url ? '/v1/image_to_video' : '/v1/text_to_video';
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_VERSION,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Runway submit: ${data.error || res.status}`);
  return { request_id: `runway:${data.id}` };
}

export async function poll(taskId, apiKey) {
  const res = await fetch(`${BASE}/v1/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': RUNWAY_VERSION,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Runway poll: ${data.error || res.status}`);

  const status = (data.status || '').toUpperCase();
  if (status === 'SUCCEEDED') {
    const url = data.output?.[0];
    return { status: 'completed', url, outputs: data.output || [] };
  }
  if (status === 'FAILED') throw new Error(`Runway failed: ${data.failure || 'unknown'}`);
  return { status: 'processing' };
}
