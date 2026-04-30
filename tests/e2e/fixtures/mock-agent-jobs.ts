import type { Page } from '@playwright/test';

const MOCK_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';

const SSE_EVENTS = [
  { event: 'orchestrator_done', data: { plan: [{ prompt: 'Test prompt', targetModel: 'kling', duration: 8 }] } },
  { event: 'prompt_engineered', data: { segmentIndex: 0, prompt: 'Test prompt. Cinematic, 4K.' } },
  { event: 'clip_generated', data: { segmentIndex: 0, clipUrl: MOCK_VIDEO_URL } },
  { event: 'quality_checked', data: { segmentIndex: 0, passed: true, score: 8.5, feedback: 'Looks great.' } },
  { event: 'final_render_done', data: { outputUrl: MOCK_VIDEO_URL } },
];

function buildSSEBody(jobId: string): string {
  return SSE_EVENTS.map((e) =>
    `event: ${e.event}\ndata: ${JSON.stringify({ jobId, ...e.data })}\n\n`,
  ).join('');
}

/** Mock all Agent Studio API endpoints. */
export async function mockAgentJobs(page: Page, jobId = 'mock-job-123') {
  // start-job
  await page.route('**/api/agent-studio/start-job', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jobId }),
    });
  });

  // list-jobs
  await page.route('**/api/agent-studio/list-jobs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jobs: [
          {
            id: jobId,
            status: 'completed',
            prompt: 'Test prompt',
            targetModel: 'kling',
            createdAt: new Date().toISOString(),
            outputUrl: MOCK_VIDEO_URL,
          },
        ],
      }),
    });
  });

  // job-status
  await page.route(`**/api/agent-studio/job-status/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'completed', outputUrl: MOCK_VIDEO_URL }),
    });
  });

  // SSE stream — return all events as a complete SSE body
  await page.route(`**/api/agent-studio/stream/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      body: buildSSEBody(jobId),
    });
  });

  // upload-base-image
  await page.route('**/api/agent-studio/upload-base-image', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://placehold.co/512x512.png' }),
    });
  });
}

export const MOCK_JOB_ID = 'mock-job-123';
export const MOCK_OUTPUT_URL = MOCK_VIDEO_URL;
