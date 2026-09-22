"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export function ReportForm({ slug, reasons }: { slug: string; reasons: string[] }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) { setError("Choose a reason."); return; }
    setBusy(true);
    setError("");
    const res = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, reason, details, email, website }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
    setSent(true);
  }

  if (sent) {
    return <p role="status" className="border-ok/40 bg-ok/10 mt-6 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm"><CheckCircle2 className="text-ok mt-0.5 size-4 shrink-0" aria-hidden /> Thanks — your report has been sent.</p>;
  }
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm">What’s wrong?</legend>
        {reasons.map((r) => (
          <label key={r} className="flex min-h-9 items-center gap-3 text-sm">
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => { setReason(r); setError(""); }} className="accent-[var(--accent)] size-4" />
            {r}
          </label>
        ))}
      </fieldset>
      <label htmlFor="report-details" className="mt-2 text-sm">Details <span className="text-text-3">(optional)</span></label>
      <textarea id="report-details" className="input min-h-24" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      <label htmlFor="report-email" className="text-sm">Your email <span className="text-text-3">(optional, if you’d like a reply)</span></label>
      <input id="report-email" type="email" className="input" autoComplete="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="report-website">Website</label>
        <input id="report-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      <button type="submit" className="btn btn-primary mt-2" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Send report</button>
    </form>
  );
}
