import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveApiKey } from '../resolve-api-key.js';

const execFileAsync = promisify(execFile);
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function stripFence(value) {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

async function urlToBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch fallback frame: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}

async function extractFrames(clipUrl, baseImageUrl) {
  const tempDir = path.join(process.cwd(), '.agent-frames', randomUUID());
  await mkdir(tempDir, { recursive: true });
  const outputPattern = path.join(tempDir, 'frame%03d.jpg');
  const readFrames = async () => {
    const files = (await readdir(tempDir)).filter((file) => file.endsWith('.jpg')).sort().slice(0, 8);
    const frames = [];
    for (const file of files) {
      frames.push((await readFile(path.join(tempDir, file))).toString('base64'));
    }
    return frames;
  };
  try {
    await execFileAsync('ffmpeg', ['-i', clipUrl, '-vf', 'fps=1,scale=512:-1', '-frames:v', '8', outputPattern, '-y'], {
      timeout: 60 * 1000,
      maxBuffer: 1024 * 1024 * 5,
    });
    return { frames: await readFrames(), warning: null };
  } catch (error) {
    try {
      const response = await fetch(clipUrl);
      if (!response.ok) throw new Error(`Clip fetch failed: ${response.status}`);
      const localClipPath = path.join(tempDir, 'clip.mp4');
      await writeFile(localClipPath, Buffer.from(await response.arrayBuffer()));
      await execFileAsync('ffmpeg', ['-i', localClipPath, '-vf', 'fps=1,scale=512:-1', '-frames:v', '8', outputPattern, '-y'], {
        timeout: 60 * 1000,
        maxBuffer: 1024 * 1024 * 5,
      });
      return {
        frames: await readFrames(),
        warning: `ffmpeg could not read the remote URL directly; extracted frames from a downloaded temp file. ${error.message}`,
      };
    } catch (fallbackError) {
      const fallbackFrame = baseImageUrl ? await urlToBase64(baseImageUrl).catch(() => null) : null;
      return {
        frames: fallbackFrame ? [fallbackFrame] : [],
        warning: `ffmpeg frame extraction failed; used fallback base image frame. Remote error: ${error.message}. Local fallback error: ${fallbackError.message}`,
      };
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function checkQuality({ clipUrl, segmentPrompt, attempt, baseImageUrl, apiKeys, userId }) {
  const { key } = await resolveApiKey({ userId, role: 'analysis_agent', fallbackKeys: apiKeys });
  const { frames, warning } = await extractFrames(clipUrl, baseImageUrl);
  const imageParts = frames.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } }));
  if (warning) console.warn('[quality-checker]', warning);
  const evaluationPrompt = `Return ONLY a JSON object with this exact shape: { "score": number 0-10, "passed": boolean, "problems": string[], "suggestions": string[], "breakdown": { "promptAdherence": number 0-10, "motionQuality": number 0-10, "subjectConsistency": number 0-10, "visualArtifacts": number 0-10, "cinematicQuality": number 0-10 } }. passed must equal score >= 7. visualArtifacts is inverted: 10 means no artifacts. Evaluate attempt ${attempt} for this prompt: ${segmentPrompt}. Criteria: prompt adherence, motion quality with no freezing or stuttering, subject consistency, visual artifacts, cinematic quality.`;

  const response = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [...imageParts, { text: evaluationPrompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Gemini quality check failed');
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const parsed = JSON.parse(stripFence(content));
  const score = Number(parsed.score) || 0;
  const breakdown = parsed.breakdown || {};
  return {
    score,
    passed: score >= 7,
    problems: Array.isArray(parsed.problems) ? parsed.problems : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    breakdown: {
      promptAdherence: Number(breakdown.promptAdherence) || 0,
      motionQuality: Number(breakdown.motionQuality) || 0,
      subjectConsistency: Number(breakdown.subjectConsistency) || 0,
      visualArtifacts: Number(breakdown.visualArtifacts) || 0,
      cinematicQuality: Number(breakdown.cinematicQuality) || 0,
    },
    warning,
  };
}
