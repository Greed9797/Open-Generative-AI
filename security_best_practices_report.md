# Security Best Practices Report

Date: 2026-04-28
Scope: Web production app only (Next.js/React APIs, Supabase, uploads, render jobs, Docker/runtime). Electron desktop packaging is documented as out of this web-production scope.

## Executive Summary

Implemented the highest-risk fixes found during the scan: open redirect prevention, authentication on previously public job APIs, upload validation, job ID path traversal protection, rate limits on costly endpoints, global security headers, sanitized client errors, and Docker hardening.

No application can be made "100% secure"; this pass reduces common vibecoded-site risks and leaves explicit residual items below for deployment validation.

## Critical / High Findings

### SEC-001: Open Redirect in Auth Callback

- Severity: High
- Location: `app/auth/callback/route.js` lines 3, 12, 37, 46, 51
- Evidence: the callback previously concatenated attacker-controlled `next` into redirect URLs.
- Impact: attackers could craft auth links that redirect users to external phishing domains after login.
- Fix: added `safeRedirectPath()` in `lib/security.mjs` line 4 and changed redirects to `new URL(next, origin)`.
- Test: `tests/security.test.mjs` covers `https://evil.example`, `//evil.example`, encoded protocol-relative paths, and valid `/studio`.

### SEC-002: Public Job Access and Job ID Path Traversal

- Severity: High
- Location: `lib/agent-jobs.js` lines 6, 22, 26, 163, 175, 202; job routes under `app/api/agent-studio/*`
- Evidence: job status/list/stream were accessible with job ID alone, and `.agent-jobs/${id}.json` accepted arbitrary IDs.
- Impact: valid job IDs could expose user job metadata; crafted IDs could attempt path traversal reads/writes.
- Fix: added UUID validation via `isSafeJobId()`, owner filtering for public job reads, and auth checks in list/status/stream routes.

### SEC-003: Unsafe Upload Handling

- Severity: High
- Location: `app/api/upload/route.js`, `app/api/agent-studio/upload-base-image/route.js`, `app/api/settings/profile/avatar/route.js`
- Evidence: uploads accepted declared MIME/name, no strict size/content validation, and used `upsert`.
- Impact: malicious or oversized files could be stored as trusted media, overwrite objects, or exhaust memory/storage.
- Fix: added `validateUploadFile()` in `lib/security.mjs` line 134, content-length limits, image signature checks, sanitized generated object names, and `upsert: false`.
- Test: `tests/security.test.mjs` covers valid PNG, mismatched content, and oversized upload rejection.

### SEC-004: Costly APIs Allowed Anonymous or Unbounded Use

- Severity: High
- Location: `app/api/agent-studio/start-job/route.js` lines 50, 54; `app/api/proxy/[[...path]]/route.js` lines 24, 27, 73, 76; `app/api/video-editor/render/route.js` lines 55, 57; `app/api/video-editor/generate-composition/route.js`
- Evidence: generation/render/proxy workflows could run with optional auth or no app-level throttling.
- Impact: unauthenticated abuse could consume external provider credits, CPU, and storage.
- Fix: added `requireAuthenticatedUser()`, in-memory rate limits, payload limits, sanitized inputs, and generic client errors.

## Medium Findings

### SEC-005: Missing Security Headers

- Severity: Medium
- Location: `next.config.mjs` lines 8-46
- Evidence: no global CSP, clickjacking, referrer, MIME sniffing, or permission headers were configured.
- Impact: XSS and clickjacking defenses were weaker if a rendering bug appeared elsewhere.
- Fix: added global headers with production-only HSTS and `SECURITY_HEADERS_ENABLED=false` escape hatch.
- Residual risk: CSP keeps `'unsafe-inline'` and `'unsafe-eval'` for current Next/Hyperframes compatibility; tighten after runtime validation.

### SEC-006: Render HTML Treated as Trusted

- Severity: Medium
- Location: `app/api/video-editor/render/route.js` lines 20-42, 70-80; `lib/render-final.js` lines 10-57
- Evidence: raw HTML and clip URLs were written to disk and rendered by a browser/CLI.
- Impact: attacker-controlled active HTML could execute in the renderer context or load unexpected resources.
- Fix: added render HTML validation, render-time CSP meta tags, URL protocol allowlists, escaped attributes, fixed CLI args, and generic render errors.

### SEC-007: Production Runtime Hardening

- Severity: Medium
- Location: `Dockerfile` line 53; `.dockerignore`; `.env.example`
- Evidence: Docker lacked healthcheck and context exclusions; env example lacked security knobs.
- Impact: larger build context could leak local files; production health and security controls were harder to verify.
- Fix: added `.dockerignore`, healthcheck, and documented `SECURITY_HEADERS_ENABLED`, `MAX_UPLOAD_MB`, `MAX_AVATAR_MB`, and `RATE_LIMIT_REDIS_URL`.

## Dependency Findings

### SEC-008: Dependency Audit Residuals

- Severity: Medium
- Evidence: final `npm ls postcss --all` resolves `postcss@8.5.12` at the root and `postcss@8.4.31` bundled under `next@15.5.15`.
- Fix attempted: a scoped npm `overrides` entry was tested, but npm left the Next-bundled dependency invalid instead of replacing it, so the override was removed to avoid an inconsistent install tree.
- Residual risk: final production audit still reports 2 moderate advisories (`next` via bundled `postcss`). Full audit also reports Electron/electron-builder family advisories, outside the selected web-production scope unless the desktop app is distributed.

## Verification

- `npm test`: PASS, 5 security unit tests.
- `npm run build`: PASS.
- `npm audit --omit=dev`: FAIL, 2 moderate advisories remain: `next` and bundled `postcss`.
- `npm run lint`: no lint findings were produced; the installed `next lint` command shows a deprecation/setup prompt because this repo has no ESLint config file.

## Deployment Notes

- If deployed behind Docker/self-hosting, keep a reverse proxy or edge layer for distributed rate limiting, request body limits, and TLS/HSTS enforcement.
- The in-memory rate limiter is suitable as an app-level backstop, not a distributed abuse-control system. Use Redis/Upstash or platform edge rate limits when scaling horizontally.
- `APP_URL` should be set to the canonical production origin. Do not derive login/magic-link origins from arbitrary request headers in production.
