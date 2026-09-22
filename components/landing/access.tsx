"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Info, Loader2, Mail } from "lucide-react";

/**
 * "Want to create yours?" — sign in with an emailed code, or ask for one.
 * A request goes to the support inbox; Akash approves it by hand.
 */

const SUPPORT = "support.folioforge@gmail.com";

const ENDED: Record<string, string> = {
  used: "Your code has been used — you downloaded both the ZIP and the single HTML file. Request a new code to build another portfolio.",
  expired: "Your code has expired (codes last 7 days). Request a new one below — your draft is still in this browser if it’s under 7 days old.",
  revoked: "Your access code was revoked, so you’ve been signed out. A revoked code can’t be restored — request a new one below if you’d like to keep building.",
};

type Tab = "signin" | "request";

export function Access() {
  const params = useSearchParams();
  const expired = params.get("expired");
  const [tab, setTab] = useState<Tab>(expired && expired in ENDED ? "request" : "signin");
  const notice = expired ? ENDED[expired] ?? "Your session has ended. Sign in with your email and code again — your draft is safe in this browser." : "";

  return (
    <div className="card w-full max-w-xl p-5 sm:p-6">
      <div className="bg-sunken border-hair grid grid-cols-2 gap-1 rounded-full border p-1" role="tablist" aria-label="Access">
        {([["signin", "I have a code"], ["request", "Get a code"]] as const).map(([id, label]) => (
          <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}
            className={`label min-h-11 rounded-full transition-colors ${tab === id ? "bg-accent text-accent-ink" : "hover:text-text"}`}>
            {label}
          </button>
        ))}
      </div>
      {notice && <Message tone="info" id="access-notice">{notice}</Message>}
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-5">
        {tab === "signin" ? <SignIn onRequest={() => setTab("request")} /> : <RequestCode onHaveCode={() => setTab("signin")} />}
      </div>
    </div>
  );
}

function Message({ tone, id, children }: { tone: "error" | "info" | "ok"; id?: string; children: React.ReactNode }) {
  const Icon = tone === "error" ? AlertCircle : tone === "ok" ? CheckCircle2 : Info;
  const cls = tone === "error" ? "border-danger/40 bg-danger/10 text-danger" : tone === "ok" ? "border-ok/40 bg-ok/10 text-text" : "border-accent/35 bg-accent/10 text-text-2";
  return (
    <p id={id} role={tone === "error" ? "alert" : "status"} className={`mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed ${cls}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone === "info" ? "text-accent" : tone === "ok" ? "text-ok" : ""}`} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

function SignIn({ onRequest }: { onRequest: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, data } = await postJson("/api/session", { email, code });
    setBusy(false);
    if (!ok) { setError(data.error ?? "Something went wrong."); return; }
    router.push("/build");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <label htmlFor="signin-email" className="text-sm">Email the code was sent to</label>
      <input id="signin-email" type="email" className="input" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
      <label htmlFor="signin-code" className="text-sm">Access code</label>
      <input id="signin-code" className="input font-mono uppercase tracking-widest" placeholder="FF-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false}
        value={code} onChange={(e) => { setCode(e.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "signin-error" : undefined} />
      {error && <Message tone="error" id="signin-error">{error}</Message>}
      <button type="submit" className="btn btn-primary mt-2" disabled={busy || code.trim().length < 2}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Start building <ArrowRight className="size-4" aria-hidden />
      </button>
      <p className="text-text-3 text-sm">
        No code yet?{" "}
        <button type="button" className="text-accent underline underline-offset-4" onClick={onRequest}>Get one — it’s free</button>
      </p>
    </form>
  );
}

function RequestCode({ onHaveCode }: { onHaveCode: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [confirming, setConfirming] = useState(false);

  const valid = name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function review(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) { setError("Enter your name and a valid email address."); return; }
    setError("");
    setConfirming(true);
  }

  async function send() {
    setConfirming(false);
    setBusy(true);
    const { ok, data } = await postJson("/api/access-request", { name, email, reason, website });
    setBusy(false);
    if (!ok) { setError(data.error ?? "Something went wrong."); return; }
    setSent(email.trim());
  }

  if (sent) {
    return (
      <div>
        <Message tone="ok">
          Request sent to <strong>{SUPPORT}</strong>. Once it’s approved — usually within 24 hours — your code arrives at <strong>{sent}</strong>.
          We’ve also sent you a confirmation; if you can’t find either, check spam or promotions.
        </Message>
        <button type="button" className="btn mt-4" onClick={onHaveCode}>I’ve got my code <ArrowRight className="size-4" aria-hidden /></button>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={review} className="flex flex-col gap-3" noValidate>
        <label htmlFor="req-name" className="text-sm">Your name</label>
        <input id="req-name" className="input" autoComplete="name" maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />
        <label htmlFor="req-email" className="text-sm">Email — your code will be sent here</label>
        <input id="req-email" type="email" className="input" autoComplete="email" placeholder="you@example.com" maxLength={120} value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
        <label htmlFor="req-reason" className="text-sm">What’s it for? <span className="text-text-3">(optional)</span></label>
        <textarea id="req-reason" className="input min-h-20" maxLength={300} placeholder="e.g. job hunting as a frontend developer" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="req-website">Website</label>
          <input id="req-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        {error && <Message tone="error">{error}</Message>}
        <button type="submit" className="btn btn-primary mt-2" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />} Get code
        </button>
        <p className="text-text-3 text-sm leading-relaxed">
          Your request will be sent to <strong className="text-text-2">{SUPPORT}</strong>. We use your email only to send your code.
        </p>
      </form>
      {confirming && <ConfirmRequest email={email.trim()} onOk={send} onCancel={() => setConfirming(false)} />}
    </>
  );
}

function ConfirmRequest({ email, onOk, onCancel }: { email: string; onOk: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby="confirm-title" onCancel={(e) => { e.preventDefault(); onCancel(); }}
      className="card text-text m-auto w-[min(28rem,calc(100%-2rem))] p-6 backdrop:bg-black/60">
      <h2 id="confirm-title" className="text-lg font-semibold">Send your request?</h2>
      <p className="text-text-2 mt-3 text-[15px] leading-relaxed">
        Your request will be sent to <strong className="text-text">{SUPPORT}</strong>. Once approved, your access code will be emailed to <strong className="text-text break-all">{email}</strong>.
      </p>
      <p className="text-text-3 mt-3 text-sm">One code builds one portfolio and is valid for 7 days.</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={onOk} autoFocus>OK, send</button>
      </div>
    </dialog>
  );
}
