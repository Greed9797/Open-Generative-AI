import { getPublicJob } from '../../../../../lib/agent-jobs.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_request, { params }) {
  const { jobId } = await params;
  let cancelled = false;
  let timer;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      async function tick() {
        if (cancelled) return;
        try {
          const job = await getPublicJob(jobId);
          if (cancelled) return;
          if (!job) {
            controller.enqueue(encoder.encode('data: {"error":"job not found"}\n\n'));
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));
          if (job.status === 'done' || job.status === 'failed') {
            controller.close();
            return;
          }
        } catch {
          // Ignore transient read errors — keep polling.
        }
        timer = setTimeout(tick, 1000);
      }
      tick();
    },
    cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
