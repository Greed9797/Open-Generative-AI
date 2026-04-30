import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createServiceClient } from './supabase/service.js';

const execFileAsync = promisify(execFile);

async function commandExists(name) {
  try {
    await execFileAsync(name, ['-version'], { timeout: 5000, maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function downloadClip(clipUrl) {
  const response = await fetch(clipUrl);
  if (!response.ok) throw new Error(`Clip download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function probeFps(inputPath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', '0', '-of', 'csv=p=0', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', inputPath,
    ], { timeout: 15000 });
    const [num, den] = String(stdout).trim().split('/').map(Number);
    return den ? num / den : Number(stdout) || 0;
  } catch {
    return 0;
  }
}

export async function postProcessVideo({ clipUrl, targetFps = 60, jobId = randomUUID(), segmentIndex = 0 }) {
  if (!(await commandExists('ffmpeg'))) return { skipped: true, reason: 'ffmpeg not available' };
  const tempDir = path.join(os.tmpdir(), `vbo-post-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, 'input.mp4');
  const interpolatedPath = path.join(tempDir, 'interpolated.mp4');
  const outputPath = path.join(tempDir, 'sharpened.mp4');
  try {
    await writeFile(inputPath, await downloadClip(clipUrl));
    const originalFps = await probeFps(inputPath);
    if (originalFps >= 50) return { skipped: true, reason: 'already high fps', originalFps };

    await execFileAsync('ffmpeg', [
      '-i', inputPath,
      '-vf', `minterpolate=fps=${targetFps}:mi_mode=mci:mc_mode=aobmc:vsbmc=1`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', interpolatedPath, '-y',
    ], { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 * 10 });

    await execFileAsync('ffmpeg', [
      '-i', interpolatedPath,
      '-vf', 'unsharp=5:5:0.8:3:3:0.4',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', outputPath, '-y',
    ], { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 * 10 });

    const supabase = createServiceClient();
    const storagePath = `postprocessed/${jobId}/seg-${segmentIndex}.mp4`;
    const { error } = await supabase.storage.from('renders').upload(storagePath, await readFile(outputPath), {
      contentType: 'video/mp4',
      upsert: true,
    });
    if (error) throw new Error(`Postprocessed upload failed: ${error.message}`);
    const { data: { publicUrl } } = supabase.storage.from('renders').getPublicUrl(storagePath);
    return { outputUrl: publicUrl, originalFps, outputFps: targetFps, skipped: false };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
