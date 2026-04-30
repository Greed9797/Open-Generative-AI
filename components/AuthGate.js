"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthGate({ children }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data?.session || null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [supabase]);

  async function sendMagicLink(event) {
    event.preventDefault();
    setError("");
    setSent(false);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Informe seu email.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Nao foi possivel enviar o link.");
      setSent(true);
    } catch (err) {
      setError(err.message || "Nao foi possivel enviar o link.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#000" }} />;
  }

  if (session) return children;

  return (
    <main style={{
      minHeight: "100vh",
      background: "#000",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <form onSubmit={sendMagicLink} style={{
        width: "100%",
        maxWidth: 420,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        textAlign: "center",
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.22em", color: "#FF4500", marginBottom: 12 }}>
            VBO.AI
          </div>
          <h1 style={{ fontSize: 32, lineHeight: 1, margin: 0, fontWeight: 900 }}>
            Acesse seu Studio
          </h1>
          <p style={{ margin: "12px 0 0", color: "rgba(255,255,255,0.48)", fontSize: 14 }}>
            Receba um link seguro no seu email para continuar.
          </p>
        </div>

        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="seu@email.com"
          autoComplete="email"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            color: "#fff",
            padding: "14px 16px",
            fontSize: 15,
            outline: "none",
          }}
        />

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            border: 0,
            borderRadius: 10,
            padding: "14px 16px",
            background: submitting ? "rgba(255,69,0,0.55)" : "#FF4500",
            color: "#000",
            fontWeight: 900,
            cursor: submitting ? "not-allowed" : "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {submitting ? "Enviando..." : "Enviar link de acesso"}
        </button>

        {sent && (
          <p style={{ margin: 0, color: "#5DCAA5", fontSize: 14 }}>
            Verifique seu email.
          </p>
        )}
        {error && (
          <p style={{ margin: 0, color: "#E24B4A", fontSize: 14 }}>
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
