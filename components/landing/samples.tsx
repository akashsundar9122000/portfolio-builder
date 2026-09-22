"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ExternalLink, Eye, Monitor, Smartphone, Tablet, X } from "lucide-react";

/**
 * Three example portfolios. Cards show a live, scaled-down thumbnail of the
 * real rendered site (/samples/<id>); clicking opens it full-size in a
 * dialog with desktop / tablet / phone widths.
 */

export interface SampleCard {
  id: string;
  name: string;
  role: string;
  themeName: string;
  blurb: string;
}

const DEVICES = [
  { id: "desktop", label: "Desktop", width: 1280, icon: Monitor },
  { id: "tablet", label: "Tablet", width: 820, icon: Tablet },
  { id: "phone", label: "Phone", width: 390, icon: Smartphone },
] as const;

const THUMB_W = 1280;

export function Samples({ samples }: { samples: SampleCard[] }) {
  const [open, setOpen] = useState<SampleCard | null>(null);
  return (
    <>
      <ul className="grid gap-4 md:grid-cols-3">
        {samples.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpen(s)} className="card hover:border-accent group flex w-full flex-col overflow-hidden text-left transition-colors">
              <Thumb id={s.id} />
              <span className="flex flex-col gap-2 p-5">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-lg font-semibold">{s.name}</span>
                  <span className="chip min-h-7 shrink-0">{s.themeName}</span>
                </span>
                <span className="text-accent text-sm">{s.role}</span>
                <span className="text-text-2 text-[15px] leading-relaxed">{s.blurb}</span>
                <span className="label group-hover:text-accent mt-2 inline-flex items-center gap-2">
                  <Eye className="size-4" aria-hidden /> View full portfolio
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && <SampleDialog sample={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Thumb({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = w / THUMB_W;
  return (
    <span ref={ref} className="bg-sunken border-hair relative block aspect-[16/10] overflow-hidden border-b" aria-hidden>
      <iframe
        src={`/samples/${id}`}
        title=""
        tabIndex={-1}
        loading="lazy"
        scrolling="no"
        sandbox="allow-scripts"
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: THUMB_W, height: THUMB_W * 0.625, transform: `scale(${scale})` }}
      />
    </span>
  );
}

function SampleDialog({ sample, onClose }: { sample: SampleCard; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [boxW, setBoxW] = useState(1000);

  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
    document.documentElement.style.overflow = "hidden";
    // no close() here: it would fire onClose; unmounting removes the dialog anyway
    return () => { document.documentElement.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = Math.min(1, boxW / device.width);

  function createYours() {
    onClose();
    requestAnimationFrame(() => document.getElementById("access")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <dialog
      ref={ref}
      aria-label={`${sample.name} — sample portfolio`}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      className="bg-bg text-text m-0 h-dvh max-h-none w-screen max-w-none p-0 backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col">
        <header className="border-hair flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <div className="mr-auto min-w-0">
            <p className="truncate font-semibold">{sample.name}</p>
            <p className="text-text-3 truncate text-sm">{sample.role} · {sample.themeName} theme</p>
          </div>
          <div className="flex gap-1" role="radiogroup" aria-label="Preview size">
            {DEVICES.map((dv) => (
              <button key={dv.id} type="button" role="radio" aria-checked={device.id === dv.id} aria-label={dv.label} className={`btn size-11 px-0 ${device.id === dv.id ? "border-accent text-accent" : ""}`} onClick={() => setDevice(dv)}>
                <dv.icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
          <a className="btn size-11 px-0" href={`/samples/${sample.id}`} target="_blank" rel="noopener" aria-label="Open in a new tab">
            <ExternalLink className="size-4" aria-hidden />
          </a>
          <button type="button" className="btn btn-primary" onClick={createYours}>
            Create yours <ArrowRight className="size-4" aria-hidden />
          </button>
          <button type="button" className="btn size-11 px-0" onClick={onClose} aria-label="Close preview" autoFocus>
            <X className="size-4" aria-hidden />
          </button>
        </header>
        <div ref={boxRef} className="bg-sunken relative min-h-0 flex-1 overflow-hidden">
          <div className="absolute left-1/2 top-0 origin-top" style={{ width: device.width, height: `${100 / scale}%`, transform: `translateX(-50%) scale(${scale})` }}>
            <iframe src={`/samples/${sample.id}`} title={`${sample.name}’s sample portfolio`} sandbox="allow-scripts allow-popups" className="h-full w-full border-0 bg-white" />
          </div>
        </div>
      </div>
    </dialog>
  );
}
