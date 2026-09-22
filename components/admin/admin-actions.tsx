"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, LogOut, Mail, RefreshCw, Send, X } from "lucide-react";
import type { RowState } from "./status";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export function AdminSignOut() {
  const router = useRouter();
  return (
    <button type="button" className="btn" onClick={async () => { await fetch("/api/admin/login", { method: "DELETE" }); router.replace("/admin/login"); router.refresh(); }}>
      <LogOut className="size-4" aria-hidden /> Sign out
    </button>
  );
}

/** Pending: preview/regenerate a code, add a note, send or reject. Sent: resend or revoke. */
export function RequestActions({ id, sig, state, firstCode, email }: { id: string; sig: string; state: RowState; firstCode?: string; email: string }) {
  const router = useRouter();
  const [code, setCode] = useState(firstCode ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(kind: string, fn: () => Promise<string | void>) {
    setBusy(kind);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ tone: "ok", text });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy("");
      if (kind !== "regen") router.refresh();
    }
  }

  const spin = (k: string, Icon: typeof Send) => (busy === k ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />);

  return (
    <div className="mt-6 flex flex-col gap-4">
      {state === "pending" && (
        <div className="card flex flex-col gap-4 p-6">
          <div>
            <p className="label">Code to send</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <output aria-live="polite" className="bg-sunken border-hair-strong rounded-xl border px-5 py-3 font-mono text-2xl tracking-[0.12em]">{code || "—"}</output>
              <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => run("regen", async () => setCode((await post("/api/admin/preview")).code))}>
                {spin("regen", RefreshCw)} Regenerate
              </button>
            </div>
            <p className="text-text-3 mt-2 text-sm">Regenerate as often as you like — nothing is reserved until you press Send. Every code is checked against all codes ever issued.</p>
          </div>
          <div>
            <label htmlFor="note" className="label">Note to {email} (optional)</label>
            <textarea id="note" className="input mt-2 min-h-24" maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Included in the email — e.g. a tip, or the reason for rejecting." />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={Boolean(busy) || !code} onClick={() => run("send", async () => {
              const r = await post(`/api/admin/requests/${id}`, { action: "send", sig, code, note });
              if (!r.mailed) throw new Error(r.error);
              return `Sent ${r.code} to ${email}.`;
            })}>
              {spin("send", Send)} Send code
            </button>
            <button type="button" className="btn hover:text-danger hover:border-danger" disabled={Boolean(busy)} onClick={() => {
              if (!confirm(`Reject this request? ${email} will get a polite "not approved" email${note ? " with your note" : ""}.`)) return;
              void run("reject", async () => { await post(`/api/admin/requests/${id}`, { action: "reject", sig, note }); return "Request rejected."; });
            }}>
              {spin("reject", X)} Reject
            </button>
          </div>
        </div>
      )}

      {state === "active" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => run("resend", async () => { await post(`/api/admin/requests/${id}`, { action: "resend", sig }); return `Code emailed again to ${email}.`; })}>
            {spin("resend", Mail)} Resend email
          </button>
          <button type="button" className="btn hover:text-danger hover:border-danger" disabled={Boolean(busy)} onClick={() => {
            if (!confirm("Revoke this code? It stops working immediately, including any open session.")) return;
            void run("revoke", async () => { await post(`/api/admin/requests/${id}`, { action: "revoke", sig }); return "Code revoked."; });
          }}>
            {spin("revoke", Ban)} Revoke code
          </button>
        </div>
      )}

      {msg && (
        <p role={msg.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${msg.tone === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-ok/40 bg-ok/10 text-text"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
