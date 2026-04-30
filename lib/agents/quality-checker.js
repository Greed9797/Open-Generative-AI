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

export async function checkQuality({ clipUrl, segmentPrompt, attempt, baseImageUrl, segmentIndex = 0, apiKeys, userId }) {
  const { key } = await resolveApiKey({ userId, role: 'analysis_agent', fallbackKeys: apiKeys });
  const { frames, warning } = await extractFrames(clipUrl, baseImageUrl);
  if (warning) console.warn('[quality-checker]', warning);

  const includeReference = segmentIndex === 0 && !!baseImageUrl;

  const imageParts = [];
  if (includeReference) {
    try {
      const refBase64 = await urlToBase64(baseImageUrl);
      imageParts.push({ inline_data: { mime_type: 'image/jpeg', data: refBase64 } });
    } catch { /* non-fatal — skip reference frame */ }
  }
  imageParts.push(...frames.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })));

  const refContext = includeReference
    ? 'The FIRST image is the REFERENCE (base image the user provided). The remaining images are frames extracted from the generated video. Use the reference to evaluate subject/visual consistency.'
    : 'The images below are frames extracted from the generated video.';

  const subjectConsistencyRule = includeReference
    ? 'subjectConsistency: compare video subjects vs the reference image — 10 = identical subject/style/colors, 0 = nothing matches'
    : 'subjectConsistency: evaluate internal consistency between frames — 10 = same subject/style throughout, 0 = completely inconsistent';

  const evaluationPrompt = `${refContext}

Return ONLY a JSON object with this exact shape:
{ "score": number 0-10, "passed": boolean, "problems": string[], "suggestions": string[], "breakdown": { "promptAdherence": number 0-10, "motionQuality": number 0-10, "subjectConsistency": number 0-10, "visualArtifacts": number 0-10, "cinematicQuality": number 0-10 }, "cinematographyCompliance": { "cameraMovement": number 0-10, "lighting": number 0-10, "colorGrade": number 0-10 } }

Rules:
- passed = score >= 7
- visualArtifacts is inverted: 10 = no artifacts, 0 = severe artifacts
- ${subjectConsistencyRule}
- promptAdherence: 0 = ignores prompt, 5 = partial match, 10 = exact literal match
- Evaluate attempt ${attempt} for prompt: "${segmentPrompt}"`;


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
    cinematographyCompliance: {
      cameraMovement: Number(parsed.cinematographyCompliance?.cameraMovement) || 0,
      lighting: Number(parsed.cinematographyCompliance?.lighting) || 0,
      colorGrade: Number(parsed.cinematographyCompliance?.colorGrade) || 0,
    },
    warning,
  };
}

export async function checkPromptViability({ prompt }) {
  const text = String(prompt || '').toLowerCase();
  const risky = [
    'many people',
    'crowd',
    'multiple faces',
    'readable text',
    'logo text',
    'complex hands',
    'fast camera shake',
    'rapid morphing',
  ].filter((term) => text.includes(term));

  if (risky.length === 0) {
    return { riskLevel: 'low', simplifiedPrompt: prompt, risks: [] };
  }

  const simplifiedPrompt = String(prompt || '')
    .replace(/many people|crowd/gi, 'one clear subject')
    .replace(/readable text|logo text/gi, 'clean product surface without readable text')
    .replace(/fast camera shake|rapid morphing/gi, 'stable cinematic camera movement');

  return {
    riskLevel: risky.length >= 2 ? 'high' : 'medium',
    simplifiedPrompt,
    risks: risky,
  };
}
