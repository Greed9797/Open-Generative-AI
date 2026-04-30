const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function stripFence(value) {
  return String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

export async function extractVisionBriefing({ baseImageUrl, geminiApiKey }) {
  if (!baseImageUrl || !geminiApiKey) return null;
  try {
    const imageResponse = await fetch(baseImageUrl);
    if (!imageResponse.ok) return null;
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const imageBase64 = Buffer.from(await imageResponse.arrayBuffer()).toString('base64');
    const response = await fetch(`${GEMINI_URL}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: 'Return only JSON: { "subject": string, "environment": string, "mood": string, "lighting": string, "composition": string, "colors": string[], "movementPotential": string, "risks": string[] }' },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    return JSON.parse(stripFence(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'));
  } catch {
    return null;
  }
}
