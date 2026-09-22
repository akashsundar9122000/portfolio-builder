"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Info, Loader2 } from "lucide-react";

export function InviteForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  // sent back here from /build or /studio without a session
  const expired = useSearchParams().has("expired");
  const [error, setError] = useState("");
  // "session ended" is information, not a failure: it gets a calm tone
  const notice = !error && expired ? "Your session has ended. Enter your invite code again to continue — your draft is safe in this browser." : "";
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push("/build");
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row" noValidate>
        <label htmlFor="invite" className="sr-only">Invite code</label>
        <input
          id="invite"
          className="input font-mono uppercase tracking-widest"
          placeholder="Invite code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(""); }}
          aria-invalid={Boolean(error)}
          aria-describedby={error || notice ? "invite-message" : undefined}
        />
        <button type="submit" className="btn btn-primary shrink-0" disabled={busy || code.trim().length < 2}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Start building <ArrowRight className="size-4" aria-hidden />
        </button>
      </form>
      {(error || notice) && (
        <p
          id="invite-message"
          role={error ? "alert" : "status"}
          className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
            error ? "border-danger/40 bg-danger/10 text-danger" : "border-accent/35 bg-accent/10 text-text-2"
          }`}
        >
          {error ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>{error || notice}</span>
        </p>
      )}
    </div>
  );
}
