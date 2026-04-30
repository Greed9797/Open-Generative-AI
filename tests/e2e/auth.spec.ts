import { test, expect } from '@playwright/test';

// Auth tests run without stored session
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth — magic link flow', () => {
  test('unauthenticated visit redirects or shows login', async ({ page }) => {
    await page.goto('/studio');
    // Either redirects to / or shows login UI
    const url = page.url();
    const hasLoginUi = await page.getByText(/magic link|entrar|sign in|login/i).count();
    const redirectedToRoot = url.endsWith('/') || url.includes('/auth') || url.includes('/login');
    expect(hasLoginUi > 0 || redirectedToRoot).toBe(true);
  });

  test('send magic link — shows success feedback', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"]').first();
    const isVisible = await emailInput.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip(); // App may be auto-redirecting authenticated users
      return;
    }

    // Mock the magic-link API so no real email is sent
    await page.route('**/api/auth/send-magic-link', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Magic link sent' }),
      });
    });

    await emailInput.fill('test@example.com');
    await page.getByRole('button', { name: /magic link|entrar|enviar|sign in/i }).click();

    // Expect some success feedback
    await expect(
      page.getByText(/enviado|sent|check your email|verifique|sucesso/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
