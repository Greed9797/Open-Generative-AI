"use client";

import { useEffect, useMemo, useState } from "react";

const ASPECT_RATIOS = {
  "16:9": { label: "16:9 · 1920×1080", width: 1920, height: 1080 },
  "9:16": { label: "9:16 · 1080×1920", width: 1080, height: 1920 },
  "1:1": { label: "1:1 · 1080×1080", width: 1080, height: 1080 },
};

const CLIP_COLORS = ["#FF4500", "#2563eb", "#16a34a", "#9333ea", "#d97706", "#0891b2"];

const PENDING_CLIPS_KEY = "video_editor_pending_clips";
const SUPABASE_SESSION_KEY = "creativeos_supabase_session";

function supabaseAuthHeader() {
  try {
    const session = JSON.parse(localStorage.getItem(SUPABASE_SESSION_KEY) || "null");
    return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
  } catch {
    return {};
  }
}

function makeClipId() {
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</span>
      {children}
    </div>
  );
}

function UsageLine({ usage }) {
  if (!usage) return null;
  const parts = [
    usage.prompt_tokens ? `${usage.prompt_tokens}p` : null,
    usage.completion_tokens ? `${usage.completion_tokens}c` : null,
    usage.total_tokens ? `${usage.total_tokens} tok` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <span className="text-[10px] text-white/20 mt-1">{parts.join(" · ")}</span>;
}

const inputCls = "w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all";
const selectCls = "w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-primary/40 transition-all appearance-none";

export default function VideoEditorStudio({ apiKey, minimaxApiKey }) {
  void apiKey;
  const [clips, setClips] = useState([]);
  const [clipUrl, setClipUrl] = useState("");
  const [clipDuration, setClipDuration] = useState(5);
  const [clipLabel, setClipLabel] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [fps, setFps] = useState(30);
  const [quality, setQuality] = useState("high");
  const [prompt, setPrompt] = useState("");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [htmlComposition, setHtmlComposition] = useState("");
  const [showHtml, setShowHtml] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState("");
  const [error, setError] = useState("");

  const settings = useMemo(() => ({ ...ASPECT_RATIOS[aspectRatio], fps }), [aspectRatio, fps]);
  const previewRatio = `${settings.width} / ${settings.height}`;

  useEffect(() => {
    const pendingClips = JSON.parse(localStorage.getItem(PENDING_CLIPS_KEY) || "[]");
    if (pendingClips.length) {
      setClips((prev) => [...prev, ...pendingClips.map((clip) => ({ ...clip, id: clip.id || makeClipId() }))]);
      localStorage.removeItem(PENDING_CLIPS_KEY);
    }
    const handler = (event) => {
      const detail = event.detail || {};
      if (!detail.url) return;
      setClips((prev) => [...prev, { id: makeClipId(), url: detail.url, duration: Number(detail.duration) || 5, label: detail.label || "Clipe gerado" }]);
    };
    window.addEventListener("add-to-editor", handler);
    return () => window.removeEventListener("add-to-editor", handler);
  }, []);

  const addClip = () => {
    const trimmedUrl = clipUrl.trim();
    if (!trimmedUrl) return;
    setClips((prev) => [...prev, { id: makeClipId(), url: trimmedUrl, duration: Number(clipDuration) || 5, label: clipLabel.trim() || `Clipe ${prev.length + 1}` }]);
    setClipUrl(""); setClipDuration(5); setClipLabel("");
  };

  const submitPrompt = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;
    if (!minimaxApiKey) { setError("Adicione sua chave de API MiniMax nas Configurações antes de gerar."); return; }
    setGenerating(true); setError(""); setRenderedVideoUrl("");
    const userMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    try {
      const response = await fetch("/api/video-editor/generate-composition", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-minimax-api-key": minimaxApiKey, ...supabaseAuthHeader() },
        body: JSON.stringify({ prompt: trimmed, clips, settings, conversationHistory }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed");
      const assistantMessage = data.assistantMessage || { role: "assistant", content: data.html };
      setHtmlComposition(data.html);
      setConversationHistory((prev) => [...prev, userMessage, assistantMessage]);
      setMessages((prev) => [...prev, { role: "assistant", content: "Composição atualizada.", usage: data.usage }]);
      setPrompt("");
    } catch (err) {
      setError(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const renderComposition = async () => {
    if (!htmlComposition || rendering) return;
    setRendering(true); setError(""); setRenderedVideoUrl("");
    try {
      const response = await fetch("/api/video-editor/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: htmlComposition, options: { fps, quality } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Render failed");
      setRenderedVideoUrl(data.videoUrl);
    } catch (err) {
      setError(err.message || "Render failed");
    } finally {
      setRendering(false);
    }
  };

  const resetConversation = () => { setConversationHistory([]); setMessages([]); setHtmlComposition(""); setRenderedVideoUrl(""); setError(""); };

  return (
    <div className="h-full bg-[#050505] text-white overflow-hidden flex flex-col" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── TOP BAR ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 h-12 border-b border-white/[0.05] bg-black/60 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF4500" strokeWidth="2.5">
            <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">Editor de Vídeo</span>
        </div>
        {clips.length > 0 && (
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[10px] font-bold text-primary/70 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">{clips.length} clipe{clips.length !== 1 ? "s" : ""}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {htmlComposition && (
            <span className="text-[10px] font-bold text-green-400/70 bg-green-400/10 border border-green-400/20 rounded-full px-2 py-0.5">Composição pronta</span>
          )}
          <button type="button" onClick={resetConversation} className="text-[10px] font-bold text-white/40 hover:text-white/70 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-md px-3 py-1.5 transition-all">
            Reiniciar
          </button>
        </div>
      </div>

      {/* ── MAIN 3-COL ── */}
      <div className="flex-1 grid min-h-0" style={{ gridTemplateColumns: "260px minmax(0,1fr) 340px" }}>

        {/* ── LEFT: CLIPS ── */}
        <aside className="border-r border-white/[0.05] flex flex-col overflow-hidden bg-black/30">
          <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.05]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Biblioteca de Clipes</span>
              <span className="text-[10px] text-white/20">{clips.length} / ∞</span>
            </div>
          </div>

          {/* Add clip form */}
          <div className="flex-shrink-0 p-4 border-b border-white/[0.05] space-y-3">
            <Field label="URL do Vídeo">
              <input className={inputCls} value={clipUrl} onChange={(e) => setClipUrl(e.target.value)} placeholder="https://..." onKeyDown={(e) => e.key === "Enter" && addClip()} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Duração (s)">
                <input className={inputCls} type="number" min="0.1" step="0.1" value={clipDuration} onChange={(e) => setClipDuration(e.target.value)} />
              </Field>
              <Field label="Nome">
                <input className={inputCls} value={clipLabel} onChange={(e) => setClipLabel(e.target.value)} placeholder="Nome do plano" />
              </Field>
            </div>
            <button
              type="button"
              onClick={addClip}
              className="w-full bg-primary text-black text-[11px] font-black uppercase tracking-widest rounded-lg py-2.5 hover:bg-primary/90 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(255,69,0,0.15)]"
            >
              + Adicionar Clipe
            </button>
          </div>

          {/* Clip list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            {clips.map((clip, idx) => (
              <div
                key={clip.id}
                className="group relative bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all"
              >
                <div
                  className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
                  style={{ background: CLIP_COLORS[idx % CLIP_COLORS.length] }}
                />
                <div className="pl-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-black text-white/25 tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="text-xs font-semibold text-white/80 truncate">{clip.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/35 font-mono">{clip.duration}s</span>
                      <span className="text-[10px] text-white/20 truncate max-w-[100px]">{clip.url.replace(/^https?:\/\//, "").slice(0, 20)}…</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setClips((prev) => prev.filter((c) => c.id !== clip.id))}
                    className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 bg-white/[0.05] hover:bg-red-400/10 rounded-md w-6 h-6 flex items-center justify-center text-sm transition-all flex-shrink-0"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            {!clips.length && (
              <div className="text-center py-8">
                <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
                    <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M12 6V4m0 16v-2M6 6V4m12 2V4M6 20v-2m12 2v-2" />
                  </svg>
                </div>
                <p className="text-[11px] text-white/25">Sem clipes. Adicione uma URL acima.</p>
              </div>
            )}
          </div>

          {/* Export settings */}
          <div className="flex-shrink-0 border-t border-white/[0.05] p-4 space-y-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/25">Configurações de Exportação</span>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Proporção">
                <select className={selectCls} value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                  {Object.entries(ASPECT_RATIOS).map(([v, o]) => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="FPS">
                <select className={selectCls} value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                  {[24, 30, 60].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Qualidade">
                <select className={selectCls} value={quality} onChange={(e) => setQuality(e.target.value)}>
                  {["fast", "high", "best"].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </aside>

        {/* ── CENTER: COMPOSE ── */}
        <main className="flex flex-col min-h-0 relative overflow-hidden">

          {/* Clip sequence strip */}
          {clips.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 border-b border-white/[0.05] bg-black/20 overflow-x-auto custom-scrollbar">
              {clips.map((clip, idx) => (
                <div key={clip.id} className="flex items-center gap-1 flex-shrink-0">
                  <div
                    className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1 text-[10px] font-bold text-white/50"
                    style={{ borderLeftColor: CLIP_COLORS[idx % CLIP_COLORS.length], borderLeftWidth: 2 }}
                  >
                    <span>{idx + 1}</span>
                    <span className="max-w-[60px] truncate text-white/30">{clip.label}</span>
                    <span className="text-white/20 font-mono">{clip.duration}s</span>
                  </div>
                  {idx < clips.length - 1 && <span className="text-white/15">›</span>}
                </div>
              ))}
            </div>
          )}

          {/* Messages / canvas */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-3">
            {messages.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[72%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary/10 border border-primary/20 rounded-tr-sm"
                      : "bg-white/[0.04] border border-white/[0.07] rounded-tl-sm"
                  }`}
                >
                  <div className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${msg.role === "user" ? "text-primary/60" : "text-white/25"}`}>
                    {msg.role === "user" ? "Você" : "MiniMax M2.7"}
                  </div>
                  <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  {msg.usage && <UsageLine usage={msg.usage} />}
                </div>
              </div>
            ))}
            {!messages.length && (
              <div className="m-auto text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-white/15">
                    <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                </div>
                <p className="text-sm text-white/20 font-medium">Adicione clipes e descreva sua composição</p>
                <p className="text-[11px] text-white/12 mt-1">MiniMax M2.7 gera HTML Hyperframes</p>
              </div>
            )}
          </div>

          {/* HTML drawer */}
          {showHtml && (
            <pre className="flex-shrink-0 max-h-48 overflow-auto border-t border-white/[0.05] bg-black/60 backdrop-blur-sm p-4 text-[10px] font-mono text-white/40 leading-5 custom-scrollbar">
              {htmlComposition || "Nenhum HTML gerado ainda."}
            </pre>
          )}

          {/* Command bar */}
          <div className="flex-shrink-0 p-4 border-t border-white/[0.05] bg-black/40 backdrop-blur-md space-y-3">
            {error && (
              <div className="flex items-start gap-2 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3">
                <span className="text-red-400/80 text-xs leading-relaxed">{error}</span>
              </div>
            )}
            <textarea
              className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-primary/30 focus:bg-white/[0.06] transition-all resize-none leading-relaxed"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitPrompt(); }}
              placeholder="Sequencie todos os clipes com crossfades, adicione um título em negrito nos primeiros 2s, finalize com um CTA…   ⌘↵ para enviar"
            />
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setShowHtml((v) => !v)} className="text-[11px] font-bold text-white/35 hover:text-white/60 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-lg px-3 py-2 transition-all">
                {showHtml ? "Ocultar HTML" : "Exibir HTML"}
              </button>
              <button
                type="button"
                onClick={submitPrompt}
                disabled={generating}
                className="flex items-center gap-2 bg-primary text-black text-[11px] font-black uppercase tracking-widest rounded-lg px-5 py-2.5 hover:bg-primary/90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(255,69,0,0.15)]"
              >
                {generating ? (
                  <>
                    <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Gerando…
                  </>
                ) : "Gerar Composição"}
              </button>
            </div>
          </div>
        </main>

        {/* ── RIGHT: PREVIEW & RENDER ── */}
        <aside className="border-l border-white/[0.05] flex flex-col overflow-hidden bg-black/30">
          <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.05]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Prévia</span>
              <span className="text-[10px] font-mono text-white/20">{settings.width}×{settings.height} · {fps}fps</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-auto custom-scrollbar p-4 gap-4">
            {/* Preview frame */}
            <div
              className="w-full rounded-xl overflow-hidden bg-black border border-white/[0.07] relative"
              style={{ aspectRatio: previewRatio }}
            >
              {htmlComposition ? (
                <iframe
                  title="Composition preview"
                  srcDoc={htmlComposition}
                  sandbox="allow-scripts"
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-white/10">
                    <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                  <span className="text-[10px] text-white/15">Sem composição ainda</span>
                </div>
              )}
              {/* AR badge */}
              <div className="absolute top-2 left-2 text-[9px] font-bold text-white/30 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 pointer-events-none">
                {aspectRatio}
              </div>
            </div>

            {/* Render button */}
            <button
              type="button"
              onClick={renderComposition}
              disabled={!htmlComposition || rendering}
              className="w-full py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
              style={{
                background: !htmlComposition || rendering ? "rgba(255,255,255,0.05)" : "#FF4500",
                color: !htmlComposition || rendering ? "rgba(255,255,255,0.25)" : "#000",
                cursor: !htmlComposition || rendering ? "not-allowed" : "pointer",
                boxShadow: !htmlComposition || rendering ? "none" : "0 0 30px rgba(255,69,0,0.2)",
              }}
            >
              {rendering ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                  Renderizando…
                </span>
              ) : "Renderizar MP4"}
            </button>

            {/* Output video */}
            {renderedVideoUrl && (
              <div className="space-y-3">
                <video src={renderedVideoUrl} controls className="w-full rounded-xl bg-black border border-white/[0.07]" />
                <a
                  href={renderedVideoUrl}
                  download
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[11px] font-bold text-white/60 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] transition-all no-underline"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Baixar MP4
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
