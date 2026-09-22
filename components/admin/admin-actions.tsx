"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Loader2, LogOut, Mail, RefreshCw, Send, X } from "lucide-react";
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
export function RequestActions({ id, sig, state, firstCode, email, issuedCode }: { id: string; sig: string; state: RowState; firstCode?: string; email: string; issuedCode?: string }) {
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
          <RevokeButton id={id} sig={sig} email={email} code={issuedCode ?? ""} onDone={(text) => setMsg({ tone: "ok", text })} />
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

/**
 * Revoke an active code. Irreversible, so it spells that out and asks for
 * the admin password again; the person is emailed and signed out.
 */
export function RevokeButton({ id, sig, email, code, compact, onDone }: { id: string; sig: string; email: string; code: string; compact?: boolean; onDone?: (text: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn hover:text-danger hover:border-danger ${compact ? "min-h-9 px-3 text-[11px]" : ""}`} onClick={() => setOpen(true)}>
        <Ban className="size-4" aria-hidden /> {compact ? "Revoke" : "Revoke code"}
      </button>
      {open && (
        <RevokeDialog
          id={id} sig={sig} email={email} code={code}
          onClose={() => setOpen(false)}
          onRevoked={(mailed) => {
            setOpen(false);
            onDone?.(mailed ? `Code revoked. ${email} has been emailed.` : "Code revoked, but the email to them failed.");
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function RevokeDialog({ id, sig, email, code, onClose, onRevoked }: { id: string; sig: string; email: string; code: string; onClose: () => void; onRevoked: (mailed: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await post(`/api/admin/requests/${id}`, { action: "revoke", sig, password, reason });
      onRevoked(Boolean(r.mailed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t revoke the code.");
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} aria-labelledby={`revoke-${id}`} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      className="card text-text m-auto w-[min(30rem,calc(100%-2rem))] p-6 text-left backdrop:bg-black/70">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-danger mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <h2 id={`revoke-${id}`} className="text-lg font-semibold">Revoke <span className="font-mono">{code}</span>?</h2>
            <ul className="text-text-2 mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed">
              <li>It stops working immediately and <strong className="text-text">{email}</strong> is signed out.</li>
              <li>They get an email saying the code was revoked{reason.trim() ? ", with your reason" : ""}.</li>
              <li><strong className="text-text">This can’t be undone.</strong> To build again they must request a new code.</li>
            </ul>
          </div>
        </div>
        <label className="text-sm" htmlFor={`revoke-reason-${id}`}>Reason <span className="text-text-3">(optional, included in the email)</span></label>
        <textarea id={`revoke-reason-${id}`} className="input -mt-2 min-h-20" maxLength={600} value={reason} onChange={(e) => setReason(e.target.value)} />
        <label className="text-sm" htmlFor={`revoke-pw-${id}`}>Admin password</label>
        <input id={`revoke-pw-${id}`} type="password" autoComplete="current-password" className="input -mt-2" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} aria-invalid={Boolean(error)} autoFocus />
        {error && <p role="alert" className="border-danger/40 bg-danger/10 text-danger rounded-xl border px-4 py-3 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn border-danger text-danger hover:bg-danger/10" disabled={busy || !password}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Ban className="size-4" aria-hidden />} Revoke for good
          </button>
        </div>
      </form>
    </dialog>
  );
}
