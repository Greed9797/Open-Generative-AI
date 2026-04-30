"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JobsCRM from "./JobsCRM";

const STATUS_COLORS = {
  pending: "#555",
  running: "#2563eb",
  done: "#16a34a",
  failed: "#dc2626",
  passed: "#16a34a",
  best_effort: "#d97706",
};

const STATUS_BG = {
  pending: "rgba(85,85,85,0.15)",
  running: "rgba(37,99,235,0.15)",
  done: "rgba(22,163,74,0.15)",
  failed: "rgba(220,38,38,0.15)",
  passed: "rgba(22,163,74,0.15)",
  best_effort: "rgba(217,119,6,0.15)",
};

const TARGET_MODELS = [
  { label: "Seedance 2.0", value: "seedance" },
  { label: "Veo3", value: "veo3" },
  { label: "Kling v3", value: "kling" },
  { label: "Wan 2.6", value: "wan" },
  { label: "Runway Gen-4", value: "runway" },
];

const MODEL_QUALITY_LABELS = {
  seedance: "Alta fidelidade · 24fps",
  veo3: "Cinema 8K · Fotorrealismo",
  kling: "Pro · Alta consistência",
  runway: "Cinematic · Gen4 Turbo",
};

const STYLES = ["Cinematic", "Commercial", "Documentary", "Abstract", "Social Media Short"];
const SUPABASE_SESSION_KEY = "creativeos_supabase_session";

function supabaseAuthHeader() {
  try {
    const session = JSON.parse(localStorage.getItem(SUPABASE_SESSION_KEY) || "null");
    return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
  } catch {
    return {};
  }
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function elapsed(createdAt, status) {
  if (!createdAt) return "0s";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

function StatusPill({ status }) {
  const color = STATUS_COLORS[status] || "#555";
  const bg = STATUS_BG[status] || "rgba(85,85,85,0.15)";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
      style={{ color, background: bg, border: `1px solid ${color}30` }}
    >
      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
      {status || "pending"}
    </span>
  );
}

function logColor(agent) {
  if (agent === "Orchestrator") return "#7F77DD";
  if (agent === "PromptEngineer") return "#378ADD";
  if (agent === "QualityChecker") return "#EF9F27";
  if (agent === "VideoGen") return "#5DCAA5";
  if (agent === "Sistema") return "#888780";
  return "rgba(255,255,255,0.45)";
}

function scoreSummary(job) {
  if (!job?.segments) return "";
  const scores = job.segments.map((s) => s.attempts?.at(-1)?.score).filter((s) => s != null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const parts = job.segments.map((s) => `${s.label}: ${s.attempts?.at(-1)?.score ?? "-"}/10`);
  return `${parts.join("  ·  ")}  |  Avg: ${avg.toFixed(1)}/10`;
}

function BreakdownBars({ breakdown }) {
  if (!breakdown) return null;
  const items = [
    ["Prompt", breakdown.promptAdherence],
    ["Movimento", breakdown.motionQuality],
    ["Sujeito", breakdown.subjectConsistency],
    ["Artefatos", breakdown.visualArtifacts],
    ["Cinema", breakdown.cinematicQuality],
  ];
  return (
    <div className="space-y-1.5 mt-3">
      {items.map(([label, value]) => (
        <div key={label} className="grid items-center gap-2 text-[10px]" style={{ gridTemplateColumns: "52px 1fr 22px" }}>
          <span className="text-white/30">{label}</span>
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(10, Number(value) || 0)) * 10}%` }} />
          </div>
          <span className="text-right text-white/40 font-mono">{Number(value || 0).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

const inputCls = "w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all";
const labelCls = "text-[10px] font-black uppercase tracking-widest text-white/30 mb-1.5 block";

export default function AgentStudio({ apiKey, minimaxApiKey, geminiApiKey, initialBaseImageUrl }) {
  const [baseImageUrl, setBaseImageUrl] = useState(initialBaseImageUrl || "");
  const [roughPrompt, setRoughPrompt] = useState("");
  const [targetModel, setTargetModel] = useState("seedance");
  const [style, setStyle] = useState("Cinematic");
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [queueing, setQueueing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("new");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [connectionMessage, setConnectionMessage] = useState("Conexão inativa");
  const logRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const selectedJobModelLabel = useMemo(() => {
    const value = selectedJob?.targetModel || targetModel;
    return TARGET_MODELS.find((m) => m.value === value)?.label || value;
  }, [selectedJob?.targetModel, targetModel]);
  const allSegmentsDone = selectedJob?.segments?.every((s) => ["passed", "best_effort"].includes(s.status));

  useEffect(() => {
    const onSetAgentBaseImage = (event) => {
      const url = event.detail?.url || event.detail?.imageUrl;
      if (url) {
        setBaseImageUrl(url);
        setTab("new");
      }
    };
    window.addEventListener("set-agent-base-image", onSetAgentBaseImage);
    return () => window.removeEventListener("set-agent-base-image", onSetAgentBaseImage);
  }, []);

  const refreshJobs = async () => {
    const response = await fetch("/api/agent-studio/list-jobs", { headers: supabaseAuthHeader() });
    const data = await response.json();
    if (response.ok) setJobs(data.jobs || []);
  };

  useEffect(() => {
    refreshJobs().catch(() => {});
    const timer = setInterval(() => refreshJobs().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setConnectionStatus("disconnected");
      setConnectionMessage("Conexão inativa");
      return undefined;
    }
    let events, reconnectTimer, closed = false;
    reconnectAttemptsRef.current = 0;
    const connect = () => {
      if (closed) return;
      events = new EventSource(`/api/agent-studio/stream/${selectedJobId}`);
      events.onopen = () => { reconnectAttemptsRef.current = 0; setConnectionStatus("connected"); setConnectionMessage("Ao vivo"); };
      events.onmessage = (event) => {
        const job = JSON.parse(event.data);
        setConnectionStatus("connected"); setConnectionMessage("Ao vivo");
        setSelectedJob(job);
        setJobs((prev) => {
          const summary = { id: job.id, status: job.status, targetModel: job.targetModel, style: job.style, createdAt: job.createdAt, updatedAt: job.updatedAt, finalVideoUrl: job.finalVideoUrl };
          const exists = prev.some((j) => j.id === job.id);
          return exists ? prev.map((j) => (j.id === job.id ? summary : j)) : [summary, ...prev];
        });
        if (job.status === "done" || job.status === "failed") events.close();
      };
      events.onerror = () => {
        events.close();
        reconnectAttemptsRef.current += 1;
        if (reconnectAttemptsRef.current > 5) { setConnectionStatus("disconnected"); setConnectionMessage("Conexão perdida"); return; }
        setConnectionStatus("disconnected"); setConnectionMessage("Reconectando…");
        reconnectTimer = setTimeout(() => { setConnectionStatus("reconnecting"); connect(); }, 3000);
      };
    };
    setConnectionStatus("reconnecting"); setConnectionMessage("Conectando…");
    connect();
    return () => { closed = true; if (reconnectTimer) clearTimeout(reconnectTimer); if (events) events.close(); };
  }, [selectedJobId]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [selectedJob?.log?.length]);

  const uploadBaseImage = async (file) => {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/agent-studio/upload-base-image", { method: "POST", headers: { "x-api-key": apiKey || "", ...supabaseAuthHeader() }, body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha no upload");
      setBaseImageUrl(data.url);
    } catch (err) { setError(err.message || "Falha no upload"); }
    finally { setUploading(false); }
  };

  const queueJob = async (event) => {
    event.preventDefault();
    if (!baseImageUrl.trim()) { setError("A URL da imagem base é obrigatória"); return; }
    setQueueing(true); setError("");
    try {
      const response = await fetch("/api/agent-studio/start-job", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey || "", "x-video-api-key": apiKey || "", "x-minimax-api-key": minimaxApiKey || "", "x-gemini-api-key": geminiApiKey || "", ...supabaseAuthHeader() },
        body: JSON.stringify({ baseImageUrl: baseImageUrl.trim(), roughPrompt, targetModel, style }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao enfileirar job");
      setSelectedJobId(data.jobId); setRoughPrompt("");
      await refreshJobs();
    } catch (err) { setError(err.message || "Falha ao enfileirar job"); }
    finally { setQueueing(false); }
  };

  const exportLog = () => {
    if (!selectedJob) return;
    const lines = (selectedJob.log || []).map((e) => `[${e.timestamp}] [${e.agent}] ${e.message}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `agent-log-${selectedJob.id}.txt`;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full grid bg-[#050505] text-white overflow-hidden" style={{ gridTemplateColumns: "320px minmax(0,1fr)", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="border-r border-white/[0.05] flex flex-col overflow-hidden bg-black/40">

        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF4500" strokeWidth="2">
                <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-tight">Estúdio de Agentes</h1>
              <p className="text-[10px] text-white/30 mt-0.5">Pipeline autônomo de 3 agentes</p>
            </div>
          </div>
          <div className="flex gap-1 mt-3">
            <button
              type="button"
              onClick={() => setTab("new")}
              className="flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-md transition-all"
              style={{
                background: tab === "new" ? "rgba(255,69,0,0.12)" : "rgba(255,255,255,0.03)",
                color: tab === "new" ? "#FF4500" : "rgba(255,255,255,0.4)",
                border: `1px solid ${tab === "new" ? "rgba(255,69,0,0.3)" : "rgba(255,255,255,0.05)"}`,
              }}
            >
              Novo Job
            </button>
            <button
              type="button"
              onClick={() => setTab("jobs")}
              className="flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-md transition-all"
              style={{
                background: tab === "jobs" ? "rgba(255,69,0,0.12)" : "rgba(255,255,255,0.03)",
                color: tab === "jobs" ? "#FF4500" : "rgba(255,255,255,0.4)",
                border: `1px solid ${tab === "jobs" ? "rgba(255,69,0,0.3)" : "rgba(255,255,255,0.05)"}`,
              }}
            >
              Jobs
            </button>
          </div>
        </div>

        {/* Config form */}
        <form onSubmit={queueJob} className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-4">

          {/* Upload zone */}
          <div>
            <span className={labelCls}>Imagem Base</span>
            <label className="group relative flex flex-col items-center justify-center w-full h-24 bg-white/[0.02] border border-dashed border-white/[0.1] rounded-xl cursor-pointer hover:bg-white/[0.04] hover:border-white/[0.18] transition-all overflow-hidden">
              {baseImageUrl ? (
                <img src={baseImageUrl} alt="preview" className="absolute inset-0 w-full h-full object-cover opacity-60" />
              ) : (
                <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                  <span className="text-[10px] text-white/25">{uploading ? "Enviando…" : "Solte a imagem ou clique"}</span>
                </div>
              )}
              <input type="file" accept="image/*" onChange={(e) => uploadBaseImage(e.target.files?.[0])} className="sr-only" />
            </label>
          </div>

          <div>
            <span className={labelCls}>URL da Imagem</span>
            <input value={baseImageUrl} onChange={(e) => setBaseImageUrl(e.target.value)} placeholder={uploading ? "Enviando…" : "https://…"} className={inputCls} />
          </div>

          <div>
            <span className={labelCls}>Prompt Inicial</span>
            <textarea value={roughPrompt} onChange={(e) => setRoughPrompt(e.target.value)} placeholder="Deixe vazio — o Agente C decide" className={`${inputCls} min-h-[72px] resize-y`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={labelCls}>Modelo</span>
              <select value={targetModel} onChange={(e) => setTargetModel(e.target.value)} className={inputCls}>
                {TARGET_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {MODEL_QUALITY_LABELS[targetModel] && (
                <p className="mt-1.5 text-[10px] font-semibold text-primary/70">{MODEL_QUALITY_LABELS[targetModel]}</p>
              )}
            </div>
            <div>
              <span className={labelCls}>Estilo</span>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className={inputCls}>
                {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3 py-2.5">
              <span className="text-red-400/80 text-xs leading-relaxed">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={queueing || uploading}
            className="w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: "#FF4500", color: "#000", boxShadow: "0 0 24px rgba(255,69,0,0.2)" }}
          >
            {queueing ? (
              <><span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Enfileirando…</>
            ) : "Enfileirar Job"}
          </button>
        </form>

        {/* Job queue */}
        <div className="flex-shrink-0 border-t border-white/[0.05] px-5 py-4 space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Fila de Jobs</span>
            <button onClick={refreshJobs} className="text-[10px] font-bold text-primary/60 hover:text-primary transition-colors">Atualizar</button>
          </div>
          <div className="space-y-2">
            {jobs.map((job) => {
              const isSelected = selectedJobId === job.id;
              return (
                <button
                  type="button"
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className="w-full text-left rounded-xl p-3 border transition-all"
                  style={{
                    background: isSelected ? "rgba(255,69,0,0.06)" : "rgba(255,255,255,0.02)",
                    borderColor: isSelected ? "rgba(255,69,0,0.3)" : "rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <StatusPill status={job.status} />
                    <span className="text-[9px] font-mono text-white/25">{formatTime(job.createdAt)}</span>
                  </div>
                  <div className="text-[10px] font-bold text-white/50 truncate font-mono">{job.id}</div>
                  <div className="text-[9px] text-white/25 mt-0.5">{job.targetModel} · {job.style}</div>
                </button>
              );
            })}
            {!jobs.length && (
              <div className="text-center py-4">
                <p className="text-[11px] text-white/20">Nenhum job ainda</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <main className="min-w-0 overflow-y-auto custom-scrollbar bg-[#050505]">
        {tab === "jobs" ? (
          <JobsCRM
            jobs={jobs}
            onSelectJob={(jobId) => { setSelectedJobId(jobId); setTab("new"); }}
            onRepeatJob={async (job) => {
              try {
                await fetch("/api/agent-studio/start-job", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...supabaseAuthHeader() },
                  body: JSON.stringify({ baseImageUrl: job.baseImageUrl || "", roughPrompt: job.roughPrompt || "", targetModel: job.targetModel, style: job.style }),
                });
                await refreshJobs();
              } catch { /* ignore */ }
            }}
          />
        ) : !selectedJob ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
            <div className="w-20 h-20 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-white/15">
                <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-white/25 font-medium">Nenhum job selecionado</p>
              <p className="text-[11px] text-white/15 mt-1">Enfileire um job ou selecione um na barra lateral</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-w-5xl mx-auto">

            {/* Job header */}
            <div className="flex items-start justify-between gap-4 pb-5 border-b border-white/[0.05]">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1.5">
                  <StatusPill status={selectedJob.status} />
                  <span className="text-[10px] font-mono text-white/30 truncate">{selectedJob.id}</span>
                </div>
                <p className="text-[11px] text-white/30">{selectedJobModelLabel} · {selectedJob.style} · {elapsed(selectedJob.createdAt, selectedJob.status)} elapsed</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Connection indicator */}
                <div
                  className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full border"
                  style={{
                    background: connectionStatus === "connected" ? "rgba(22,163,74,0.1)" : "rgba(85,85,85,0.1)",
                    borderColor: connectionStatus === "connected" ? "rgba(22,163,74,0.2)" : "rgba(85,85,85,0.2)",
                    color: connectionStatus === "connected" ? "#4ade80" : "rgba(255,255,255,0.3)",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: connectionStatus === "connected" ? "#4ade80" : "#555",
                      animation: connectionStatus === "connected" ? "pulse 2s infinite" : "none",
                    }}
                  />
                  {connectionStatus === "connected" ? "Ao vivo" : connectionMessage}
                </div>
                {selectedJob.finalVideoUrl && (
                  <a href={selectedJob.finalVideoUrl} download className="text-[10px] font-bold text-white/50 hover:text-white bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 rounded-full transition-all no-underline">
                    Baixar
                  </a>
                )}
              </div>
            </div>

            {/* Segments — A / B / C */}
            <div className="grid grid-cols-3 gap-4">
              {(selectedJob.segments ?? []).map((segment) => {
                const lastAttempt = segment.attempts?.at(-1);
                const attemptNum = segment.status === "running"
                  ? Math.min((segment.attempts?.length || 0) + 1, 3)
                  : segment.attempts?.length || 0;
                const statusColor = STATUS_COLORS[segment.status] || "#555";
                const isRunning = segment.status === "running";
                return (
                  <div
                    key={segment.index}
                    className="rounded-2xl p-4 border relative overflow-hidden transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${STATUS_BG[segment.status] || "rgba(255,255,255,0.02)"} 0%, rgba(0,0,0,0.3) 100%)`,
                      borderColor: `${statusColor}30`,
                    }}
                  >
                    {isRunning && (
                      <div className="absolute inset-0 opacity-[0.03] animate-pulse" style={{ background: `radial-gradient(ellipse at 50% 0%, ${statusColor}, transparent 70%)` }} />
                    )}
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black" style={{ background: `${statusColor}20`, color: statusColor }}>
                            {segment.label}
                          </div>
                          <span className="text-xs font-black text-white/60">Segmento {segment.label}</span>
                        </div>
                        <StatusPill status={segment.status} />
                      </div>

                      <div className="space-y-1 mb-3">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-white/30">Tentativa</span>
                          <span className="font-mono text-white/50">{attemptNum} / 3</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-white/30">Pontuação</span>
                          <span className="font-mono font-bold" style={{ color: lastAttempt?.score ? statusColor : "rgba(255,255,255,0.3)" }}>
                            {lastAttempt?.score ?? "—"} / 10
                          </span>
                        </div>
                        {isRunning && segment.currentStep && (
                          <div className="text-[10px] text-blue-300/70 mt-1 truncate">{segment.currentStep}</div>
                        )}
                      </div>

                      <BreakdownBars breakdown={lastAttempt?.breakdown} />

                      {segment.finalClipUrl && (
                        <video src={segment.finalClipUrl} muted playsInline controls className="mt-4 w-full rounded-xl bg-black aspect-video object-cover border border-white/[0.07]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Activity log */}
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.05] bg-black/40">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-2">Log de Atividade dos Agentes</span>
                </div>
                <button type="button" onClick={exportLog} className="text-[10px] font-bold text-white/30 hover:text-white/60 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-md px-3 py-1.5 transition-all">
                  Exportar
                </button>
              </div>
              <div ref={logRef} className="max-h-64 overflow-y-auto p-4 custom-scrollbar" style={{ background: "#020202", fontFamily: "JetBrains Mono, Menlo, monospace" }}>
                {selectedJob.log?.map((entry, idx) => (
                  <div key={`${entry.timestamp}-${idx}`} className="flex gap-2 text-[11px] leading-6">
                    <span className="flex-shrink-0 text-white/20 tabular-nums">{formatTime(entry.timestamp)}</span>
                    <span className="flex-shrink-0 font-bold" style={{ color: logColor(entry.agent) }}>[{entry.agent}]</span>
                    <span className="text-white/55">{entry.message}</span>
                  </div>
                ))}
                {!selectedJob.log?.length && (
                  <div className="text-[11px] text-white/20 py-2">Aguardando atividade…</div>
                )}
              </div>
            </div>

            {/* Final output */}
            {(selectedJob.status === "done" || selectedJob.finalVideoUrl || allSegmentsDone) && (
              <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.05] bg-black/40">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Resultado Final</span>
                </div>
                <div className="p-5">
                  {selectedJob.finalVideoUrl ? (
                    <video src={selectedJob.finalVideoUrl} controls className="w-full rounded-xl bg-black border border-white/[0.07]" />
                  ) : (
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5 text-center">
                      <div className="w-8 h-8 border-2 border-white/10 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-[11px] text-white/30">Segmentos prontos — renderização final em andamento</p>
                    </div>
                  )}
                  {scoreSummary(selectedJob) && (
                    <p className="text-[10px] font-mono text-white/30 mt-3">{scoreSummary(selectedJob)}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
