"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function UnpublishOwn({ id, sig }: { id: string; sig: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    if (!confirm("Take your portfolio offline? Its files are deleted from our storage; you can publish again later with a valid code.")) return;
    setBusy(true);
    const res = await fetch(`/api/manage/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sig }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
    router.refresh();
  }
  return (
    <div className="mt-6">
      <button type="button" className="btn border-danger text-danger hover:bg-danger/10" onClick={go} disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Unpublish my portfolio
      </button>
      {error && <p role="alert" className="text-danger mt-3 text-sm">{error}</p>}
    </div>
  );
}
