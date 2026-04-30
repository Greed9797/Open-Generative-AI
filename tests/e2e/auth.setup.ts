import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const testEmail = process.env.E2E_TEST_USER_EMAIL || 'qa-e2e@higgsv.test';
const testPassword = process.env.E2E_TEST_USER_PASSWORD || 'E2eQaHighsv2024!';

setup('authenticate', async ({ page }) => {
  if (!supabaseUrl || !serviceRoleKey) {
    // No Supabase credentials — create an empty storage state so tests can run
    // against an unauthenticated app (proxy/security tests still work).
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ensure test user exists
  const { data: list } = await admin.auth.admin.listUsers();
  const exists = list?.users?.some((u) => u.email === testEmail);
  if (!exists) {
    await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
  }

  // Sign in via the app UI (magic-link bypass: use password if available)
  await page.goto('/');

  // Try to find a password login form; fall back to storing empty state.
  // The app currently uses magic-link only — we inject a Supabase session
  // directly into localStorage to bypass the email round-trip.
  const { data: signIn } = await admin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  }).catch(() => ({ data: null }));

  // Use the JS client to sign in and inject the session cookie/localStorage.
  await page.addInitScript(
    ({ url, anonKey, email, password }) => {
      // Will run before the page script — sets up a pre-loaded session.
      (window as any).__E2E_AUTH__ = { url, anonKey, email, password };
    },
    {
      url: supabaseUrl,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      email: testEmail,
      password: testPassword,
    },
  );

  // Direct sign-in via the Supabase REST endpoint into the app's localStorage.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const signInRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });

  if (signInRes.ok) {
    const session = await signInRes.json();
    // Inject the session into the page's localStorage under the Supabase key.
    await page.goto('/');
    await page.evaluate(
      ({ url, session }) => {
        const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
        localStorage.setItem(key, JSON.stringify(session));
      },
      { url: supabaseUrl, session },
    );
    await page.reload();
  } else {
    // If sign-in failed, store empty state — auth tests will detect and skip.
    await page.goto('/');
  }

  await page.context().storageState({ path: AUTH_FILE });
});
