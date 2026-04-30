import { NextResponse } from 'next/server';
import { preprocessImage } from '@/lib/image-preprocessor';
import { requireAuthenticatedUser } from '@/lib/security.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const { imageUrl, targetModel } = await request.json().catch(() => ({}));
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });

  try {
    const result = await preprocessImage({ imageUrl, targetModel, dryRun: true });
    return NextResponse.json({ issues: result.issues, originalSize: result.originalSize });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
