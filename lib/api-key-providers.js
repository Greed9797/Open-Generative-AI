export const ROLE_LABELS = {
  code_agent: 'Code Agent',
  analysis_agent: 'Analysis Agent',
  orchestrator: 'Orchestrator Agent',
  image_gen: 'Image Generation',
  video_gen: 'Video Generation',
};

export const ALL_ROLES = Object.keys(ROLE_LABELS);

export const KNOWN_PROVIDERS = [
  { name: 'Gemini', defaultRoles: ['analysis_agent', 'video_gen', 'image_gen'], modelIdentifier: 'gemini-2.5-flash', docsUrl: 'https://aistudio.google.com/app/apikey', keyPlaceholder: 'AIza...' },
  { name: 'Vertex AI', defaultRoles: ['video_gen', 'image_gen'], modelIdentifier: 'vertex:veo3.1-fast-text-to-video', docsUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys', keyPlaceholder: '{"apiKey":"AIza...","projectId":"meu-projeto-gcp","location":"us-central1"}', helpText: 'Requer Project ID do GCP. Salve como JSON: {"apiKey":"AIza...","projectId":"meu-projeto","location":"us-central1"} — ou no formato key|projectId|location' },
  { name: 'MiniMax', defaultRoles: ['code_agent', 'orchestrator'], modelIdentifier: 'MiniMax-M2.7', docsUrl: 'https://platform.minimax.io', keyPlaceholder: 'eyJ...' },
  { name: 'Kling', defaultRoles: ['video_gen'], modelIdentifier: 'kling-v3', docsUrl: 'https://platform.klingai.com', keyPlaceholder: 'accessKeyId:accessKeySecret' },
  { name: 'Seedance', defaultRoles: ['video_gen'], modelIdentifier: 'seedance-2.0', docsUrl: 'https://platform.bytedance.com', keyPlaceholder: 'sk-...' },
{ name: 'Veo 3.1', defaultRoles: ['video_gen'], modelIdentifier: 'veo-3.1-generate-preview', docsUrl: 'https://aistudio.google.com', keyPlaceholder: 'AIza...' },
  { name: 'Wan', defaultRoles: ['video_gen', 'image_gen'], modelIdentifier: 'wanx2.6-t2v-turbo', docsUrl: 'https://dashscope.aliyuncs.com', keyPlaceholder: 'sk-...' },
  { name: 'Runway', defaultRoles: ['video_gen'], modelIdentifier: 'gen4', docsUrl: 'https://runwayml.com', keyPlaceholder: 'key_...' },
  { name: 'Muapi', defaultRoles: ['image_gen', 'video_gen'], modelIdentifier: 'muapi', docsUrl: 'https://muapi.ai', keyPlaceholder: 'sk-...' },
];

export function isValidRoles(roles) {
  return Array.isArray(roles) && roles.length > 0 && roles.every((role) => ALL_ROLES.includes(role));
}
