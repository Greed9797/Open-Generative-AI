import { resolveApiKey } from '../resolve-api-key.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function stripFence(text) {
  return String(text || '').replace(/```json|```/g, '').trim();
}

function parseJson(text) {
  const cleaned = stripFence(text);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

async function imagePartFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image for QA: ${response.status}`);
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  const data = Buffer.from(await response.arrayBuffer()).toString('base64');
  return { inline_data: { mime_type: mimeType, data } };
}

export async function checkImageQuality({
  imageUrl,
  prompt,
  workflow,
  referenceImages = [],
  attempt = 1,
  userId,
  apiKeys,
}) {
  try {
    const key = apiKeys?.geminiApiKey || (await resolveApiKey({ role: 'analysis_agent', userId })).key;
    const parts = [
      {
        text: [
          'You are a strict generative image QA evaluator.',
          'Return only JSON with: score 0-10, passed boolean, problems string[], suggestions string[], breakdown object.',
          'Breakdown keys: promptAdherence, referenceConsistency, composition, aesthetics, artifacts.',
          'Focus on severe structural defects: broken anatomy, extra/missing limbs or fingers, unreadable faces, heavy noise, watermark/text artifacts, incorrect core object identity, and severe prompt mismatch.',
          'Be tolerant of subtle artistic variation, small shadow angle differences, minor color mood shifts, and harmless composition differences.',
          'The threshold is for technical usability, not artistic perfection. Do not reject a good image for minor subjective taste.',
          `Workflow: ${workflow || 'general'}`,
          `Attempt: ${attempt}`,
          `Prompt: ${prompt || ''}`,
          `Reference image count: ${referenceImages.length}`,
        ].join('\n'),
      },
    ];
    for (const url of referenceImages.slice(0, 4)) {
      parts.push({ text: 'Reference image:' });
      parts.push(await imagePartFromUrl(url));
    }
    parts.push({ text: 'Generated image to evaluate:' });
    parts.push(await imagePartFromUrl(imageUrl));

    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, response_mime_type: 'application/json' },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Gemini image QA failed');
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
    const parsed = parseJson(text) || {};
    const score = Number(parsed.score ?? 0);
    return {
      score: Number.isFinite(score) ? score : 0,
      passed: Boolean(parsed.passed ?? score >= 7),
      problems: Array.isArray(parsed.problems) ? parsed.problems.slice(0, 8) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 8) : [],
      breakdown: parsed.breakdown || {},
    };
  } catch (error) {
    return {
      score: 0,
      passed: false,
      problems: [`QA failed: ${error.message}`],
      suggestions: ['Retry with a simpler prompt and fewer reference constraints.'],
      breakdown: {},
    };
  }
}

export async function describeReferenceImages({ referenceImages = [], prompt, workflow, userId, apiKeys }) {
  if (!referenceImages.length) return null;
  try {
    const key = apiKeys?.geminiApiKey || (await resolveApiKey({ role: 'analysis_agent', userId })).key;
    const parts = [
      {
        text: [
          'Describe these reference images for a downstream image generation prompt.',
          'Return only JSON: {subjects:string[], style:string, colors:string[], composition:string, constraints:string[], risks:string[]}.',
          `Workflow: ${workflow || 'general'}`,
          `User request: ${prompt || ''}`,
        ].join('\n'),
      },
    ];
    for (const url of referenceImages.slice(0, 8)) {
      parts.push(await imagePartFromUrl(url));
    }
    const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, response_mime_type: 'application/json' },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Gemini reference analysis failed');
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
    return parseJson(text);
  } catch {
    return null;
  }
}
