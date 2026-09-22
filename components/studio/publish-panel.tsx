"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Loader2, X } from "lucide-react";
import type { Draft } from "@/lib/builder/schema";
import { publishSite } from "@/lib/builder/publish";

interface LiveSite { slug: string; url: string; status: "live" | "unpublished" | "removed"; updatedAt: number }

const toSlug = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");

/**
 * Publish to folioforge…/p/<name>. One site per person: publishing again
 * updates it (and can rename it — old links forward). Anyone can see it;
 * it stays online until they or we take it down.
 */
export function PublishPanel({ draft, expiresAt, onClose }: { draft: Draft; expiresAt?: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [site, setSite] = useState<LiveSite | null | undefined>(undefined);
  const [slug, setSlug] = useState("");
  const [result, setResult] = useState<{ ok: boolean; reason?: string; slug: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ url: string; mailed: boolean; renamed: boolean; first: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
    fetch("/api/publish").then((r) => r.json()).then((d) => {
      const s: LiveSite | null = d.site ?? null;
      setSite(s);
      setSlug(s?.slug || toSlug(draft.identity.name) || "");
    }).catch(() => setSite(null));
  }, [draft.identity.name]);

  // live availability, debounced
  useEffect(() => {
    if (!slug) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/publish/slug?name=${encodeURIComponent(slug)}`).then((x) => x.json()).catch(() => null);
      if (r) setResult(r);
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  // only trust an answer about what's in the box right now
  const check = slug && result && result.slug === toSlug(slug) ? result : null;
  const live = site?.status === "live";
  const url = `${location.origin}/p/${check?.slug || toSlug(slug)}`;

  async function go() {
    setBusy(true);
    setError("");
    setDone(null);
    try {
      const r = await publishSite(draft, check?.slug || slug, setStep);
      setDone(r);
      setSite({ slug: r.slug, url: r.url, status: "live", updatedAt: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publishing failed.");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  async function takeDown() {
    if (!confirm("Take your portfolio offline? Its files are deleted from our storage. You can publish again while your code is valid.")) return;
    setBusy(true);
    const res = await fetch("/api/publish/unpublish", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Couldn’t unpublish."); return; }
    setDone(null);
    setSite((s) => (s ? { ...s, status: "unpublished" } : s));
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }

  const renaming = live && site && check?.slug && check.slug !== site.slug;
  const canPublish = !busy && Boolean(check?.ok) && site !== undefined && site?.status !== "removed";

  return (
    <dialog ref={ref} aria-labelledby="publish-title" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      className="card text-text m-auto w-[min(34rem,calc(100%-2rem))] p-6 text-left backdrop:bg-black/70">
      <div className="flex items-start justify-between gap-3">
        <h2 id="publish-title" className="flex items-center gap-2 text-lg font-semibold"><Globe className="text-accent size-5" aria-hidden /> {live ? "Your live portfolio" : "Publish your portfolio"}</h2>
        <button type="button" className="btn size-10 shrink-0 px-0" onClick={onClose} disabled={busy} aria-label="Close"><X className="size-4" aria-hidden /></button>
      </div>

      {site === undefined ? (
        <p className="text-text-3 mt-6 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading…</p>
      ) : site?.status === "removed" ? (
        <p className="border-danger/40 bg-danger/10 text-danger mt-5 rounded-xl border px-4 py-3 text-sm">This site was taken down by FolioForge and can’t be republished. Reply to our email if you think that’s a mistake.</p>
      ) : (
        <>
          {live && site && (
            <div className="bg-sunken border-hair mt-5 rounded-xl border p-4">
              <p className="label">Online now</p>
              <a href={site.url} target="_blank" rel="noopener" className="text-accent mt-1 block break-all font-mono text-sm underline underline-offset-4">{site.url}</a>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn min-h-9 px-3 text-[11px]" onClick={() => copy(site.url)}>{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy link"}</button>
                <a className="btn min-h-9 px-3 text-[11px]" href={site.url} target="_blank" rel="noopener"><ExternalLink className="size-4" aria-hidden /> Open</a>
                <button type="button" className="btn hover:text-danger hover:border-danger min-h-9 px-3 text-[11px]" onClick={takeDown} disabled={busy}>Unpublish</button>
              </div>
            </div>
          )}

          <label htmlFor="site-name" className="mt-5 block text-sm">{live ? "Site name" : "Choose your site name"}</label>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-text-3 shrink-0 font-mono text-sm">/p/</span>
            <input id="site-name" className="input font-mono" value={slug} maxLength={40} autoComplete="off" spellCheck={false}
              onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); setError(""); }} aria-describedby="site-name-status" />
          </div>
          <p id="site-name-status" role="status" className={`mt-2 min-h-5 text-sm ${check && !check.ok ? "text-danger" : "text-text-3"}`}>
            {!slug ? "Letters, numbers and hyphens." : !check ? " " : check.ok ? <span className="break-all"><Check className="text-ok mr-1 inline size-4" aria-hidden />{url}{renaming ? " — your old address will forward here" : ""}</span> : check.reason}
          </p>

          {error && <p role="alert" className="border-danger/40 bg-danger/10 text-danger mt-3 rounded-xl border px-4 py-3 text-sm">{error}</p>}
          {done && (
            <p role="status" className="border-ok/40 bg-ok/10 mt-3 rounded-xl border px-4 py-3 text-sm">
              {done.first ? "You’re live! " : done.renamed ? "Moved to your new address. " : "Your site is updated. "}
              {done.mailed ? "We’ve emailed you the link, plus a private link to take it down any time." : ""}
            </p>
          )}

          <button type="button" className="btn btn-primary mt-4 w-full" onClick={go} disabled={!canPublish}>
            {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> {step || "Working…"}</> : live ? (renaming ? "Update & move to new name" : "Update live site") : "Publish"}
          </button>

          <p className="text-text-3 mt-4 text-xs leading-relaxed">
            Anyone with the link can see your published site. Unlike your draft, it’s stored on FolioForge so it can stay online — until you unpublish it
            (here, or with the link we email you). You can update it or change its name while your code is valid
            {expiresAt ? ` (until ${new Date(expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })})` : ""}; after that it stays as it is.
          </p>
        </>
      )}
    </dialog>
  );
}
