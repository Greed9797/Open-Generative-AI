// Prerequisites: Node.js >= 22, FFmpeg in PATH, hyperframes CLI: npm install -g hyperframes
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '../../../../lib/supabase-vault.js';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const QUALITY_VALUES = new Set(['fast', 'high', 'best']);

function friendlyRenderError(error) {
  const output = `${error.message || ''}\n${error.stderr || ''}\n${error.stdout || ''}`.toLowerCase();
  if (output.includes('ffmpeg') && (output.includes('not found') || output.includes('no such file') || output.includes('spawn'))) {
    return 'FFmpeg was not found. Install it with: brew install ffmpeg';
  }
  if (output.includes('hyperframes') && (output.includes('not found') || output.includes('could not determine executable') || output.includes('404'))) {
    return 'Hyperframes CLI was not found. Install it with: npm install -g hyperframes';
  }
  return error.stderr || error.message || 'Hyperframes render failed';
}

export async function POST(request) {
  const { user } = await getSessionFromCookies().catch(() => ({ user: null }));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobId = randomUUID();
  const cwd = process.cwd();
  const tempDir = path.join(cwd, '.hyperframes-renders', jobId);
  const htmlPath = path.join(tempDir, 'index.html');
  const rendersDir = path.join(cwd, 'public', 'renders');
  const outputPath = path.join(rendersDir, `${jobId}.mp4`);

  try {
    const body = await request.json();
    const html = String(body.html || '').trim();
    const fps = Number(body.options?.fps) || 30;
    const quality = QUALITY_VALUES.has(body.options?.quality) ? body.options.quality : 'high';

    if (!html) {
      return NextResponse.json({ error: 'HTML composition is required' }, { status: 400 });
    }

    await mkdir(tempDir, { recursive: true });
    await mkdir(rendersDir, { recursive: true });
    await writeFile(htmlPath, html, 'utf8');

    await execFileAsync(
      'npx',
      ['hyperframes', 'render', '--input', htmlPath, '--output', outputPath, '--fps', String(fps), '--quality', quality],
      { cwd, timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 10 },
    );
    await access(outputPath);

    return NextResponse.json({ jobId, videoUrl: `/renders/${jobId}.mp4` });
  } catch (error) {
    return NextResponse.json({ error: friendlyRenderError(error) }, { status: 500 });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
