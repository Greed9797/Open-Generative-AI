const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';

const SEEDANCE_MODEL_MAP = {
  'seedance-lite-t2v': 'doubao-seedance-1-lite-t2v-250415',
  'seedance-pro-t2v': 'doubao-seedance-1-pro-t2v-250415',
  'seedance-pro-t2v-fast': 'doubao-seedance-1-pro-t2v-250415',
  'seedance-v1.5-pro-t2v': 'doubao-seedance-1.5-pro-t2v-250520',
  'seedance-v1.5-pro-t2v-fast': 'doubao-seedance-1.5-pro-t2v-250520',
  'seedance-v2.0-t2v': 'doubao-seedance-2.0-t2v-250601',
  'seedance-v2.0-extend': 'doubao-seedance-2.0-extend-250601',
};

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.error || data.message || `Seedance request failed (${response.status})`);
  }
  return data;
}

export async function submit(payload, apiKey) {
  const modelId = payload.model || 'seedance-lite-t2v';
  const model = SEEDANCE_MODEL_MAP[modelId] || modelId;
  const data = await requestJson(BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      content: [{ type: 'text', text: payload.prompt || '' }],
    }),
  });

  const taskId = data.id || data.task_id || data.data?.id;
  if (!taskId) throw new Error('Seedance response did not include a task id');
  return { request_id: `seedance:${taskId}` };
}

export async function poll(taskId, apiKey) {
  const data = await requestJson(`${BASE_URL}/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const status = String(data.status || data.data?.status || '').toLowerCase();
  if (status === 'failed' || status === 'error' || status === 'canceled') {
    throw new Error(data.error?.message || data.message || 'Seedance generation failed');
  }

  if (status === 'succeeded' || status === 'success' || status === 'completed') {
    const content = data.content || data.data?.content || [];
    const videoItem = content.find((item) => item.type === 'video_url' || item.video_url || item.url);
    const url = videoItem?.video_url?.url || videoItem?.url || data.video_url?.url || data.url;
    if (!url) throw new Error('Seedance completed without a video URL');
    return { status: 'completed', url, outputs: [url] };
  }

  return { status: 'processing' };
}
