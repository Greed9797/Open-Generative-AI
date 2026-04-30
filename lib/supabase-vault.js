import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from './supabase/service.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return { url, anonKey, serviceRoleKey };
}

export function assertSupabaseConfigured(requireServiceRole = false) {
  const config = supabaseConfig();
  if (!config.url || !config.anonKey || (requireServiceRole && !config.serviceRoleKey)) {
    throw new Error('Supabase environment variables are not configured');
  }
  return config;
}

export function bearerFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

export async function getSupabaseUser(accessToken) {
  if (!accessToken) return null;
  assertSupabaseConfigured(true);
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}

export async function getSessionFromCookies() {
  const { url, anonKey } = assertSupabaseConfigured();
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, accessToken: null };
  const { data: { session } } = await supabase.auth.getSession();
  return { user, accessToken: session?.access_token || null };
}

export async function createAnonymousSession() {
  const { url, anonKey } = assertSupabaseConfigured();
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ data: { app: 'vbo-ai' } }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.msg || data.error_description || data.error || 'Could not create Supabase session');
  }
  return data;
}

// Resolves auth from cookies first, then falls back to Authorization header.
// Use in all API routes so both browser-session and anonymous-token flows work.
export async function resolveAuth(request) {
  const { user, accessToken } = await getSessionFromCookies();
  if (user && accessToken) return { user, accessToken };
  const bearer = bearerFromRequest(request);
  if (bearer) {
    const bearerUser = await getSupabaseUser(bearer);
    if (bearerUser) return { user: bearerUser, accessToken: bearer };
  }
  return { user: null, accessToken: null };
}

export async function supabaseRpc(functionName, body, { accessToken, serviceRole = false } = {}) {
  if (serviceRole) {
    assertSupabaseConfigured(true);
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc(functionName, body);
    if (error) throw new Error(error.message || `Supabase RPC ${functionName} failed`);
    return data;
  }

  const { url, anonKey, serviceRoleKey } = assertSupabaseConfigured(serviceRole);
  const key = serviceRole ? serviceRoleKey : anonKey;
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      apikey: key,
      Authorization: `Bearer ${serviceRole ? serviceRoleKey : accessToken}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.hint || `Supabase RPC ${functionName} failed`);
  }
  return data;
}

export async function supabaseRest(path, { method = 'GET', body, accessToken, serviceRole = false, headers = {} } = {}) {
  const { url, anonKey, serviceRoleKey } = assertSupabaseConfigured(serviceRole);
  const key = serviceRole ? serviceRoleKey : anonKey;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      ...JSON_HEADERS,
      apikey: key,
      Authorization: `Bearer ${serviceRole ? serviceRoleKey : accessToken}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.hint || `Supabase REST ${method} ${path} failed`);
  }
  return data;
}
