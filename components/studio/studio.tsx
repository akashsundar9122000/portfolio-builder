"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FileCode2, KeyRound, Loader2, Monitor, Smartphone, Tablet, Trash2, Undo2 } from "lucide-react";
import { canUndo, undo, update, useDraft, wipeEverything } from "@/lib/builder/store";
import { THEMES } from "@/lib/builder/themes";
import { downloadSingle, downloadZip, renderPreview } from "@/lib/builder/export";
import { useBuilderSession } from "@/components/wizard/use-session";
import { STEPS } from "@/components/wizard/wizard";
import { Assistant } from "./assistant";
import { UiThemeToggle } from "@/components/ui-theme";

const DEVICES = [
  { id: "desktop", label: "Desktop", width: 1280, icon: Monitor },
  { id: "tablet", label: "Tablet", width: 820, icon: Tablet },
  { id: "phone", label: "Phone", width: 390, icon: Smartphone },
] as const;

export function Studio() {
  const { ready, features, access } = useBuilderSession();
  const router = useRouter();
  const d = useDraft();
  const [html, setHtml] = useState("");
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [tab, setTab] = useState<"assistant" | "edit">("assistant");
  const [busy, setBusy] = useState<"" | "zip" | "html">("");
  const [note, setNote] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(1000);
  const scrollY = useRef(0);

  // re-render the preview (debounced) whenever the draft changes
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      try { scrollY.current = frameRef.current?.contentWindow?.scrollY ?? 0; } catch { /* cross-origin never happens here */ }
      void renderPreview(d).then(setHtml);
    }, 220);
    return () => clearTimeout(t);
  }, [d, ready]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  if (!ready) return <div className="grid min-h-svh place-items-center"><Loader2 className="text-accent size-6 animate-spin" aria-label="Loading" /></div>;

  const scale = Math.min(1, boxW / device.width);

  async function track(kind: "zip" | "html", phase: "check" | "done") {
    const res = await fetch("/api/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, phase }) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { router.replace("/?expired=1#access"); throw new Error("Your session has ended."); }
    if (!res.ok) throw new Error(data.error ?? "Couldn’t check your code.");
    return data as { downloads: ("html" | "zip")[] };
  }

  async function download(kind: "zip" | "html") {
    const issued = access.kind === "issued";
    setBusy(kind);
    setNote("");
    try {
      if (issued) await track(kind, "check");
      if (kind === "zip") await downloadZip(d);
      else {
        const size = await downloadSingle(d);
        if (size > 8 * 1024 * 1024) setNote(`That file is ${(size / 1048576).toFixed(1)} MB — the ZIP loads faster online.`);
      }
      if (issued) await track(kind, "done");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex h-svh flex-col">
      <header className="border-hair flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
        <Link href="/build" className="btn"><ArrowLeft className="size-4" aria-hidden /> Edit</Link>
        <div className="flex gap-1" role="radiogroup" aria-label="Preview size">
          {DEVICES.map((dv) => (
            <button key={dv.id} type="button" role="radio" aria-checked={device.id === dv.id} aria-label={dv.label} className={`btn size-11 px-0 ${device.id === dv.id ? "border-accent text-accent" : ""}`} onClick={() => setDevice(dv)}>
              <dv.icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="theme-select">Theme</label>
        <select id="theme-select" className="input h-11 w-auto min-w-40 py-0" value={d.meta.themeId} onChange={(e) => update("meta.themeId", e.target.value)}>
          {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="button" className="btn size-11 px-0" onClick={undo} disabled={!canUndo()} aria-label="Undo last assistant change"><Undo2 className="size-4" aria-hidden /></button>
        <div className="ml-auto flex flex-wrap gap-2">
          <UiThemeToggle />
          <button type="button" className="btn btn-primary" onClick={() => download("zip")} disabled={Boolean(busy)}>
            {busy === "zip" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} Download ZIP
          </button>
          <button type="button" className="btn" onClick={() => download("html")} disabled={Boolean(busy)}>
            {busy === "html" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileCode2 className="size-4" aria-hidden />} Single HTML
          </button>
        </div>
      </header>
      {note && <p role="status" className="text-text-2 border-hair border-b px-4 py-2 text-sm">{note}</p>}
      {access.kind === "issued" && (
        <p className="text-text-2 border-hair flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-sm">
          <KeyRound className="text-accent size-4" aria-hidden />
          <span>Code for <strong className="text-text">{access.email}</strong></span>
          <span className="text-text-3">
            Valid until {new Date(access.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} — build and download as often as you like until then.
          </span>
        </p>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_24rem]">
        <div ref={boxRef} className="bg-sunken relative min-h-[60svh] overflow-hidden lg:min-h-0">
          <div className="absolute left-1/2 top-0 origin-top" style={{ width: device.width, height: `${100 / scale}%`, transform: `translateX(-50%) scale(${scale})` }}>
            <iframe
              ref={frameRef}
              title="Your portfolio preview"
              srcDoc={html}
              sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
              className="h-full w-full border-0 bg-white"
              onLoad={() => { try { frameRef.current?.contentWindow?.scrollTo(0, scrollY.current); } catch { /* noop */ } }}
            />
          </div>
        </div>

        <aside className="border-hair flex min-h-[28rem] flex-col border-t lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="border-hair flex border-b" role="tablist">
            {(["assistant", "edit"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`label min-h-12 flex-1 ${tab === t ? "text-accent border-accent border-b-2" : ""}`} onClick={() => setTab(t)}>
                {t === "assistant" ? "AI assistant" : "Edit"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === "assistant" ? (
              <Assistant available={features.text} />
            ) : (
              <div tabIndex={0} aria-label="Edit steps" className="flex h-full flex-col gap-2 overflow-y-auto p-4">
                <p className="text-text-2 mb-2 text-sm">Jump to any step — your changes appear here instantly.</p>
                {STEPS.map((s, i) => (
                  <Link key={s.id} href={`/build?step=${s.id}`} className="card hover:border-accent flex min-h-12 items-center justify-between px-4">
                    <span>{s.title}</span><span className="label">{String(i + 1).padStart(2, "0")}</span>
                  </Link>
                ))}
                <button type="button" className="btn hover:text-danger mt-6" onClick={async () => { if (confirm("Delete your whole draft, photo and recording from this browser? This can’t be undone.")) { await wipeEverything(); router.push("/build"); } }}>
                  <Trash2 className="size-4" aria-hidden /> Delete my draft
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
