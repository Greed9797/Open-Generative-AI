const DEFAULT_UPLOAD_MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
const RATE_LIMITS = new Map();

export function safeRedirectPath(value, fallback = '/studio') {
  const candidate = typeof value === 'string' ? value.trim() : '';
  const safeFallback = typeof fallback === 'string' && fallback.startsWith('/') && !fallback.startsWith('//')
    ? fallback
    : '/studio';

  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return safeFallback;

  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return safeFallback;
  }

  if (
    decoded.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
    /[\u0000-\u001f\u007f]/.test(decoded) ||
    decoded.includes('\\')
  ) {
    return safeFallback;
  }

  return candidate;
}

export function securityHeaders() {
  const headers = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'X-Frame-Options': 'DENY',
  };

  if (process.env.NODE_ENV === 'production') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  return headers;
}

export function withSecurityHeaders(response) {
  if (process.env.SECURITY_HEADERS_ENABLED === 'false') return response;
  for (const [name, value] of Object.entries(securityHeaders())) {
    response.headers.set(name, value);
  }
  return response;
}

export async function requireAuthenticatedUser(request) {
  const { resolveAuth } = await import('./supabase-vault.js');
  const auth = await resolveAuth(request).catch(() => ({ user: null, accessToken: null }));
  if (!auth.user) {
    return {
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, ...auth };
}

export function jsonError(message = 'Internal server error', status = 500) {
  return Response.json({ error: message }, { status });
}

export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const firstForwarded = forwarded.split(',')[0]?.trim();
  return firstForwarded || request.headers.get('x-real-ip') || 'unknown';
}

export function rateLimit(key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = RATE_LIMITS.get(key);
  if (!bucket || bucket.resetAt <= now) {
    RATE_LIMITS.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAfter: windowMs };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAfter: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, resetAfter: bucket.resetAt - now };
}

export function rateLimitResponse(result) {
  const response = Response.json({ error: 'Too many requests' }, { status: 429 });
  response.headers.set('Retry-After', String(Math.ceil(result.resetAfter / 1000)));
  return response;
}

export function enforceContentLength(request, maxBytes = DEFAULT_UPLOAD_MAX_BYTES) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    return Response.json({ error: 'Payload too large' }, { status: 413 });
  }
  return null;
}

function extensionFromName(name = '') {
  const clean = String(name).toLowerCase().split(/[\\/]/).pop() || '';
  const ext = clean.includes('.') ? clean.split('.').pop() : '';
  return ext.replace(/[^a-z0-9]/g, '');
}

function sniffImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return '';
}

export async function validateUploadFile(file, {
  allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  maxBytes = DEFAULT_UPLOAD_MAX_BYTES,
  requireImageSignature = true,
} = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return { ok: false, status: 400, error: 'File is required' };
  }

  const declaredType = String(file.type || '').toLowerCase();
  const extension = extensionFromName(file.name || '');
  const size = Number(file.size || 0);

  if (size <= 0 || size > maxBytes) {
    return { ok: false, status: 413, error: 'File size is not allowed' };
  }

  if (!allowedMimeTypes.includes(declaredType) || !allowedExtensions.includes(extension)) {
    return { ok: false, status: 415, error: 'File type is not allowed' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== size && buffer.length > maxBytes) {
    return { ok: false, status: 413, error: 'File size is not allowed' };
  }

  if (requireImageSignature) {
    const sniffedType = sniffImageMime(buffer);
    if (!sniffedType || sniffedType !== declaredType) {
      return { ok: false, status: 415, error: 'File content does not match its type' };
    }
  }

  return { ok: true, buffer, extension, mimeType: declaredType };
}
