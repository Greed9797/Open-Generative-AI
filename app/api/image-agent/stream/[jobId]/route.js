import { getPublicImageAgentJob } from '@/lib/image-agent-jobs';
import { requireAuthenticatedUser } from '@/lib/security.mjs';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request, { params }) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const jobId = params?.jobId;
  const encoder = new TextEncoder();

  return new Response(new ReadableStream({
    async start(controller) {
      async function tick() {
        const job = await getPublicImageAgentJob(jobId, auth.user.id);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(job || { id: jobId, status: 'missing' })}\n\n`));
        if (!job || job.status === 'done' || job.status === 'failed') {
          controller.close();
          return;
        }
        setTimeout(tick, 1000);
      }
      tick();
    },
  }), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
