import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('app loads without crashing', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBeLessThan(500);
  // Should either show landing page or redirect to studio
  await expect(page).toHaveURL(/\/|\/studio/);
  // No unhandled error overlay
  await expect(page.locator('body')).not.toContainText('Application error');
});

test('static assets load (no 404s for critical chunks)', async ({ page }) => {
  const failedRequests: string[] = [];
  page.on('response', (res) => {
    if (res.status() === 404 && res.url().includes('/_next/')) {
      failedRequests.push(res.url());
    }
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(failedRequests).toEqual([]);
});
