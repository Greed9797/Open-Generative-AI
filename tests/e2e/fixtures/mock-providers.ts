import type { Page } from '@playwright/test';

const MOCK_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';
const MOCK_IMAGE_URL = 'https://placehold.co/512x512.png';

/** Intercept all /api/proxy/** calls and return instant mock responses. */
export async function mockAllProviders(page: Page) {
  // POST — submit generation job
  await page.route('**/api/proxy/**', async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          request_id: `mock:${Date.now()}`,
          status: 'processing',
        }),
      });
    } else if (method === 'GET') {
      // Poll for result — return completed immediately
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'completed',
          url: MOCK_VIDEO_URL,
          outputs: [MOCK_VIDEO_URL],
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/** Return a provider error (502) for testing error-handling flows. */
export async function mockProviderError(page: Page, message = 'Provider submission failed') {
  await page.route('**/api/proxy/**', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: message }),
    });
  });
}

/** Expose mock URLs so specs can assert against them. */
export const MOCK_URLS = { video: MOCK_VIDEO_URL, image: MOCK_IMAGE_URL };
