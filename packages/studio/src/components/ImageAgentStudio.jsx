"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { uploadFile } from "../muapi.js";

const SESSION_KEY = "creativeos_supabase_session";
const WORKFLOWS = [
  { id: "product", label: "Produto" },
  { id: "portrait", label: "Retrato" },
  { id: "fashion", label: "Fashion" },
  { id: "brand", label: "Brandbook" },
  { id: "architecture", label: "Arquitetura" },
  { id: "social", label: "Social Ads" },
];

function authHeaders() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
  } catch {
    return {};
  }
}

function StatusPill({ status }) {
  const color = status === "done" ? "#639922" : status === "failed" ? "#E24B4A" : status === "running" ? "#378ADD" : "#888780";
  return (
    <span style={{ color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
      {status || "pending"}
    </span>
  );
}

function scoreColor(score) {
  if (score >= 7.5) return "#639922";
  if (score >= 5) return "#EF9F27";
  return "#E24B4A";
}

function AttemptStrip({ attempts = [] }) {
  if (!attempts.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
      {attempts.slice(-3).map((attempt) => {
        const score = Number(attempt.qa?.score || 0);
        return (
          <div key={attempt.attempt} title={(attempt.qa?.problems || []).join(" · ")} style={{ border: `1px solid ${scoreColor(score)}55`, borderRadius: 8, overflow: "hidden", background: "#111" }}>
            <div style={{ aspectRatio: "1/1", background: "#0a0a0a" }}>
              {attempt.imageUrl && <img src={attempt.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 5px", fontSize: 9, color: "rgba(255,255,255,0.62)" }}>
              <span>T{attempt.attempt}</span>
              <span style={{ color: scoreColor(score), fontWeight: 900 }}>{score ? score.toFixed(1) : "-"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ImageAgentStudio({ apiKey, minimaxApiKey, geminiApiKey }) {
  const [prompt, setPrompt] = useState("");
  const [workflow, setWorkflow] = useState("product");
  const [targetModel, setTargetModel] = useState("google-imagen4-fast");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [targetCount, setTargetCount] = useState(6);
  const [qualityThreshold, setQualityThreshold] = useState(7);
  const [referenceImages, setReferenceImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [feedbackDraft, setFeedbackDraft] = useState({});
  const fileInputRef = useRef(null);

  const acceptedCount = useMemo(() => (selectedJob?.outputs || []).filter((output) => output.status === "accepted").length, [selectedJob]);
  const progressPct = selectedJob ? Math.round(((selectedJob.outputs || []).filter((output) => ["accepted", "best_effort"].includes(output.status)).length / Math.max(1, selectedJob.targetCount || 1)) * 100) : 0;

  async function loadJobs() {
    const response = await fetch("/api/image-agent/list-jobs", { headers: authHeaders(), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setJobs(data.jobs || []);
  }

  useEffect(() => {
    loadJobs().catch(() => {});
    const timer = setInterval(() => loadJobs().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedJobId) return undefined;
    const events = new EventSource(`/api/image-agent/stream/${selectedJobId}`);
    events.onmessage = (event) => {
      const job = JSON.parse(event.data);
      setSelectedJob(job);
      if (job?.status === "done" || job?.status === "failed") {
        events.close();
        loadJobs().catch(() => {});
      }
    };
    events.onerror = () => events.close();
    return () => events.close();
  }, [selectedJobId]);

  async function uploadReferences(files) {
    const list = Array.from(files || []).filter((file) => file.type.startsWith("image/")).slice(0, 12);
    if (!list.length) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = [];
      for (const file of list) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} excede 10MB`);
        const url = await uploadFile(apiKey, file);
        uploaded.push(url);
      }
      setReferenceImages((current) => [...current, ...uploaded].slice(0, 12));
    } catch (err) {
      setError(err.message || "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function startJob(event) {
    event.preventDefault();
    if (!prompt.trim()) {
      setError("Descreva o objetivo da geração.");
      return;
    }
    setQueueing(true);
    setError("");
    try {
      const response = await fetch("/api/image-agent/start-job", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gemini-api-key": geminiApiKey || "",
          "x-minimax-api-key": minimaxApiKey || "",
          ...authHeaders(),
        },
        body: JSON.stringify({ prompt, workflow, targetModel, aspectRatio, targetCount, qualityThreshold, referenceImages }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Falha ao iniciar job");
      setSelectedJobId(data.jobId);
      setPrompt("");
      await loadJobs();
    } catch (err) {
      setError(err.message || "Falha ao iniciar job");
    } finally {
      setQueueing(false);
    }
  }

  async function sendFeedback(outputIndex, rating) {
    const notes = feedbackDraft[outputIndex] || "";
    await fetch("/api/image-agent/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ jobId: selectedJob?.id, outputIndex, rating, notes }),
    }).catch(() => {});
    setFeedbackDraft((current) => ({ ...current, [outputIndex]: "" }));
  }

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "340px minmax(0,1fr)", background: "#050505", color: "#fff", overflow: "hidden", fontFamily: "Inter, system-ui, sans-serif" }}>
      <aside style={{ borderRight: "1px solid rgba(255,255,255,0.07)", padding: 20, overflowY: "auto", background: "rgba(0,0,0,0.35)" }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Image Agent Studio</h1>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.5 }}>Gera lotes de 1 a 30 imagens, avalia com Gemini Vision e salva sinais de QA para melhorar os prompts.</p>
          <div style={{ marginTop: 12, border: "1px solid rgba(239,159,39,0.28)", background: "rgba(239,159,39,0.09)", color: "#f3c46f", borderRadius: 10, padding: 10, fontSize: 11, lineHeight: 1.45 }}>
            Nesta versão, as referências orientam estilo, composição e conceito via Gemini Vision. Clonagem física 1:1 de rosto/produto depende de LoRA, ControlNet ou image-to-image nativo do provider.
          </div>
        </div>

        <form onSubmit={startJob} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Prompt do agente</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Explique o que gerar, como usar as referências e o que deve ser rejeitado no QA." rows={5} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", borderRadius: 10, padding: 12, outline: "none", resize: "vertical" }} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Workflow</span>
              <select value={workflow} onChange={(event) => setWorkflow(event.target.value)} style={{ background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10 }}>
                {WORKFLOWS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Saídas</span>
              <input type="number" min="1" max="30" value={targetCount} onChange={(event) => setTargetCount(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} style={{ background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10 }} />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Modelo</span>
              <select value={targetModel} onChange={(event) => setTargetModel(event.target.value)} style={{ background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10 }}>
                <option value="google-imagen4-fast">Imagen Fast</option>
                <option value="google-imagen4">Imagen Pro</option>
                <option value="google-imagen4-ultra">Imagen Ultra</option>
                <option value="nano-banana">Nano Banana</option>
                <option value="wanx2.1-t2i-turbo">Wan T2I</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Aspecto</span>
              <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} style={{ background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10 }}>
                {["1:1", "16:9", "9:16", "4:3", "3:4"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>QA mínimo: {qualityThreshold.toFixed(1)}</span>
            <input type="range" min="5" max="9.5" step="0.5" value={qualityThreshold} onChange={(event) => setQualityThreshold(Number(event.target.value))} />
          </label>

          <div>
            <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(event) => uploadReferences(event.target.files)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ width: "100%", border: "1px dashed rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.04)", color: "#fff", borderRadius: 12, padding: 14, cursor: "pointer" }}>
              {uploading ? "Enviando referências..." : `Adicionar referências (${referenceImages.length}/12)`}
            </button>
            {referenceImages.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 10 }}>
                {referenceImages.map((url, index) => (
                  <button key={url} type="button" onClick={() => setReferenceImages((current) => current.filter((_, idx) => idx !== index))} style={{ padding: 0, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden", background: "#111", aspectRatio: "1/1", cursor: "pointer" }}>
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <div style={{ color: "#ff8b8b", background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.25)", borderRadius: 10, padding: 10, fontSize: 12 }}>{error}</div>}
          <button type="submit" disabled={queueing || uploading} style={{ background: "#FF4500", color: "#000", border: 0, borderRadius: 999, padding: "13px 16px", fontWeight: 900, cursor: "pointer", opacity: queueing ? 0.6 : 1 }}>
            {queueing ? "Enfileirando..." : "Iniciar agente de imagem"}
          </button>
        </form>

        <div style={{ marginTop: 22, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>Jobs recentes</div>
          {jobs.map((job) => (
            <button key={job.id} type="button" onClick={() => setSelectedJobId(job.id)} style={{ textAlign: "left", background: selectedJobId === job.id ? "rgba(255,69,0,0.1)" : "rgba(255,255,255,0.035)", color: "#fff", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 10, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <StatusPill status={job.status} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{job.qaSummary?.accepted ?? 0}/{job.targetCount || job.outputs?.length || 0}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.prompt}</div>
            </button>
          ))}
        </div>
      </aside>

      <main style={{ minWidth: 0, overflowY: "auto", padding: 22 }}>
        {!selectedJob ? (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: "rgba(255,255,255,0.28)", textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.45)" }}>Nenhum job selecionado</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>Crie um lote para acompanhar QA, tentativas e imagens aprovadas.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            <section style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><StatusPill status={selectedJob.status} /><span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>{selectedJob.id}</span></div>
                <h2 style={{ margin: "10px 0 0", fontSize: 20 }}>{selectedJob.workflow} · {selectedJob.targetModel}</h2>
                <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.48)", fontSize: 13 }}>{acceptedCount}/{selectedJob.targetCount} aprovadas · progresso {progressPct}%</p>
              </div>
              <div style={{ minWidth: 180, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 12 }}>
                <div style={{ width: `${progressPct}%`, height: "100%", background: "#FF4500" }} />
              </div>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
              {(selectedJob.outputs || []).map((output) => {
                const score = Number(output.score || 0);
                const last = output.attempts?.[output.attempts.length - 1];
                return (
                  <article key={output.index} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.025)" }}>
                    <div style={{ aspectRatio: "1/1", background: "#111", display: "grid", placeItems: "center" }}>
                      {output.imageUrl ? <img src={output.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>Aguardando</span>}
                    </div>
                    <div style={{ padding: 12, display: "grid", gap: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <StatusPill status={output.status} />
                        <span style={{ color: scoreColor(score), fontWeight: 900, fontSize: 12 }}>{score ? score.toFixed(1) : "-"}/10</span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Tentativas QA: {output.attempts?.length || 0}/3</div>
                      {output.providerError && <div style={{ fontSize: 11, color: "#ff8b8b", lineHeight: 1.45 }}>Provider: {output.providerError.message}</div>}
                      <AttemptStrip attempts={output.attempts || []} />
                      {last?.qa?.problems?.length > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.45 }}>{last.qa.problems.slice(0, 2).join(" · ")}</div>}
                      <textarea value={feedbackDraft[output.index] || ""} onChange={(event) => setFeedbackDraft((current) => ({ ...current, [output.index]: event.target.value }))} placeholder="Correção humana para calibrar QA" rows={2} style={{ background: "rgba(0,0,0,0.35)", color: "#fff", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 8, fontSize: 11, resize: "vertical" }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={() => sendFeedback(output.index, "approved")} style={{ flex: 1, border: "1px solid rgba(99,153,34,0.35)", color: "#9bd06a", background: "rgba(99,153,34,0.1)", borderRadius: 8, padding: 8, fontWeight: 800, fontSize: 11 }}>Aprovou</button>
                        <button type="button" onClick={() => sendFeedback(output.index, "rejected")} style={{ flex: 1, border: "1px solid rgba(226,75,74,0.35)", color: "#ff8b8b", background: "rgba(226,75,74,0.1)", borderRadius: 8, padding: 8, fontWeight: 800, fontSize: 11 }}>Rejeitou</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "#020202", padding: 14, maxHeight: 260, overflowY: "auto" }}>
              {(selectedJob.log || []).map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} style={{ display: "grid", gridTemplateColumns: "82px 135px 1fr", gap: 8, fontSize: 11, lineHeight: "22px", fontFamily: "monospace" }}>
                  <span style={{ color: "rgba(255,255,255,0.25)" }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <span style={{ color: "#FF4500", fontWeight: 800 }}>[{entry.agent}]</span>
                  <span style={{ color: "rgba(255,255,255,0.62)" }}>{entry.message}</span>
                </div>
              ))}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
