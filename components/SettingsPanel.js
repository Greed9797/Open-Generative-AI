'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ALL_ROLES, KNOWN_PROVIDERS, ROLE_LABELS } from '../lib/api-key-providers.js';
import { createClient } from '../lib/supabase/client.js';

const SESSION_KEY = 'creativeos_supabase_session';

const ROLE_COLORS = {
  code_agent: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  analysis_agent: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  orchestrator: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20',
  image_gen: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  video_gen: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
};


function authHeaders(session) {
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

function RoleBadge({ role }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ROLE_COLORS[role] || 'border-white/10 bg-white/5 text-white/50'}`}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

export default function SettingsPanel() {
  const [tab, setTab] = useState('profile');
  const [session, setSession] = useState(null);
  const [keys, setKeys] = useState([]);
  const [providerInputs, setProviderInputs] = useState({});
  const [profile, setProfile] = useState({ displayName: '', avatarUrl: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customModelId, setCustomModelId] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [customRoles, setCustomRoles] = useState([]);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const customKeys = useMemo(() => keys.filter((key) => key.isCustom), [keys]);

  const loadKeys = useCallback(async (nextSession = session) => {
    const token = nextSession?.accessToken;
    if (!token) return;
    const response = await fetch('/api/settings/api-keys', { headers: authHeaders(nextSession), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load keys');
    setKeys(data.keys || []);
  }, []); // Removido session das dependências para evitar mudança de identidade constante

  const loadProfile = useCallback(async (nextSession = session) => {
    const token = nextSession?.accessToken;
    if (!token) return;
    const response = await fetch('/api/settings/profile', { headers: authHeaders(nextSession), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load profile');
    setProfile(data.profile || { displayName: '', avatarUrl: '' });
  }, []); // Removido session das dependências

  // Efeito 1: Inicialização da Sessão
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      const s = data?.session;
      if (s?.access_token) {
        const sessionObj = { accessToken: s.access_token };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
        setSession(sessionObj);
      } else {
        // No valid auth session — clear any stale token
        localStorage.removeItem(SESSION_KEY);
      }
    });

    // 3. Ouvir mudanças de auth (logout/login/refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.access_token) {
        const sessionObj = { accessToken: s.access_token };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
        setSession(sessionObj);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Efeito 2: Carregamento de dados quando a sessão mudar
  useEffect(() => {
    if (session?.accessToken) {
      loadKeys(session).catch((err) => setError(err.message));
      loadProfile(session).catch((err) => setError(err.message));
    }
  }, [session?.accessToken, loadKeys, loadProfile]);

  async function refresh() {
    await Promise.all([loadKeys(), loadProfile()]);
  }

  async function saveProvider(provider) {
    const rawKey = providerInputs[provider.name]?.trim();
    if (!rawKey) return;
    setSaving(provider.name);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
        body: JSON.stringify({
          providerName: provider.name,
          rawKey,
          modelIdentifier: provider.modelIdentifier || null,
          roles: provider.defaultRoles,
          isCustom: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save key');
      setProviderInputs((current) => ({ ...current, [provider.name]: '' }));
      setMessage(`${provider.name} configurado.`);
      await loadKeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  async function saveCustom() {
    if (!customName.trim() || !customKey.trim() || customRoles.length === 0) return;
    setSaving('custom');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
        body: JSON.stringify({
          providerName: customName.trim(),
          rawKey: customKey.trim(),
          roles: customRoles,
          modelIdentifier: customModelId.trim() || null,
          isCustom: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save custom model');
      setCustomName('');
      setCustomModelId('');
      setCustomKey('');
      setCustomRoles([]);
      setCustomOpen(false);
      setMessage('Modelo customizado configurado.');
      await loadKeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  async function patchKey(id, patch) {
    const response = await fetch(`/api/settings/api-keys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
      body: JSON.stringify(patch),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update key');
    await loadKeys();
  }

  async function deleteKey(id) {
    if (!window.confirm('Tem certeza? Esta ação não pode ser desfeita')) return;
    const response = await fetch(`/api/settings/api-keys/${id}`, {
      method: 'DELETE',
      headers: authHeaders(session),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to delete key');
      return;
    }
    await loadKeys();
  }

  async function saveProfile() {
    setSaving('profile');
    setError('');
    setMessage('');
    try {
      let avatarUrl = profile.avatarUrl || '';
      if (avatarFile) {
        const form = new FormData();
        form.append('file', avatarFile);
        const upload = await fetch('/api/settings/profile/avatar', {
          method: 'POST',
          headers: authHeaders(session),
          body: form,
        });
        const uploadData = await upload.json();
        if (!upload.ok) throw new Error(uploadData.error || 'Avatar upload failed');
        avatarUrl = uploadData.avatarUrl;
      }

      const response = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
        body: JSON.stringify({ displayName: profile.displayName, avatarUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save profile');
      setProfile(data.profile);
      setAvatarFile(null);
      setMessage('Perfil salvo.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  if (!session?.accessToken) {
    return (
      <div className="h-full overflow-y-auto bg-[#0f0f0f] p-8 text-white">
        <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Entre com magic link para salvar perfil e chaves de API criptografadas no Supabase. O Settings usa apenas a sessão real do Supabase Auth.
          </p>
          {error && <div className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0f0f0f] p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Configurações</h1>
            <p className="mt-1 text-sm text-white/45">Perfil e chaves de API criptografadas no Supabase.</p>
          </div>
          <button onClick={refresh} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5">
            Atualizar
          </button>
        </div>

        <div className="flex gap-2 border-b border-white/10">
          {[
            ['profile', 'Perfil'],
            ['keys', 'Chaves de API'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === id ? 'border-[#FF4500] text-[#FF4500]' : 'border-transparent text-white/45'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        {tab === 'profile' ? (
          <section className="max-w-2xl rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/30">
                {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-white/25">Foto</span>}
              </div>
              <label className="cursor-pointer rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5">
                Carregar foto
                <input type="file" accept="image/*" className="hidden" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />
              </label>
              {avatarFile && <span className="text-xs text-white/40">{avatarFile.name}</span>}
            </div>
            <label className="block text-xs font-bold text-white/35">Nome de exibição</label>
            <input
              value={profile.displayName || ''}
              onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-[#FF4500]/50"
              placeholder="Seu nome"
            />
            <button onClick={saveProfile} disabled={saving === 'profile'} className="mt-5 rounded-lg bg-[#FF4500] px-5 py-2.5 text-sm font-bold text-black disabled:opacity-50">
              {saving === 'profile' ? 'Salvando...' : 'Salvar perfil'}
            </button>
          </section>
        ) : (
          <section className="space-y-8">
            <div>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-white/35">Provedores Conhecidos</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {KNOWN_PROVIDERS.map((provider) => {
                  const saved = keys.find((key) => !key.isCustom && key.providerName === provider.name);
                  return (
                    <article key={provider.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold">{provider.name}</h3>
                          <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="text-xs text-[#FF4500]/80 hover:text-[#FF4500]">Docs</a>
                        </div>
                        {saved && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">Configurado</span>}
                      </div>
                      <div className="mb-4 flex flex-wrap gap-1.5">{provider.defaultRoles.map((role) => <RoleBadge key={role} role={role} />)}</div>
                      {saved ? (
                        <div className="space-y-3">
                          <p className="text-xs text-white/40">Configurado em {new Date(saved.createdAt).toLocaleDateString('pt-BR')}</p>
                          <button onClick={() => deleteKey(saved.id)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
                            Remover
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <input
                            type="password"
                            title="Sua chave é criptografada antes de ser armazenada"
                            value={providerInputs[provider.name] || ''}
                            onChange={(event) => setProviderInputs((current) => ({ ...current, [provider.name]: event.target.value }))}
                            placeholder={provider.keyPlaceholder}
                            className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[#FF4500]/50"
                          />
                          <p className="text-[11px] text-white/30">Sua chave é criptografada antes de ser armazenada</p>
                          {provider.helpText && <p className="text-[11px] text-amber-400/60">{provider.helpText}</p>}
                          <button onClick={() => saveProvider(provider)} disabled={saving === provider.name || !providerInputs[provider.name]?.trim()} className="rounded-lg bg-[#FF4500] px-6 py-3 text-sm font-bold text-black disabled:opacity-50">
                            {saving === provider.name ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-white/10 pt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-white/35">Modelos Personalizados</h2>
                <button onClick={() => setCustomOpen(true)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5">+ Adicionar Personalizado</button>
              </div>

              {customOpen && (
                <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Nome de exibição (ex: Meu Modelo)" className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-[#FF4500]/50" />
                    <input value={customModelId} onChange={(event) => setCustomModelId(event.target.value)} placeholder="ID do modelo (ex: nano-banana, kling-v2-5-pro-t2v)" className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-[#FF4500]/50" />
                    <input type="password" title="Sua chave é criptografada antes de ser armazenada" value={customKey} onChange={(event) => setCustomKey(event.target.value)} placeholder={customName.toLowerCase().includes('gemini') || customName.toLowerCase().includes('veo') ? 'AIza...' : 'sk-...'} className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-[#FF4500]/50" />
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {ALL_ROLES.map((role) => (
                      <label key={role} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65">
                        <input
                          type="checkbox"
                          checked={customRoles.includes(role)}
                          onChange={(event) => setCustomRoles((current) => event.target.checked ? [...current, role] : current.filter((item) => item !== role))}
                        />
                        {ROLE_LABELS[role]}
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button onClick={saveCustom} disabled={saving === 'custom' || !customName.trim() || !customKey.trim() || customRoles.length === 0} className="rounded-lg bg-[#FF4500] px-4 py-2 text-xs font-bold text-black disabled:opacity-50">Salvar</button>
                    <button onClick={() => setCustomOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-white/70">Cancelar</button>
                  </div>
                </div>
              )}

              <div className="grid gap-3">
                {customKeys.map((key) => (
                  <article key={key.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="font-semibold">{key.providerName}</h3>
                      {key.modelIdentifier && <p className="mt-0.5 text-xs text-white/50">ID: {key.modelIdentifier}</p>}
                      <p className="mt-1 text-xs text-white/40">Configurado em {new Date(key.createdAt).toLocaleDateString('pt-BR')}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">{key.roles.map((role) => <RoleBadge key={role} role={role} />)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-white/60">
                        <input type="checkbox" checked={key.isActive} onChange={(event) => patchKey(key.id, { isActive: event.target.checked }).catch((err) => setError(err.message))} />
                        Ativo
                      </label>
                      <button onClick={() => deleteKey(key.id)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">Remover</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
