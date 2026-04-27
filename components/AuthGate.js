'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../lib/supabase/client.js';

function getUsableSession(s) {
  if (!s?.user) return null;
  if (s.user.is_anonymous) return null;
  return s;
}

export default function AuthGate({ children, fallback = null }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  // ── auth mode ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // ── session init ───────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      // Handle implicit OAuth hash (Google etc.)
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          const { data, error: e } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!mounted) return;
          if (!e && data?.session) {
            setSession(getUsableSession(data.session));
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
          setLoading(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(getUsableSession(data?.session));
      setLoading(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(getUsableSession(nextSession));
      setLoading(false);
      if (event === 'SIGNED_IN') { setMessage(''); setError(''); }
    });

    return () => { mounted = false; sub?.subscription?.unsubscribe(); };
  }, [supabase]);

  // ── handlers ───────────────────────────────────────────────────────────────
  async function handleEmailAuth(e) {
    e.preventDefault();
    const trimEmail = email.trim();
    if (!trimEmail || !password) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'login') {
        const { error: e } = await supabase.auth.signInWithPassword({ email: trimEmail, password });
        if (e) throw e;
      } else {
        const { error: e } = await supabase.auth.signUp({ email: trimEmail, password });
        if (e) throw e;
        setMessage('Conta criada! Verifique seu e-mail para confirmar.');
      }
    } catch (err) {
      setError(err.message || 'Erro ao autenticar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/studio`,
      },
    });
    if (e) setError(e.message);
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) return fallback;

  if (!session) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0f0f] p-8 shadow-2xl">

          {/* Logo */}
          <div className="mb-8 flex items-center gap-3">
            <img src="/logo.webp" alt="VBO.AI" className="h-10 w-10 rounded-lg object-cover" />
            <h1 className="text-2xl font-black tracking-tight">VBO.AI</h1>
          </div>

          {/* Tab toggle */}
          <div className="flex mb-6 rounded-lg overflow-hidden border border-white/10">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setMessage(''); }}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${mode === 'login' ? 'bg-[#FF4500] text-black' : 'bg-transparent text-white/50 hover:text-white'}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setMessage(''); }}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${mode === 'register' ? 'bg-[#FF4500] text-black' : 'bg-transparent text-white/50 hover:text-white'}`}
            >
              Cadastrar
            </button>
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full h-11 flex items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 text-sm font-semibold text-white hover:bg-white/10 transition mb-5"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
              <path d="M44.5 20H24v8.5h11.8C34.7 33.9 29.9 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.1-6.1C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.2-2.7-.5-4z" fill="#4285F4"/>
              <path d="M6.3 14.7l7 5.1C15.1 16 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.1-6.1C34.6 5.1 29.6 3 24 3 16.3 3 9.6 7.9 6.3 14.7z" fill="#EA4335"/>
              <path d="M24 45c5.8 0 10.7-1.9 14.3-5.2l-6.6-5.4C29.9 36 27.1 37 24 37c-5.8 0-10.7-3.9-12.4-9.3l-7 5.4C8.3 40.9 15.6 45 24 45z" fill="#34A853"/>
              <path d="M44.5 20H24v8.5h11.8c-.7 2.2-2.1 4.1-3.9 5.4l6.6 5.4C42.4 36.2 45 30.6 45 24c0-1.3-.2-2.7-.5-4z" fill="#FBBC05"/>
            </svg>
            Continuar com Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30 font-medium">ou</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Email + password form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-white/35">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                autoComplete="email"
                required
                className="h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-[#FF4500]/70 focus:ring-2 focus:ring-[#FF4500]/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.15em] text-white/35">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                className="h-11 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-[#FF4500]/70 focus:ring-2 focus:ring-[#FF4500]/20"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              className="h-11 w-full rounded-lg bg-[#FF4500] text-sm font-bold text-black transition hover:bg-[#e03c00] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (mode === 'login' ? 'Entrando...' : 'Cadastrando...') : (mode === 'login' ? 'Entrar' : 'Criar conta')}
            </button>
          </form>

          {message && (
            <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-200">
              {message}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>
      </main>
    );
  }

  return children;
}
