"use client";

import { useEffect, useState, type FormEvent } from "react";
import { refreshSession } from "../../lib/auth/client";

function destination() {
  const path = new URLSearchParams(window.location.search).get("next") || "/";
  const url = new URL(path, window.location.origin);
  return url.origin === window.location.origin && url.pathname !== "/login" ? url.pathname + url.search : "/";
}
export default function LoginPage() {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    refreshSession().then((ok) => {
      if (active && ok) window.location.replace(destination());
    }).catch(() => {
      if (active) setError("Não foi possível verificar a sessão.");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), senha: data.get("senha") }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Não foi possível entrar."); return; }
      window.location.replace(destination());
    } catch { setError("Não foi possível conectar ao servidor."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center p-6">
    <form onSubmit={submit} className="grid w-full max-w-sm gap-4 rounded-xl border p-6">
      <h1 className="text-2xl font-semibold">Entrar no ERP</h1>
      <label className="grid gap-1">Email<input name="email" type="email" required maxLength={150}
        autoComplete="username" className="rounded border p-2" /></label>
      <label className="grid gap-1">Senha<input name="senha" type="password" required
        autoComplete="current-password" className="rounded border p-2" /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="rounded bg-green-700 p-2 text-white disabled:opacity-50">
        {busy ? "Aguarde…" : "Entrar"}
      </button>
    </form>
  </main>;
}
