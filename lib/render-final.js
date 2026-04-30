import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile, access, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { getJob, updateJob, appendLog, isSafeJobId } from './agent-jobs.js';
import { createServiceClient } from './supabase/service.js';

const execFileAsync = promisify(execFile);
const RENDER_CSP = [
  "default-src 'none'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "style-src 'self' 'unsafe-inline'",
].join('; ');

function escapeAttribute(value) {
  return String(value).replace(/[&"'<>]/g, (char) => ({
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
    '<': '&lt;',
    '>': '&gt;',
  })[char]);
}

function safeMediaUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function buildHtml(job) {
  const compositionId = `agent-studio-${job.id}`;
  const clips = job.segments.map((segment, index) => {
    const start = index * 8;
    const mediaUrl = safeMediaUrl(segment.finalClipUrl);
    if (!mediaUrl) throw new Error('Unsafe final clip URL');
    const src = escapeAttribute(mediaUrl);
    const isImage = /\.(png|jpe?g|webp)(\?|$)/i.test(mediaUrl);
    if (isImage) {
      return `<img class="clip" data-start="${start}" data-duration="8" data-track-index="0" src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />`;
    }
    return `<video class="clip" data-start="${start}" data-duration="8" data-track-index="0" src="${src}" muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>`;
  }).join('\n');
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${RENDER_CSP}"><style>html,body{margin:0;background:#000;overflow:hidden}</style></head>
<body>
<div id="root" data-composition-id="${escapeAttribute(compositionId)}" data-start="0" data-width="1920" data-height="1080" style="position:relative;width:1920px;height:1080px;background:#000;overflow:hidden;">
${clips}
</div>
</body>
</html>`;
}

async function uploadToStorage(jobId, localPath) {
  const supabase = createServiceClient();
  const fileBuffer = await readFile(localPath);
  const storagePath = `${jobId}/final.mp4`;
  const { error } = await supabase.storage
    .from('renders')
    .upload(storagePath, fileBuffer, { contentType: 'video/mp4', upsert: true });
  if (error) throw new Error(error.message || 'Upload failed');
  // Signed URL — bucket is private, expiry 7 days
  const { data: signed, error: signErr } = await supabase.storage
    .from('renders')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  if (signErr) throw new Error(signErr.message || 'Signed URL failed');
  return signed.signedUrl;
}

export async function renderFinal(jobId) {
  if (!isSafeJobId(jobId)) throw new Error('Invalid job id');
  const job = getJob(jobId);
  if (!job) throw new Error('Job not found');
  const finalClips = job.segments.map((segment) => segment.finalClipUrl);
  if (finalClips.some((clipUrl) => !clipUrl)) throw new Error('Cannot render final video without all segment clips');

  const tempDir = path.join(process.cwd(), '.hyperframes-renders', `${jobId}-${randomUUID()}`);
  const htmlPath = path.join(tempDir, 'index.html');
  const outputDir = path.join(process.cwd(), 'public', 'renders');
  const outputPath = path.join(outputDir, `${jobId}-final.mp4`);
  try {
    await mkdir(tempDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await writeFile(htmlPath, buildHtml(job), 'utf8');
    appendLog(jobId, 'VideoGen', 'Rendering final 24-second MP4');
    await execFileAsync(
      'npx',
      ['hyperframes', 'render', '--input', tempDir, '--output', outputPath, '--fps', '30', '--quality', 'high'],
      { timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 10 },
    );
    await access(outputPath);

    let publicUrl = `/renders/${jobId}-final.mp4`;
    try {
      publicUrl = await uploadToStorage(jobId, outputPath);
      try { await unlink(outputPath); } catch { /* ignore */ }
      appendLog(jobId, 'VideoGen', 'Final MP4 uploaded to storage');
    } catch (uploadError) {
      appendLog(jobId, 'Sistema', `Upload storage falhou: ${uploadError.message} — usando URL local`);
    }

    updateJob(jobId, { finalVideoUrl: publicUrl, status: 'done' });
    appendLog(jobId, 'VideoGen', 'Final MP4 rendered');
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
