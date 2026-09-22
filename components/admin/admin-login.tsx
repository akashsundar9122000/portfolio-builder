"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export function AdminLogin({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "Couldn’t sign in.");
      return;
    }
    // a full load, so the server components read the new cookie
    window.location.assign(next);
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <label htmlFor="admin-password" className="text-sm">Admin password</label>
      <input id="admin-password" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} />
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy || !password}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Sign in
      </button>
    </form>
  );
}
