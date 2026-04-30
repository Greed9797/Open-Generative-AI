import fs from 'node:fs';
import path from 'node:path';
import { createServiceClient } from './supabase/service.js';

const JOBS_DIR = path.join(process.cwd(), '.image-agent-jobs');
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const imageAgentJobs = new Map();

function ensureDir() {
  try {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function isSafeJobId(id) {
  return typeof id === 'string' && JOB_ID_PATTERN.test(id);
}

function jobFile(id) {
  if (!isSafeJobId(id)) throw new Error('Invalid image agent job id');
  return path.join(JOBS_DIR, `${id}.json`);
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function sanitize(job) {
  const next = clone(job);
  if (next) delete next.apiKeys;
  return next;
}

function persistJob(job) {
  ensureDir();
  try {
    fs.writeFileSync(jobFile(job.id), JSON.stringify(job, null, 2));
  } catch (error) {
    console.error('[image-agent-jobs] persist failed:', error.message);
  }
}

function loadFromDisk(id) {
  try {
    return JSON.parse(fs.readFileSync(jobFile(id), 'utf8'));
  } catch {
    return null;
  }
}

function toDbRow(job) {
  return {
    id: job.id,
    user_id: job.userId,
    status: job.status,
    prompt: job.prompt,
    workflow: job.workflow,
    target_model: job.targetModel,
    target_count: job.targetCount,
    aspect_ratio: job.aspectRatio,
    reference_images: job.referenceImages || [],
    reference_briefing: job.referenceBriefing || null,
    outputs: job.outputs || [],
    log: job.log || [],
    qa_summary: job.qaSummary || null,
    created_at: job.createdAt,
    updated_at: job.updatedAt || new Date().toISOString(),
  };
}

function fromDbRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    prompt: row.prompt,
    workflow: row.workflow,
    targetModel: row.target_model,
    targetCount: row.target_count,
    aspectRatio: row.aspect_ratio,
    referenceImages: row.reference_images || [],
    referenceBriefing: row.reference_briefing || null,
    outputs: row.outputs || [],
    log: row.log || [],
    qaSummary: row.qa_summary || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function upsertToSupabase(job) {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('image_agent_jobs').upsert(toDbRow(job), { onConflict: 'id' });
    if (error) console.error('[image-agent-jobs] upsert failed:', error.message);
  } catch (error) {
    console.error('[image-agent-jobs] upsert exception:', error.message);
  }
}

(function bootstrapRecovery() {
  ensureDir();
  let files = [];
  try {
    files = fs.readdirSync(JOBS_DIR).filter((name) => name.endsWith('.json'));
  } catch {
    return;
  }
  for (const file of files) {
    try {
      const job = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, file), 'utf8'));
      if (!job?.id) continue;
      if (job.status === 'running') {
        job.status = 'failed';
        job.log = [
          ...(job.log || []),
          { timestamp: new Date().toISOString(), agent: 'Sistema', message: 'Servidor reiniciado — job de imagem interrompido' },
        ];
        job.updatedAt = new Date().toISOString();
        persistJob(job);
      }
      imageAgentJobs.set(job.id, job);
    } catch {
      /* skip malformed */
    }
  }
})();

export function setImageAgentJob(job) {
  const next = { ...job, updatedAt: new Date().toISOString() };
  imageAgentJobs.set(next.id, next);
  persistJob(next);
  upsertToSupabase(next).catch(() => {});
  return sanitize(next);
}

export function getImageAgentJob(id) {
  if (!isSafeJobId(id)) return null;
  const job = imageAgentJobs.get(id) || loadFromDisk(id);
  if (job) imageAgentJobs.set(id, job);
  return clone(job);
}

export async function getPublicImageAgentJob(id, userId) {
  const job = getImageAgentJob(id);
  if (job) return job.userId === userId ? sanitize(job) : null;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from('image_agent_jobs').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    return sanitize(fromDbRow(data));
  } catch {
    return null;
  }
}

export async function listPublicImageAgentJobs(userId) {
  if (!userId) return [];
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('image_agent_jobs')
      .select('id,status,prompt,workflow,target_model,target_count,outputs,qa_summary,created_at,updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    return (data || []).map(fromDbRow).map(sanitize);
  } catch {
    return Array.from(imageAgentJobs.values())
      .filter((job) => job.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20)
      .map(sanitize);
  }
}

export function updateImageAgentJob(id, patch) {
  const current = getImageAgentJob(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  imageAgentJobs.set(id, next);
  persistJob(next);
  upsertToSupabase(next).catch(() => {});
  return sanitize(next);
}

export function appendImageAgentLog(id, agent, message) {
  const current = getImageAgentJob(id);
  if (!current) return null;
  return updateImageAgentJob(id, {
    log: [...(current.log || []), { timestamp: new Date().toISOString(), agent, message }],
  });
}
