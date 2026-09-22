"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

export function InviteForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  // sent back here from /build or /studio without a session
  const expired = useSearchParams().has("expired");
  const [error, setError] = useState(
    expired ? "Your session has ended — enter your invite code again to continue. Your draft is safe in this browser." : "",
  );
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
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row" noValidate>
      <label htmlFor="invite" className="sr-only">Invite code</label>
      <input
        id="invite"
        className="input font-mono uppercase tracking-widest"
        placeholder="Invite code"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "invite-error" : undefined}
      />
      <button type="submit" className="btn btn-primary shrink-0" disabled={busy || code.trim().length < 2}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Start building <ArrowRight className="size-4" aria-hidden />
      </button>
      {error && (
        <p id="invite-error" role="alert" className="text-danger text-sm sm:absolute sm:mt-14">
          {error}
        </p>
      )}
    </form>
  );
}
