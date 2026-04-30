// Prerequisites: Node.js >= 22, FFmpeg in PATH, hyperframes CLI: npm install -g hyperframes
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import {
  enforceContentLength,
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireAuthenticatedUser,
} from '../../../../lib/security.mjs';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const QUALITY_VALUES = new Set(['fast', 'high', 'best']);
const RENDER_CSP = [
  "default-src 'none'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
].join('; ');

function validateRenderHtml(html) {
  if (!html || html.length > 1024 * 1024) return false;
  return !/(<\s*script\b|<\s*iframe\b|<\s*object\b|<\s*embed\b|javascript:|data:text\/html|on[a-z]+\s*=)/i.test(html);
}

function hardenRenderHtml(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${RENDER_CSP}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}

function friendlyRenderError(error) {
  const output = `${error.message || ''}\n${error.stderr || ''}\n${error.stdout || ''}`.toLowerCase();
  if (output.includes('ffmpeg') && (output.includes('not found') || output.includes('no such file') || output.includes('spawn'))) {
    return 'FFmpeg was not found. Install it with: brew install ffmpeg';
  }
  if (output.includes('hyperframes') && (output.includes('not found') || output.includes('could not determine executable') || output.includes('404'))) {
    return 'Hyperframes CLI was not found. Install it with: npm install -g hyperframes';
  }
  console.error(`[render] error=${error.message || 'unknown'}`);
  return 'Hyperframes render failed';
}

export async function POST(request) {
  const tooLarge = enforceContentLength(request, 1024 * 1024);
  if (tooLarge) return tooLarge;

  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const limited = rateLimit(`render:${auth.user.id}:${getClientIp(request)}`, { limit: 5, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const jobId = randomUUID();
  const cwd = process.cwd();
  const tempDir = path.join(cwd, '.hyperframes-renders', jobId);
  const htmlPath = path.join(tempDir, 'index.html');
  const rendersDir = path.join(cwd, 'public', 'renders');
  const outputPath = path.join(rendersDir, `${jobId}.mp4`);

  try {
    const body = await request.json();
    const html = String(body.html || '').trim();
    const fps = Math.min(60, Math.max(1, Number(body.options?.fps) || 30));
    const quality = QUALITY_VALUES.has(body.options?.quality) ? body.options.quality : 'high';

    if (!validateRenderHtml(html)) {
      return NextResponse.json({ error: 'HTML composition is not allowed' }, { status: 400 });
    }

    await mkdir(tempDir, { recursive: true });
    await mkdir(rendersDir, { recursive: true });
    await writeFile(htmlPath, hardenRenderHtml(html), 'utf8');

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
