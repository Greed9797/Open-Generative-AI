import fs from 'node:fs';
import path from 'node:path';
import { createServiceClient } from './supabase/service.js';

const JOBS_DIR = path.join(process.cwd(), '.agent-jobs');

// In-memory Map: holds jobs for the current invocation only.
// Used by the pipeline (which runs in start-job's invocation) to access apiKeys
// and for fast reads without a DB round-trip.
export const jobs = new Map();

function ensureDir() {
  try {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function jobFile(id) {
  return path.join(JOBS_DIR, `${id}.json`);
}

function persistJob(job) {
  try {
    fs.writeFileSync(jobFile(job.id), JSON.stringify(job, null, 2));
  } catch (err) {
    console.error('[agent-jobs] persist failed:', err.message);
  }
}

function loadJobFromDisk(id) {
  try {
    const raw = fs.readFileSync(jobFile(id), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Startup recovery — runs once at module import time.
(function bootstrapRecovery() {
  ensureDir();
  let files;
  try {
    files = fs.readdirSync(JOBS_DIR).filter((name) => name.endsWith('.json'));
  } catch {
    return;
  }
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(JOBS_DIR, file), 'utf8');
      const job = JSON.parse(raw);
      if (!job?.id) continue;
      if (job.status === 'running' || job.status === 'pending') {
        job.status = 'failed';
        job.log = [
          ...(job.log || []),
          { timestamp: new Date().toISOString(), agent: 'Sistema', message: 'Servidor reiniciado — job interrompido' },
        ];
        job.updatedAt = new Date().toISOString();
        persistJob(job);
      }
      jobs.set(job.id, job);
    } catch {
      /* skip malformed */
    }
  }
})();

function cloneJob(job) {
  return job ? JSON.parse(JSON.stringify(job)) : null;
}

function sanitizeJob(job) {
  if (!job) return null;
  const clone = cloneJob(job);
  delete clone.apiKeys;
  return clone;
}

function toDbRow(job) {
  return {
    id: job.id,
    status: job.status,
    base_image_url: job.baseImageUrl || null,
    rough_prompt: job.roughPrompt || null,
    target_model: job.targetModel || null,
    style: job.style || null,
    segments: job.segments || [],
    orchestrator_plan: job.orchestratorPlan || null,
    final_video_url: job.finalVideoUrl || null,
    log: job.log || [],
    user_id: job.userId || null,
    updated_at: job.updatedAt || new Date().toISOString(),
  };
}

function fromDbRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    baseImageUrl: row.base_image_url,
    roughPrompt: row.rough_prompt,
    targetModel: row.target_model,
    style: row.style,
    segments: row.segments || [],
    orchestratorPlan: row.orchestrator_plan,
    finalVideoUrl: row.final_video_url,
    log: row.log || [],
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function upsertToSupabase(job) {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('agent_jobs').upsert(toDbRow(job), { onConflict: 'id' });
    if (error) console.error('[agent-jobs] upsert failed:', error.message);
  } catch (err) {
    console.error('[agent-jobs] upsert exception:', err.message);
  }
}

// Used by pipeline code in the same invocation (has apiKeys).
// Falls back to disk if not in-memory (cross-invocation read).
export function getJob(id) {
  const memJob = jobs.get(id);
  if (memJob) return cloneJob(memJob);
  const diskJob = loadJobFromDisk(id);
  if (diskJob) {
    jobs.set(id, diskJob);
    return cloneJob(diskJob);
  }
  return null;
}

// Used by stream and job-status (cross-invocation). Falls back to Supabase.
export async function getPublicJob(id) {
  const memJob = jobs.get(id);
  if (memJob) return sanitizeJob(memJob);

  const diskJob = loadJobFromDisk(id);
  if (diskJob) {
    jobs.set(id, diskJob);
    return sanitizeJob(diskJob);
  }

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return fromDbRow(data);
  } catch {
    return null;
  }
}

// Used by list-jobs (cross-invocation). Reads from Supabase.
export async function listPublicJobs(userId) {
  try {
    const supabase = createServiceClient();
    let query = supabase
      .from('agent_jobs')
      .select('id,status,target_model,style,final_video_url,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (userId) query = query.eq('user_id', userId);
    const { data } = await query;
    return (data || []).map((row) => ({
      id: row.id,
      status: row.status,
      targetModel: row.target_model,
      style: row.style,
      finalVideoUrl: row.final_video_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch {
    // Fallback to in-memory if Supabase unavailable.
    return Array.from(jobs.values())
      .filter((job) => !userId || !job.userId || job.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20)
      .map((job) => ({
        id: job.id,
        status: job.status,
        targetModel: job.targetModel,
        style: job.style,
        finalVideoUrl: job.finalVideoUrl,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }));
  }
}

export function setJob(job) {
  const next = { ...job, updatedAt: new Date().toISOString() };
  jobs.set(next.id, next);
  persistJob(next);
  upsertToSupabase(next).catch(() => {});
  return cloneJob(next);
}

export function updateJob(id, patch) {
  const current = jobs.get(id) || loadJobFromDisk(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  jobs.set(id, next);
  persistJob(next);
  upsertToSupabase(next).catch(() => {});
  return cloneJob(next);
}

export function appendLog(id, agent, message) {
  const current = jobs.get(id) || loadJobFromDisk(id);
  if (!current) return null;
  return updateJob(id, {
    log: [
      ...(current.log || []),
      { timestamp: new Date().toISOString(), agent, message },
    ],
  });
}
