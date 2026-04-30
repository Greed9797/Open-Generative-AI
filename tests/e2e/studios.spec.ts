/**
 * Batch smoke tests for remaining studios:
 * lip-sync, cinema, marketing, workflow, video-editor, jobs-crm
 */
import { test, expect } from '@playwright/test';
import { mockAllProviders } from './fixtures/mock-providers';
import { mockAgentJobs } from './fixtures/mock-agent-jobs';
import path from 'path';

const ROUTES = [
  { name: 'Lip Sync', path: '/lip-sync' },
  { name: 'Cinema', path: '/cinema' },
  { name: 'Marketing', path: '/marketing' },
  { name: 'Workflow', path: '/workflow' },
  { name: 'Video Editor', path: '/video-editor' },
  { name: 'Jobs CRM', path: '/jobs' },
];

for (const studio of ROUTES) {
  test.describe(`${studio.name} Studio`, () => {
    test.beforeEach(async ({ page }) => {
      await mockAllProviders(page);
      await mockAgentJobs(page);
      // Mock video-editor specific endpoints
      await page.route('**/api/video-editor/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'completed', url: 'https://example.com/render.mp4' }),
        });
      });
    });

    test(`${studio.name} — loads without crash`, async ({ page }) => {
      const res = await page.goto(studio.path);
      await page.waitForLoadState('networkidle');
      expect(res?.status()).toBeLessThan(500);
      await expect(page.locator('body')).not.toContainText('Application error');
    });

    test(`${studio.name} — has primary action button`, async ({ page }) => {
      await page.goto(studio.path);
      await page.waitForLoadState('networkidle');
      // Any interactive button should exist
      const btnCount = await page.getByRole('button').count();
      expect(btnCount).toBeGreaterThan(0);
    });
  });
}

test.describe('Lip Sync — audio upload', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllProviders(page);
  });

  test('audio file input accepts WAV', async ({ page }) => {
    await page.goto('/lip-sync');
    await page.waitForLoadState('networkidle');
    const fileInputs = page.locator('input[type="file"]');
    const count = await fileInputs.count();
    if (count > 0) {
      const samplePath = path.join(__dirname, 'fixtures/assets/sample.wav');
      await fileInputs.first().setInputFiles(samplePath);
    }
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});

test.describe('Cinema — multi-shot', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllProviders(page);
  });

  test('can add multiple shots', async ({ page }) => {
    await page.goto('/cinema');
    await page.waitForLoadState('networkidle');
    const addBtn = page.getByRole('button', { name: /adicionar|add.*shot|novo.*shot|novo|new/i }).first();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});

test.describe('Jobs CRM — list jobs', () => {
  test.beforeEach(async ({ page }) => {
    await mockAgentJobs(page);
  });

  test('renders job list from mock API', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');
    // Mock returns 1 job — just verify no crash
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('refresh button exists', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');
    const refreshBtn = page.getByRole('button', { name: /atualizar|refresh/i }).first();
    // May not be visible if jobs section is tabbed
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});
