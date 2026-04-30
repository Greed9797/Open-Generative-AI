"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_PILL = {
  pending: { bg: "#F1EFE8", color: "#5F5E5A", border: "#D3D1C7", label: "Pendente" },
  running: { bg: "#E6F1FB", color: "#185FA5", border: "#B5D4F4", label: "Em execução" },
  done: { bg: "#EAF3DE", color: "#3B6D11", border: "#C0DD97", label: "Concluído" },
  failed: { bg: "#FCEBEB", color: "#A32D2D", border: "#F7C1C1", label: "Falhou" },
  best_effort: { bg: "#FAEEDA", color: "#854F0B", border: "#FAC775", label: "Best effort" },
};

const SEGMENT_DOT = {
  passed: "#639922",
  running: "#378ADD",
  pending: "#D3D1C7",
  failed: "#E24B4A",
  best_effort: "#EF9F27",
};

const CARD_BORDER = {
  running: "#378ADD",
  done: "#639922",
  failed: "#E24B4A",
  best_effort: "#EF9F27",
  pending: "transparent",
};

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "running", label: "Em execução" },
  { key: "done", label: "Concluídos" },
  { key: "failed", label: "Falhou" },
  { key: "pending", label: "Pendente" },
  { key: "best_effort", label: "Best effort" },
];

const KANBAN_COLUMNS = [
  { key: "pending", label: "Pendente" },
  { key: "running", label: "Em execução" },
  { key: "done", label: "Concluído" },
  { key: "best_effort", label: "Best effort" },
  { key: "failed", label: "Falhou" },
];

function modelIcon(model) {
  const m = String(model || "").toLowerCase();
  if (m.includes("seedance")) return "S";
  if (m.includes("veo")) return "V";
  if (m.includes("kling")) return "K";
  if (m.includes("runway")) return "R";
  if (m.includes("wan")) return "W";
  return "G";
}

function relativeTime(value) {
  if (!value) return "";
  const diff = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function scoreColor(score) {
  if (score == null) return "#888780";
  if (score >= 7.5) return "#639922";
  if (score >= 5) return "#EF9F27";
  return "#E24B4A";
}

function avgScore(job) {
  if (!job?.segments) return null;
  const scores = job.segments
    .map((s) => s.attempts?.at(-1)?.score)
    .filter((s) => s != null);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.pending;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 700,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {s.label}
    </span>
  );
}

function SegmentDots({ segments }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {(segments || []).slice(0, 3).map((seg) => (
        <div
          key={seg.index}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: SEGMENT_DOT[seg.status] || "#D3D1C7",
          }}
          title={`${seg.label}: ${seg.status}`}
        />
      ))}
    </div>
  );
}

function ProgressBar({ percent, color }) {
  return (
    <div style={{ height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${percent}%`, background: color, transition: "width 200ms" }} />
    </div>
  );
}

function jobProgress(job) {
  if (!job?.segments) return 0;
  const total = job.segments.length || 3;
  const done = job.segments.filter((s) => ["passed", "best_effort"].includes(s.status)).length;
  return Math.round((done / total) * 100);
}

function fetchFullJob(jobId) {
  return fetch(`/api/agent-studio/job-status/${jobId}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

export default function JobsCRM({ jobs: initialJobs = [], onSelectJob, onRepeatJob }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [viewMode, setViewMode] = useState("list");
  const [filter, setFilter] = useState("all");
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedJobFull, setSelectedJobFull] = useState(null);

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/agent-studio/list-jobs");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setJobs(data.jobs || []);
      } catch { /* ignore */ }
    }
    poll();
    const timer = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!selectedJobId) { setSelectedJobFull(null); return; }
    let cancelled = false;
    fetchFullJob(selectedJobId).then((job) => { if (!cancelled) setSelectedJobFull(job); });
    return () => { cancelled = true; };
  }, [selectedJobId]);

  const filtered = useMemo(() => {
    if (filter === "all") return jobs;
    return jobs.filter((j) => j.status === filter);
  }, [jobs, filter]);

  const grouped = useMemo(() => {
    const out = { pending: [], running: [], done: [], best_effort: [], failed: [] };
    for (const job of filtered) {
      const bucket = out[job.status] ? job.status : "pending";
      out[bucket].push(job);
    }
    return out;
  }, [filtered]);

  const renderListRow = (job) => {
    const score = avgScore(job);
    return (
      <div
        key={job.id}
        onClick={() => setSelectedJobId(job.id)}
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr 1fr 0.7fr 0.7fr 0.6fr",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          background: selectedJobId === job.id ? "#1a1a1a" : "#0f0f0f",
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          marginBottom: 6,
          cursor: "pointer",
          fontSize: 13,
          color: "#e5e5e5",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>{modelIcon(job.targetModel)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {job.id.slice(0, 12)}…
            </div>
            <div style={{ fontSize: 11, color: "#888780", marginTop: 2 }}>
              {job.targetModel} · {job.style || "—"}
            </div>
          </div>
        </div>
        <div><StatusPill status={job.status} /></div>
        <div style={{ fontSize: 11, color: "#888780" }}>{job.targetModel}</div>
        <div style={{ fontWeight: 700, color: scoreColor(score) }}>
          {score != null ? score.toFixed(1) : "—"}
        </div>
        <div style={{ fontSize: 11, color: "#888780" }}>{relativeTime(job.createdAt)}</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (onSelectJob) onSelectJob(job.id); }}
            style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#e5e5e5", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}
            title="Abrir detalhes"
          >↗</button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (onRepeatJob) onRepeatJob(job); }}
            style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#e5e5e5", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}
            title="Repetir job"
          >↺</button>
        </div>
      </div>
    );
  };

  const renderKanbanCard = (job) => {
    const score = avgScore(job);
    const progress = jobProgress(job);
    return (
      <div
        key={job.id}
        onClick={() => setSelectedJobId(job.id)}
        style={{
          padding: 12,
          background: "#0f0f0f",
          border: "1px solid #2a2a2a",
          borderLeft: `3px solid ${CARD_BORDER[job.status] || "#2a2a2a"}`,
          borderRadius: 8,
          marginBottom: 8,
          cursor: "pointer",
          fontSize: 13,
          color: "#e5e5e5",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>{modelIcon(job.targetModel)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {job.id.slice(0, 14)}…
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, padding: "1px 6px", background: "#1a1a1a", borderRadius: 99, color: "#888780" }}>
            {job.targetModel}
          </span>
          {job.style && (
            <span style={{ fontSize: 10, padding: "1px 6px", background: "#1a1a1a", borderRadius: 99, color: "#888780" }}>
              {job.style}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <SegmentDots segments={job.segments} />
          {score != null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(score) }}>
              {score.toFixed(1)}
            </span>
          )}
        </div>
        {job.status === "running" && (
          <div style={{ marginTop: 8 }}>
            <ProgressBar percent={progress} color="#378ADD" />
          </div>
        )}
      </div>
    );
  };

  const handleNewJob = () => {
    if (onSelectJob) onSelectJob(null);
  };

  return (
    <div style={{ background: "#0f0f0f", color: "#e5e5e5", minHeight: "100%", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Jobs</h2>
          <span style={{ background: "#1a1a1a", padding: "2px 8px", borderRadius: 99, fontSize: 11, color: "#888780" }}>
            {jobs.length}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", border: "1px solid #2a2a2a", borderRadius: 6, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              style={{
                padding: "4px 10px", fontSize: 11, fontWeight: 600, background: viewMode === "list" ? "#FF4500" : "transparent",
                color: viewMode === "list" ? "#000" : "#888780", border: "none", cursor: "pointer",
              }}
            >Lista</button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              style={{
                padding: "4px 10px", fontSize: 11, fontWeight: 600, background: viewMode === "kanban" ? "#FF4500" : "transparent",
                color: viewMode === "kanban" ? "#000" : "#888780", border: "none", cursor: "pointer",
              }}
            >Kanban</button>
          </div>
          <button
            type="button"
            onClick={handleNewJob}
            style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, background: "#FF4500", color: "#000", border: "none", borderRadius: 6, cursor: "pointer" }}
          >+ Novo job</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid #2a2a2a", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 99,
              background: filter === f.key ? "rgba(255,69,0,0.12)" : "transparent",
              color: filter === f.key ? "#FF4500" : "#888780",
              border: `1px solid ${filter === f.key ? "rgba(255,69,0,0.3)" : "#2a2a2a"}`,
              cursor: "pointer",
            }}
          >{f.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 20 }}>
        {viewMode === "list" ? (
          <div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 1fr 0.7fr 0.7fr 0.6fr",
              gap: 12, padding: "8px 16px", fontSize: 11, color: "#888780",
              fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              <div>Job</div>
              <div>Status</div>
              <div>Modelo</div>
              <div>Score</div>
              <div>Criado</div>
              <div style={{ textAlign: "right" }}>Ações</div>
            </div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "#888780", fontSize: 13 }}>
                Nenhum job encontrado
              </div>
            ) : filtered.map(renderListRow)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(200px, 1fr))", gap: 12 }}>
            {KANBAN_COLUMNS.map((col) => (
              <div key={col.key} style={{ minWidth: 0 }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", marginBottom: 8, fontSize: 11, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.05em", color: "#888780",
                }}>
                  <span>{col.label}</span>
                  <span style={{ background: "#1a1a1a", padding: "1px 6px", borderRadius: 99 }}>
                    {(grouped[col.key] || []).length}
                  </span>
                </div>
                <div>
                  {(grouped[col.key] || []).map(renderKanbanCard)}
                  {(grouped[col.key] || []).length === 0 && (
                    <div style={{ textAlign: "center", padding: 16, color: "#3a3a3a", fontSize: 11 }}>
                      vazio
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedJobId && (
        <div style={{ borderTop: "1px solid #2a2a2a", padding: 20, background: "#0a0a0a" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 20 }}>{modelIcon(selectedJobFull?.targetModel)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedJobFull?.id || selectedJobId}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <StatusPill status={selectedJobFull?.status || "pending"} />
                  {avgScore(selectedJobFull) != null && (
                    <span style={{ fontSize: 12, color: scoreColor(avgScore(selectedJobFull)), fontWeight: 700 }}>
                      Score: {avgScore(selectedJobFull).toFixed(1)}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: "#888780" }}>
                    {jobProgress(selectedJobFull)}% concluído
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedJobId(null)}
              style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#e5e5e5", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 14 }}
            >×</button>
          </div>

          {selectedJobFull?.segments && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#888780", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Segmentos
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#888780", fontWeight: 600, fontSize: 11 }}>Seg</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#888780", fontWeight: 600, fontSize: 11 }}>Status</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#888780", fontWeight: 600, fontSize: 11 }}>Score</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#888780", fontWeight: 600, fontSize: 11 }}>Progresso</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedJobFull.segments.map((seg) => {
                    const last = seg.attempts?.at(-1);
                    const score = last?.score;
                    const pct = ["passed", "best_effort"].includes(seg.status) ? 100
                      : seg.status === "running" ? 50 : 0;
                    return (
                      <tr key={seg.index} style={{ borderBottom: "1px solid #1a1a1a" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>{seg.label}</td>
                        <td style={{ padding: "6px 8px" }}><StatusPill status={seg.status} /></td>
                        <td style={{ padding: "6px 8px", fontWeight: 700, color: scoreColor(score) }}>
                          {score != null ? score.toFixed(1) : "—"}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <ProgressBar percent={pct} color={SEGMENT_DOT[seg.status] || "#888780"} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => { if (onSelectJob) onSelectJob(selectedJobId); }}
              style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, background: "#1a1a1a", color: "#e5e5e5", border: "1px solid #2a2a2a", borderRadius: 6, cursor: "pointer" }}
            >Ver logs completos</button>
            <button
              type="button"
              onClick={() => { if (onRepeatJob && selectedJobFull) onRepeatJob(selectedJobFull); }}
              style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, background: "#FF4500", color: "#000", border: "none", borderRadius: 6, cursor: "pointer" }}
            >Repetir job</button>
          </div>
        </div>
      )}
    </div>
  );
}
