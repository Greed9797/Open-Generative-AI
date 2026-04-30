"use client";

import { useEffect, useState } from "react";

const panel = { background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 18 };
const input = { width: "100%", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "white", padding: "10px 12px", boxSizing: "border-box" };
const button = { border: 0, borderRadius: 8, background: "#FF4500", color: "black", fontWeight: 900, padding: "10px 14px", cursor: "pointer" };

export default function LoraStudio() {
  const [loras, setLoras] = useState([]);
  const [files, setFiles] = useState([]);
  const [name, setName] = useState("");
  const [triggerWord, setTriggerWord] = useState("");
  const [selectedLora, setSelectedLora] = useState("");
  const [anchorPrompt, setAnchorPrompt] = useState("");
  const [lastAnchor, setLastAnchor] = useState(null);
  const [message, setMessage] = useState("");

  async function loadLoras() {
    const response = await fetch("/api/lora/list");
    const data = await response.json().catch(() => ({}));
    if (response.ok) setLoras(data.loras || []);
  }

  useEffect(() => { loadLoras(); }, []);

  async function train(event) {
    event.preventDefault();
    setMessage("");
    if (files.length < 10 || files.length > 30) {
      setMessage("Envie entre 10 e 30 imagens.");
      return;
    }
    const form = new FormData();
    form.append("name", name);
    form.append("trigger_word", triggerWord);
    files.forEach((file) => form.append("images", file));
    const response = await fetch("/api/lora/train", { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Treinamento iniciado." : data.error || "Falha ao iniciar treinamento.");
    if (response.ok) loadLoras();
  }

  async function generateAnchor(event) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/anchor/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loraId: selectedLora, prompt: anchorPrompt }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Falha ao gerar ancora.");
      return;
    }
    setLastAnchor(data);
  }

  return (
    <div style={{ minHeight: "100%", background: "#050505", color: "white", padding: 24, display: "grid", gap: 18 }}>
      <section style={panel}>
        <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>Meus LoRAs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {loras.map((lora) => (
            <div key={lora.id} style={{ ...panel, padding: 14 }}>
              <div style={{ fontWeight: 900 }}>{lora.name}</div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{lora.trigger_word}</div>
              <span style={{ display: "inline-block", marginTop: 10, padding: "4px 8px", borderRadius: 999, background: "rgba(255,69,0,0.12)", color: "#FF4500", fontSize: 11, fontWeight: 800 }}>
                {lora.status}
              </span>
              {lora.cost_usd && <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>${lora.cost_usd}</div>}
              {lora.status === "ready" && (
                <button type="button" onClick={() => setSelectedLora(lora.id)} style={{ ...button, marginTop: 12, width: "100%" }}>
                  Gerar ancora
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={panel}>
        <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>Treinar novo</h2>
        <form onSubmit={train} style={{ display: "grid", gap: 12 }}>
          <input style={input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do LoRA" />
          <input style={input} value={triggerWord} onChange={(event) => setTriggerWord(event.target.value.replace(/\s+/g, "_"))} placeholder="trigger_word" />
          <input style={input} type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 30))} />
          <p style={{ margin: 0, color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Minimo 10, maximo 30 imagens. O treinamento pode gerar custo no Replicate.</p>
          <button style={button} type="submit">Iniciar treinamento</button>
        </form>
      </section>

      <section style={panel}>
        <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>Gerar ancora</h2>
        <form onSubmit={generateAnchor} style={{ display: "grid", gap: 12 }}>
          <select style={input} value={selectedLora} onChange={(event) => setSelectedLora(event.target.value)}>
            <option value="">Selecione um LoRA ready</option>
            {loras.filter((lora) => lora.status === "ready").map((lora) => <option key={lora.id} value={lora.id}>{lora.name}</option>)}
          </select>
          <textarea style={{ ...input, minHeight: 90 }} value={anchorPrompt} onChange={(event) => setAnchorPrompt(event.target.value)} placeholder="Prompt da ancora" />
          <button style={button} type="submit">Gerar ancora</button>
        </form>
        {lastAnchor?.imageUrl && (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <img src={lastAnchor.imageUrl} alt="" style={{ width: "100%", maxWidth: 420, borderRadius: 8 }} />
            <button type="button" style={button} onClick={() => window.dispatchEvent(new CustomEvent("set-agent-base-image", { detail: { url: lastAnchor.imageUrl, label: anchorPrompt || "LoRA anchor" } }))}>
              Usar como base no Agent Studio
            </button>
          </div>
        )}
      </section>

      {message && <div style={{ color: "#FF4500", fontWeight: 800 }}>{message}</div>}
    </div>
  );
}
