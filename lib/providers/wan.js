// Alibaba Cloud DashScope — Wan Video
const BASE = 'https://dashscope.aliyuncs.com/api/v1';

function mapModel(model) {
  if (model?.includes('i2v') || model?.includes('image-to-video')) {
    if (model?.includes('2.2')) return 'wanx2.2-i2v-turbo';
    return 'wanx2.5-i2v-turbo';
  }
  if (model?.includes('2.6')) return 'wanx2.6-t2v-turbo';
  if (model?.includes('2.5')) return 'wanx2.5-t2v-turbo';
  if (model?.includes('2.1')) return 'wanx2.1-t2v-turbo';
  if (model?.includes('image') || model?.includes('t2i')) return 'wanx2.1-t2i-turbo';
  return 'wanx2.6-t2v-turbo';
}

function mapSize(aspectRatio) {
  const map = { '16:9': '1280*720', '9:16': '720*1280', '1:1': '720*720', '4:3': '960*720', '3:4': '720*960' };
  return map[aspectRatio] || '1280*720';
}

export async function submit(payload, apiKey) {
  const isI2V = payload.image_url && (payload.model?.includes('i2v') || payload.model?.includes('image-to-video'));
  const isStaticImage = !isI2V && (payload.model?.includes('t2i') || (payload.model?.includes('image') && !payload.model?.includes('to-video')));

  const path = isStaticImage
    ? '/services/aigc/text2image/image-synthesis'
    : isI2V
      ? '/services/aigc/image2video/video-synthesis'
      : '/services/aigc/video-synthesis/generation';

  const input = { prompt: payload.prompt || '' };
  if (isI2V) input.img_url = payload.image_url;

  const body = {
    model: mapModel(payload.model),
    input,
    parameters: { size: mapSize(payload.aspect_ratio) },
  };
  if (!isStaticImage && payload.duration) body.parameters.duration = Number(payload.duration);

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.code) throw new Error(`Wan submit: ${data.message || res.status}`);
  return { request_id: `wan:${data.output.task_id}` };
}

export async function poll(taskId, apiKey) {
  const res = await fetch(`${BASE}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json();
  if (!res.ok || data.code) throw new Error(`Wan poll: ${data.message || res.status}`);

  const status = (data.output?.task_status || '').toUpperCase();
  if (status === 'SUCCEEDED') {
    const url = data.output.video_url || data.output.results?.[0]?.url;
    return { status: 'completed', url, outputs: [url] };
  }
  if (status === 'FAILED') throw new Error(`Wan failed: ${data.output.message || 'unknown'}`);
  return { status: 'processing' };
}
