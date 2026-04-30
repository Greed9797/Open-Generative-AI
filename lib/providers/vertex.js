import { randomUUID } from 'node:crypto';
import { createServiceClient } from '../supabase/service.js';
import { enhanceVeoPromptWithMeta } from '../agents/veo-prompt-enhancer.js';

const BASE_URL = 'https://aiplatform.googleapis.com/v1';
const DEFAULT_LOCATION = 'us-central1';

const MODEL_MAP = {
  'nano-banana': 'imagen-4.0-fast-generate-001',
  'google-imagen4': 'imagen-4.0-generate-001',
  'google-imagen4-fast': 'imagen-4.0-fast-generate-001',
  'google-imagen4-ultra': 'imagen-4.0-ultra-generate-001',
  // Veo 3.0
  'veo3-text-to-video': 'veo-3.0-generate-preview',
  'veo3-fast-text-to-video': 'veo-3.0-fast-generate-preview',
  'veo3-image-to-video': 'veo-3.0-generate-preview',
  'veo3-fast-image-to-video': 'veo-3.0-fast-generate-preview',
  // Veo 3.1 Full — Private Preview (requires allowlist)
  'veo3.1-text-to-video': 'veo-3.1-generate-preview',
  'veo3.1-image-to-video': 'veo-3.1-generate-preview',
  // Veo 3.1 Lite — Public Preview (available without allowlist)
  'veo3.1-fast-text-to-video': 'veo-3.1-lite-generate-001',
  'veo3.1-lite-text-to-video': 'veo-3.1-lite-generate-001',
  'veo3.1-fast-image-to-video': 'veo-3.1-lite-generate-001',
  'veo3.1-lite-image-to-video': 'veo-3.1-lite-generate-001',
};

function normalizeModelId(modelId) {
  return String(modelId || '').replace(/^vertex[:_-]/i, '');
}

function getVertexModel(modelId) {
  const normalized = normalizeModelId(modelId);
  return MODEL_MAP[normalized] || normalized || 'veo-3.1-generate-preview';
}

function isImageModel(modelId) {
  const normalized = normalizeModelId(modelId);
  return normalized === 'nano-banana' || normalized.startsWith('google-imagen');
}

function parseCredentials(rawKey) {
  const value = String(rawKey || '').trim();
  let apiKey = value;
  let projectId = process.env.VERTEX_AI_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
  let location = process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || DEFAULT_LOCATION;

  if (value.startsWith('{')) {
    const parsed = JSON.parse(value);
    apiKey = parsed.apiKey || parsed.key || '';
    projectId = parsed.projectId || parsed.project || projectId;
    location = parsed.location || parsed.region || location;
  } else if (value.includes('|')) {
    const [keyPart, projectPart, locationPart] = value.split('|').map((part) => part.trim());
    apiKey = keyPart;
    projectId = projectPart || projectId;
    location = locationPart || location;
  }

  if (!apiKey) throw new Error('Vertex AI API key is not configured');
  if (!projectId) throw new Error('VERTEX_AI_PROJECT is required for Vertex AI requests');

  return { apiKey, projectId, location };
}

function publisherModelResource({ projectId, location }, modelId) {
  return `projects/${projectId}/locations/${location}/publishers/google/models/${getVertexModel(modelId)}`;
}

function extFromMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/webm') return 'webm';
  return mimeType?.split('/')[1] || 'bin';
}

async function uploadBuffer(buffer, mimeType) {
  const supabase = createServiceClient();
  const path = `${randomUUID()}.${extFromMime(mimeType)}`;
  const { error } = await supabase.storage
    .from('uploads')
    .upload(path, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false,
    });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(path);
  return publicUrl;
}

async function uploadBase64(base64, mimeType) {
  return uploadBuffer(Buffer.from(base64, 'base64'), mimeType);
}

async function uploadRemoteUrl(url, fallbackMime = 'video/mp4') {
  if (!url) return null;
  if (url.startsWith('gs://')) {
    throw new Error('Vertex AI returned a gs:// URI. Configure the model output for downloadable URLs or add a signed GCS download flow.');
  }

  const response = await fetch(url);
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Failed to download Vertex AI media (${response.status}): ${errText.slice(0, 200)}`);
  }

  const mimeType = response.headers.get('content-type') || fallbackMime;
  return uploadBuffer(Buffer.from(await response.arrayBuffer()), mimeType);
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.error || data.message || `Vertex AI request failed (${response.status})`);
  }
  return data;
}

function withApiKey(url, apiKey) {
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
}

async function fetchImageAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch input image: ${response.status}`);
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { bytesBase64Encoded: buffer.toString('base64'), mimeType };
}

function normalizeResolution(resolution) {
  const value = String(resolution || '').trim().toLowerCase();
  if (value === '1080p' || value === '720p' || value === '4k') return value;
  return null;
}

function veoDurationSeconds(payload) {
  const requested = Number(payload.duration) || 8;
  const resolution = normalizeResolution(payload.resolution);
  if (resolution === '1080p' || resolution === '4k') return 8;
  return [4, 6, 8].includes(requested) ? requested : 8;
}

function auditRequestBody(requestBody) {
  return {
    ...requestBody,
    instances: requestBody.instances.map((instance) => {
      if (!instance.image?.bytesBase64Encoded) return instance;
      return {
        ...instance,
        image: {
          ...instance.image,
          bytesBase64Encoded: `[base64 omitted: ${instance.image.bytesBase64Encoded.length} chars]`,
        },
      };
    }),
  };
}

async function submitImage(payload, rawKey) {
  const credentials = parseCredentials(rawKey);
  const model = publisherModelResource(credentials, payload.model || 'google-imagen4-fast');
  const data = await requestJson(withApiKey(`${BASE_URL}/${model}:predict`, credentials.apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: payload.prompt || '' }],
      parameters: {
        sampleCount: 1,
        aspectRatio: payload.aspect_ratio || '1:1',
      },
    }),
  });

  const prediction = data.predictions?.[0];
  const base64 = prediction?.bytesBase64Encoded || prediction?.bytesBase64 || prediction?.image?.bytesBase64Encoded;
  const mimeType = prediction?.mimeType || prediction?.image?.mimeType || 'image/png';
  if (!base64) throw new Error('Vertex AI Imagen response did not include image bytes');

  const url = await uploadBase64(base64, mimeType);
  return { request_id: `vertex_image:DONE:${encodeURIComponent(url)}` };
}

async function submitVideo(payload, rawKey) {
  const credentials = parseCredentials(rawKey);
  const model = publisherModelResource(credentials, payload.model || 'veo3.1-fast-text-to-video');
  const exactPrompt = Boolean(payload.exact_prompt || payload.max_quality);
  const promptEnhancement = exactPrompt
    ? { prompt: payload.prompt || '', enhanced: false, provider: null, reason: 'exact_prompt' }
    : await enhanceVeoPromptWithMeta(payload.prompt || '');
  const instance = { prompt: promptEnhancement.prompt };
  if (payload.image_url) {
    instance.image = await fetchImageAsBase64(payload.image_url);
  }
  const resolution = normalizeResolution(payload.resolution);
  const parameters = {
    sampleCount: 1,
    durationSeconds: veoDurationSeconds(payload),
    aspectRatio: payload.aspect_ratio || '16:9',
    personGeneration: payload.image_url ? 'allow_adult' : 'allow_all',
  };
  if (resolution) parameters.resolution = resolution;
  const seed = Number(payload.seed);
  if (Number.isFinite(seed)) parameters.seed = seed;

  const requestBody = {
    instances: [instance],
    parameters,
  };

  const data = await requestJson(withApiKey(`${BASE_URL}/${model}:predictLongRunning`, credentials.apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!data.name) throw new Error('Vertex AI Veo response did not include operation name');
  return {
    request_id: `vertex:${data.name}`,
    audit: {
      providerModel: model,
      resolution: parameters.resolution || '720p',
      durationSeconds: parameters.durationSeconds,
      aspectRatio: parameters.aspectRatio,
      personGeneration: parameters.personGeneration,
      seed: parameters.seed || null,
      exactPrompt,
      rawPayload: auditRequestBody(requestBody),
      promptEnhancement: {
        enhanced: promptEnhancement.enhanced,
        provider: promptEnhancement.provider,
        reason: promptEnhancement.reason,
      },
    },
  };
}

export async function submit(payload, rawKey) {
  const modelId = payload.model || 'google-imagen4-fast';
  if (isImageModel(modelId)) return submitImage(payload, rawKey);
  return submitVideo(payload, rawKey);
}

export async function poll(taskId, rawKey) {
  if (taskId.startsWith('image:DONE:')) {
    const url = decodeURIComponent(taskId.slice('image:DONE:'.length));
    return { status: 'completed', url, outputs: [url] };
  }

  const credentials = parseCredentials(rawKey);
  const data = await requestJson(withApiKey(`${BASE_URL}/${taskId}`, credentials.apiKey));
  if (!data.done) return { status: 'processing' };
  if (data.error) throw new Error(data.error.message || 'Vertex AI generation failed');

  const response = data.response || {};
  const candidates = [
    response.videos?.[0],
    response.generatedVideos?.[0]?.video,
    response.generatedVideos?.[0],
    response.generateVideoResponse?.generatedSamples?.[0]?.video,
    response.generateVideoResponse?.generatedSamples?.[0],
    response.predictions?.[0],
  ].filter(Boolean);

  let url = null;
  for (const video of candidates) {
    const base64 = video.bytesBase64Encoded || video.bytesBase64;
    const uri = video.uri || video.url || video.videoUri || video.gcsUri || video.video?.uri || video.video?.url;
    if (base64) {
      url = await uploadBase64(base64, video.mimeType || 'video/mp4');
      break;
    }
    if (uri) {
      url = await uploadRemoteUrl(uri, 'video/mp4');
      break;
    }
  }

  if (!url) {
    console.error('[vertex.poll] Generation done but no URL found. Response:', JSON.stringify(response).slice(0, 2000));
    throw new Error('Vertex AI operation completed without a media URL');
  }
  return { status: 'completed', url, outputs: [url] };
}
