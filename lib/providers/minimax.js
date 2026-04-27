const BASE = 'https://api.minimaxi.com';

export async function submit(payload, apiKey) {
  const body = {
    model: payload.model || 'video-01',
    prompt: payload.prompt || '',
  };
  if (payload.image_url) body.first_frame_image = payload.image_url;
  if (payload.last_frame_image) body.last_frame_image = payload.last_frame_image;
  if (payload.duration) body.duration = payload.duration;

  const res = await fetch(`${BASE}/v1/video_generation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`MiniMax submit: ${data.base_resp?.status_msg || res.status}`);
  return { request_id: `minimax:${data.task_id}` };
}

export async function poll(taskId, apiKey) {
  const res = await fetch(`${BASE}/v1/query/video_generation?task_id=${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`MiniMax poll: ${data.base_resp?.status_msg || res.status}`);

  const status = (data.status || '').toLowerCase();
  if (status === 'success' || status === 'finished') {
    const url = data.download_url || data.file_url;
    return { status: 'completed', url, outputs: [url] };
  }
  if (status === 'fail' || status === 'failed') throw new Error('MiniMax generation failed');
  return { status: 'processing' };
}
