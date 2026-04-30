import { NextResponse } from 'next/server';
import { resolveApiKey } from '../../../../lib/resolve-api-key.js';
import {
  enforceContentLength,
  getClientIp,
  rateLimit,
  rateLimitResponse,
  requireAuthenticatedUser,
} from '../../../../lib/security.mjs';

export const runtime = 'nodejs';

const MINIMAX_URL = 'https://api.minimax.io/v1/chat/completions';

const HYPERFRAMES_SYSTEM_PROMPT = `You are an expert Hyperframes HTML composition generator for a local HTML-to-video renderer.

You must return ONLY valid, complete HTML. Do not return markdown fences, prose, explanations, JSON, or comments outside the HTML document.

Hyperframes root element rules:
- The document must include one root composition element with id="root".
- The root element must include data-composition-id with a unique kebab-case id.
- The root element must include data-start="0".
- The root element must include data-width and data-height matching the requested output settings.
- The root element should have position: relative; overflow: hidden; background: #000; width and height styles matching the output dimensions.

Clip element rules:
- Every timed element must include class="clip".
- Every timed element must include data-start in seconds.
- Every timed element must include data-duration in seconds.
- Every timed element must include data-track-index. Track index is the layer; 0 is bottom, higher values render above.
- Video clips must use: <video class="clip" data-start data-duration data-track-index src="URL" muted playsinline>.
- Audio clips must use: <audio class="clip" data-start data-duration data-track-index data-volume="0.4" src="URL">.
- Text overlays and graphic elements that are timed must also include class="clip", data-start, data-duration, and data-track-index.

Sequencing multiple video clips:
- Sequence clips by staggering data-start values.
- Example: first clip data-start="0" data-duration="5", second clip data-start="5" data-duration="4", third clip data-start="9" data-duration="6".
- Use the provided clip URLs exactly. Do not invent URLs.
- Use the provided clip durations unless the user explicitly asks to trim or overlap them.

Transitions and common edit patterns:
- For hard cuts, place clips on the same track with consecutive data-start values.
- For crossfades, overlap adjacent videos by 0.5 to 1.0 seconds on nearby track indexes and animate opacity with CSS keyframes or GSAP.
- Add text overlays with absolute positioning, readable typography, high contrast, and timed class="clip" attributes.
- Keep all visual elements inside the requested canvas dimensions.
- Use object-fit: cover for full-frame videos unless the user requests another layout.

GSAP animation rules:
- Load GSAP from https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js when animations are needed.
- Create a GSAP timeline with { paused: true }.
- Ensure window.__timelines exists.
- Register the timeline at window.__timelines["COMPOSITION_ID"] where COMPOSITION_ID exactly matches data-composition-id.
- Example:
  <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(".title", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8 }, 0);
    window.__timelines["my-composition-id"] = tl;
  </script>

Return ONLY the HTML document.`;

function stripMarkdownFences(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function buildUserMessage({ prompt, clips, settings }) {
  return `Create or revise a Hyperframes HTML composition.

User edit request:
${prompt}

Available clips:
${clips.map((clip, index) => `- Clip ${index + 1}: id=${clip.id || index + 1}, label=${clip.label || 'Untitled'}, duration=${clip.duration || 5}s, url=${clip.url}`).join('\n') || '- No clips provided'}

Output settings:
- width: ${settings.width}
- height: ${settings.height}
- fps: ${settings.fps}

Use only the clips listed above unless the user explicitly asks for generated text/shape overlays.`;
}

export async function POST(request) {
  try {
    const tooLarge = enforceContentLength(request, 128 * 1024);
    if (tooLarge) return tooLarge;

    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const supabaseUser = auth.user;

    const limited = rateLimit(`generate-composition:${supabaseUser.id}:${getClientIp(request)}`, { limit: 10, windowMs: 60_000 });
    if (!limited.ok) return rateLimitResponse(limited);

    const { key: minimaxApiKey } = await resolveApiKey({
      userId: supabaseUser.id,
      role: 'orchestrator',
    });

    const body = await request.json();
    const prompt = String(body.prompt || '').trim().slice(0, 4000);
    const clips = Array.isArray(body.clips) ? body.clips.slice(0, 20) : [];
    const settings = {
      width: Math.min(3840, Math.max(320, Number(body.settings?.width) || 1920)),
      height: Math.min(2160, Math.max(240, Number(body.settings?.height) || 1080)),
      fps: Math.min(60, Math.max(1, Number(body.settings?.fps) || 30)),
    };
    const conversationHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory
          .filter((message) => ['user', 'assistant'].includes(message?.role) && message?.content)
          .slice(-10)
          .map((message) => ({ role: message.role, content: String(message.content).slice(0, 4000) }))
      : [];

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const response = await fetch(MINIMAX_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${minimaxApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: [
          { role: 'system', content: HYPERFRAMES_SYSTEM_PROMPT },
          ...conversationHistory,
          { role: 'user', content: buildUserMessage({ prompt, clips, settings }) },
        ],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`[generate composition] provider status=${response.status} message=${data.error?.message || data.message || 'unknown'}`);
      return NextResponse.json(
        { error: 'MiniMax composition request failed' },
        { status: 502 },
      );
    }

    const rawContent = data.choices?.[0]?.message?.content;
    const html = stripMarkdownFences(rawContent);
    if (!html.includes('data-composition-id')) {
      return NextResponse.json(
        { error: 'MiniMax response did not include a valid Hyperframes composition root' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      html,
      assistantMessage: { role: 'assistant', content: html },
      usage: data.usage || null,
    });
  } catch (error) {
    console.error(`[generate composition] error=${error.message}`);
    return NextResponse.json({ error: 'Failed to generate composition' }, { status: 500 });
  }
}
