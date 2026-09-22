"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, EyeOff, Loader2 } from "lucide-react";

/** Take a published site down: reason (emailed to the owner) + admin password. */
export function TakeDownButton({ id, url, owner }: { id: string; url: string; owner: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn hover:text-danger hover:border-danger min-h-9 px-3 text-[11px]" onClick={() => setOpen(true)}>
        <EyeOff className="size-4" aria-hidden /> Take down
      </button>
      {open && <TakeDownDialog id={id} url={url} owner={owner} onClose={() => setOpen(false)} />}
    </>
  );
}

function TakeDownDialog({ id, url, owner, onClose }: { id: string; url: string; owner: string; onClose: () => void }) {
  const router = useRouter();
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
    const res = await fetch(`/api/admin/sites/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, reason }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Couldn’t take it down."); setBusy(false); return; }
    onClose();
    router.refresh();
  }

  return (
    <dialog ref={ref} aria-labelledby={`down-${id}`} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      className="card text-text m-auto w-[min(30rem,calc(100%-2rem))] p-6 text-left backdrop:bg-black/70">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-danger mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <h2 id={`down-${id}`} className="text-lg font-semibold">Take this site down?</h2>
            <p className="text-text-2 mt-1 break-all text-sm">{url}</p>
            <ul className="text-text-2 mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed">
              <li>It goes offline (within about a minute) and its files are deleted.</li>
              <li>{owner.includes("@") ? <><strong className="text-text">{owner}</strong> is emailed{reason.trim() ? " with your reason" : ""}.</> : "It was published with a master code, so no one is emailed."}</li>
              <li><strong className="text-text">They can’t republish it.</strong> The address stays blocked.</li>
            </ul>
          </div>
        </div>
        <label className="text-sm" htmlFor={`down-reason-${id}`}>Reason <span className="text-text-3">(optional, included in the email)</span></label>
        <textarea id={`down-reason-${id}`} className="input -mt-2 min-h-20" maxLength={600} value={reason} onChange={(e) => setReason(e.target.value)} />
        <label className="text-sm" htmlFor={`down-pw-${id}`}>Admin password</label>
        <input id={`down-pw-${id}`} type="password" autoComplete="current-password" className="input -mt-2" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} autoFocus />
        {error && <p role="alert" className="border-danger/40 bg-danger/10 text-danger rounded-xl border px-4 py-3 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn border-danger text-danger hover:bg-danger/10" disabled={busy || !password}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <EyeOff className="size-4" aria-hidden />} Take it down
          </button>
        </div>
      </form>
    </dialog>
  );
}
