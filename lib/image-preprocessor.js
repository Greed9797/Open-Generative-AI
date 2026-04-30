import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createServiceClient } from './supabase/service.js';

const TARGET_RESOLUTIONS = {
  seedance: { width: 1280, height: 720 },
  veo3: { width: 1280, height: 720 },
  kling: { width: 1280, height: 720 },
  runway: { width: 1280, height: 768 },
  default: { width: 1280, height: 720 },
};

function family(targetModel = '') {
  const value = String(targetModel).toLowerCase();
  if (value.includes('seedance')) return 'seedance';
  if (value.includes('veo')) return 'veo3';
  if (value.includes('kling')) return 'kling';
  if (value.includes('runway') || value.includes('gen4')) return 'runway';
  return 'default';
}

async function downloadImage(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function preprocessImage({ imageUrl, targetModel, dryRun = false, userId = 'system', jobId = randomUUID(), segmentIndex = 0 }) {
  const input = await downloadImage(imageUrl);
  const metadata = await sharp(input).metadata();
  const target = TARGET_RESOLUTIONS[family(targetModel)] || TARGET_RESOLUTIONS.default;
  const issues = [];
  if ((metadata.width || 0) < 512 || (metadata.height || 0) < 512) issues.push('resolution_below_512');
  const ratio = (metadata.width || 1) / (metadata.height || 1);
  const targetRatio = target.width / target.height;
  if (Math.abs(ratio - targetRatio) > 0.2) issues.push('aspect_ratio_not_ideal');

  const originalSize = { width: metadata.width, height: metadata.height, format: metadata.format };
  if (dryRun) return { issues, originalSize };

  const output = await sharp(input)
    .resize(target.width, target.height, { fit: 'cover', position: 'centre' })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 3 })
    .normalize()
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const supabase = createServiceClient();
  const storagePath = `preprocessed/${userId}/${jobId}-${segmentIndex}.jpg`;
  const { error } = await supabase.storage.from('agent-uploads').upload(storagePath, output, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(`Preprocessed upload failed: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from('agent-uploads').getPublicUrl(storagePath);
  return {
    processedUrl: publicUrl,
    originalSize,
    processedSize: { width: target.width, height: target.height, format: 'jpeg' },
    issues,
    wasResized: metadata.width !== target.width || metadata.height !== target.height,
  };
}
