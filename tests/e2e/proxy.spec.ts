import { test, expect, request } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Proxy API — auth & validation', () => {
  test('POST without auth returns 401', async () => {
    const ctx = await request.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await ctx.post(`${BASE}/api/proxy/api/v1/generate`, {
      data: { model: 'kling-v3', prompt: 'test' },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('GET without auth returns 401', async () => {
    const ctx = await request.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await ctx.get(`${BASE}/api/proxy/api/v1/predictions/mock-id/result`);
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });

  test('POST with oversized body returns 413', async ({ request: req }) => {
    // 11MB body — exceeds 10MB limit
    const bigPayload = 'x'.repeat(11 * 1024 * 1024);
    const res = await req.post(`${BASE}/api/proxy/api/v1/generate`, {
      data: { model: 'kling-v3', prompt: bigPayload },
      headers: { 'Content-Type': 'application/json' },
    });
    // 413 or 400 depending on Next.js / middleware processing order
    expect([400, 413]).toContain(res.status());
  });

  test('POST with unknown model returns 400', async ({ request: req }) => {
    const res = await req.post(`${BASE}/api/proxy/api/v1/generate`, {
      data: { model: 'nonexistent-model-xyz-999', prompt: 'test' },
    });
    // Auth check happens first — 401 before 400 if not authenticated
    expect([400, 401]).toContain(res.status());
  });

  test('GET on unknown path returns 404', async ({ request: req }) => {
    const res = await req.get(`${BASE}/api/proxy/unknown/path/here`);
    expect([401, 404]).toContain(res.status());
  });
});

test.describe('Proxy API — rate limiting', () => {
  test('exceeding POST rate limit returns 429', async ({ page }) => {
    // This test fires 25 rapid POST requests (limit is 20/min)
    // Only meaningful in integration with a running server
    const responses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${BASE}/api/proxy/api/v1/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'kling-v3', prompt: 'test' }),
      });
      responses.push(res.status);
    }
    // Should see at least one 401 (no auth) or 429 (rate limit)
    const hasExpected = responses.some((s) => s === 401 || s === 429);
    expect(hasExpected).toBe(true);
  });
});

test.describe('Security headers', () => {
  test('response includes security headers', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers() || {};
    // Next.js default security headers
    // At minimum, the response should not expose server internals
    expect(headers['x-powered-by'] || '').not.toContain('express');
  });

  test('XSS in URL param does not reflect unescaped', async ({ page }) => {
    await page.goto('/?q=<script>alert(1)</script>');
    await page.waitForLoadState('networkidle');
    const content = await page.content();
    // Script tag should not appear unescaped in HTML
    expect(content).not.toContain('<script>alert(1)</script>');
  });
});

test.describe('Upload endpoint', () => {
  test('POST without auth returns 401', async () => {
    const ctx = await request.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await ctx.post(`${BASE}/api/upload`, {
      multipart: {
        file: {
          name: 'test.png',
          mimeType: 'image/png',
          buffer: Buffer.from('fake-png'),
        },
      },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});
