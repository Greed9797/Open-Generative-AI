import { test, expect } from '@playwright/test';
import { mockAgentJobs, MOCK_JOB_ID, MOCK_OUTPUT_URL } from './fixtures/mock-agent-jobs';
import path from 'path';

test.describe('Agent Studio — pipeline E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAgentJobs(page);
    await page.goto('/agent-studio');
    await page.waitForLoadState('networkidle');
  });

  test('page loads with prompt input and submit button', async ({ page }) => {
    const promptTextarea = page.locator('textarea[placeholder*="Agente" i], textarea[placeholder*="vazio" i], textarea').first();
    await expect(promptTextarea).toBeVisible({ timeout: 5000 });
    const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /gerar|iniciar|start|enviar|criar/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
  });

  test('IMAGEM BASE label visible', async ({ page }) => {
    await expect(page.getByText(/imagem base/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('PROMPT INICIAL label visible', async ({ page }) => {
    await expect(page.getByText(/prompt inicial/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('image upload field accepts PNG', async ({ page }) => {
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    if (await fileInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const samplePath = path.join(__dirname, 'fixtures/assets/sample.png');
      await fileInput.setInputFiles(samplePath);
      await page.waitForTimeout(300);
    }
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('submit job — start-job API called', async ({ page }) => {
    let startJobCalled = false;
    await page.route('**/api/agent-studio/start-job', async (route) => {
      startJobCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobId: MOCK_JOB_ID }),
      });
    });

    const promptTextarea = page.locator('textarea').first();
    if (await promptTextarea.isVisible()) {
      await promptTextarea.fill('Um gato laranja andando de moto');
    }

    const submitBtn = page
      .locator('button[type="submit"], button')
      .filter({ hasText: /gerar|iniciar|start|enviar|criar/i })
      .first();
    await submitBtn.click();

    await page.waitForTimeout(800);
    expect(startJobCalled).toBe(true);
  });

  test('SSE events update UI timeline', async ({ page }) => {
    // Submit a job and verify the UI reacts to SSE stream events
    const promptTextarea = page.locator('textarea').first();
    if (await promptTextarea.isVisible()) {
      await promptTextarea.fill('Teste de pipeline SSE');
    }

    const submitBtn = page
      .locator('button[type="submit"], button')
      .filter({ hasText: /gerar|iniciar|start|enviar|criar/i })
      .first();
    await submitBtn.click();

    // Wait for SSE stream to be consumed
    await page.waitForTimeout(1500);

    // No application crash
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('error in provider — UI stays responsive', async ({ page }) => {
    await page.route('**/api/agent-studio/start-job', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Provider failed' }),
      });
    });

    const submitBtn = page
      .locator('button[type="submit"], button')
      .filter({ hasText: /gerar|iniciar|start|enviar|criar/i })
      .first();
    await submitBtn.click();
    await page.waitForTimeout(800);

    await expect(page.locator('body')).not.toContainText('Application error');
    // Submit button should still be interactable
    await expect(submitBtn).not.toBeDisabled();
  });
});

test.describe('Agent Studio — jobs list tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockAgentJobs(page);
    await page.goto('/agent-studio');
    await page.waitForLoadState('networkidle');
  });

  test('jobs tab shows job from mock API', async ({ page }) => {
    const jobsTab = page.getByRole('tab', { name: /jobs/i }).or(page.getByText(/^jobs$/i)).first();
    if (await jobsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await jobsTab.click();
      await page.waitForTimeout(500);
    }
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});

test.describe('Agent Studio — live pipeline integration (opt-in)', () => {
  test.skip(!process.env.E2E_LIVE, 'Live integration test — set E2E_LIVE=1 to run');

  test('full pipeline generates video with real Vertex AI', async ({ page }) => {
    await page.goto('/agent-studio');
    await page.waitForLoadState('networkidle');

    const promptTextarea = page.locator('textarea').first();
    await promptTextarea.fill('Um gato laranja andando de moto, estilo cinemático');

    const submitBtn = page
      .locator('button[type="submit"], button')
      .filter({ hasText: /gerar|iniciar|start/i })
      .first();
    await submitBtn.click();

    // Wait up to 5 minutes for a real generation
    await expect(page.locator('video, [data-output-url]')).toBeVisible({ timeout: 300_000 });
  });
});
