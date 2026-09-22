"use client";

import { useEffect, useState } from "react";
import { Camera, Check, Loader2, Shirt, Sparkles, Upload } from "lucide-react";
import { Toggle } from "@/components/form/fields";
import { PortraitPreview } from "./portrait-preview";
import { getBlob, mutate, putBlob, useDraft } from "@/lib/builder/store";
import { OUTFITS } from "@/lib/builder/outfits";
import { THEMES } from "@/lib/builder/themes";
import { blobToDataUrl, cutout, dataUrlToBlob, downscale } from "@/lib/media/image";
import { runGeneration, statusLabel, type UiStatus } from "@/lib/imagegen/client";

async function makeCutout(ref: string): Promise<string | null> {
  const blob = await getBlob(ref);
  if (!blob) return null;
  return putBlob(await cutout(blob));
}

export function StepPhoto() {
  const d = useDraft();
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr("");
    if (!f.type.startsWith("image/")) return setErr("Please choose an image.");
    setStatus("Preparing your photo…");
    try {
      const ref = await putBlob(await downscale(f, 1600, "image/jpeg", 0.9));
      mutate((x) => { x.portrait.photo = ref; x.portrait.variants = []; x.portrait.chosen = null; x.portrait.cutout = null; x.portrait.consent = false; });
      setStatus("Cutting you out of the background… (a small model downloads the first time)");
      const cut = await makeCutout(ref);
      mutate((x) => { x.portrait.cutout = cut; });
      setStatus("");
    } catch (e) {
      setStatus("");
      setErr(e instanceof Error ? `${e.message} Your photo will be shown framed instead.` : "Couldn’t process that photo.");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-6">
        <p className="text-text-2 leading-relaxed">
          A clear, well-lit photo from the chest up works best: facing the camera, plain background, no sunglasses. It stays in your browser —
          it’s only sent out if you ask for an AI outfit in the next step.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="btn btn-primary cursor-pointer">
            <Upload className="size-4" aria-hidden /> {d.portrait.photo ? "Choose another photo" : "Upload a photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <label className="btn cursor-pointer sm:hidden">
            <Camera className="size-4" aria-hidden /> Take a selfie
            <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        {status && <p role="status" className="text-text-2 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden />{status}</p>}
        {err && <p role="alert" className="text-danger text-sm">{err}</p>}
        {d.portrait.photo && (
          <div className="card p-5">
            <Toggle
              checked={d.portrait.consent}
              onChange={(v) => mutate((x) => { x.portrait.consent = v; })}
              label="This is a photo of me, and I agree to it being used and edited for my portfolio."
              description="Required. Please don’t upload anyone else’s photo."
            />
          </div>
        )}
      </div>
      <PortraitPreview refId={d.portrait.cutout ?? d.portrait.photo} kind={d.portrait.cutout ? "cutout" : "framed"} />
    </div>
  );
}

export function StepOutfit({ imageAvailable }: { imageAvailable: boolean }) {
  const d = useDraft();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [phase, setPhase] = useState<{ s: UiStatus; ms: number }>({ s: "PENDING", ms: 0 });
  const outfit = OUTFITS.find((o) => o.id === d.portrait.outfitId) ?? OUTFITS[0];
  const canGenerate = imageAvailable && Boolean(d.portrait.photo) && d.portrait.consent && outfit.id !== "keep";

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      const photo = await getBlob(d.portrait.photo);
      if (!photo) throw new Error("Upload a photo first.");
      const dataUrl = await blobToDataUrl(await downscale(photo, 1024, "image/jpeg", 0.88));
      setPhase({ s: "PENDING", ms: 0 });
      const imageUrl = await runGeneration(
        () => fetch("/api/portrait", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo: dataUrl, outfitId: outfit.id, color: d.portrait.outfitColor, consent: true }) }),
        { onStatus: (s, ms) => setPhase({ s, ms }) },
      );
      const ref = await putBlob(await downscale(await dataUrlToBlob(imageUrl), 1400, "image/png"));
      mutate((x) => { x.portrait.variants = [...x.portrait.variants, ref].slice(-6); });
      await choose(ref);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t generate the outfit.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(ref: string | null) {
    mutate((x) => { x.portrait.chosen = ref; x.portrait.cutout = null; });
    const cut = await makeCutout(ref ?? d.portrait.photo!).catch(() => null);
    mutate((x) => { x.portrait.cutout = cut; });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-6">
        {!imageAvailable && (
          <p className="card text-text-2 p-4 text-sm leading-relaxed">
            <strong className="text-text">AI outfits aren’t switched on for this builder yet.</strong> Your own photo will be used, cut out and lit on your theme’s
            stage — pick <em>Keep my outfit</em>. The looks below show what’s coming.
          </p>
        )}
        {!d.portrait.photo && <p className="text-text-3 text-sm">Add a photo in the previous step first.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Outfit">
          {OUTFITS.map((o) => {
            const on = o.id === d.portrait.outfitId;
            const disabled = !imageAvailable && o.id !== "keep";
            return (
              <button key={o.id} type="button" role="radio" aria-checked={on} disabled={disabled}
                className={`card flex min-h-24 flex-col items-start gap-1 p-4 text-left transition-colors ${on ? "border-accent" : "hover:border-hair-strong"} disabled:opacity-40`}
                onClick={() => { mutate((x) => { x.portrait.outfitId = o.id; x.portrait.outfitColor = o.colors[0]; }); if (o.id === "keep") void choose(null); }}>
                <span className="flex w-full items-center justify-between"><Shirt className="text-accent size-4" aria-hidden />{on && <Check className="text-accent size-4" aria-hidden />}</span>
                <span className="mt-1 font-medium">{o.label}</span>
                <span className="text-text-3 text-xs">{o.hint}</span>
              </button>
            );
          })}
        </div>
        {outfit.id !== "keep" && imageAvailable && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
              {outfit.colors.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={d.portrait.outfitColor === c} className={`chip capitalize ${d.portrait.outfitColor === c ? "border-accent text-accent" : ""}`} onClick={() => mutate((x) => { x.portrait.outfitColor = c; })}>{c}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" disabled={!canGenerate || busy} onClick={generate}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {d.portrait.variants.length ? "Try another" : "Dress me"}
              </button>
              {!d.portrait.consent && d.portrait.photo && <span className="text-text-3 text-sm">Tick the consent box in the photo step first.</span>}
              {busy && <span role="status" className="text-text-2 text-sm">{statusLabel(phase.s, phase.ms) || "Tailoring…"}</span>}
            </div>
            {err && <p role="alert" className="text-danger text-sm">{err}</p>}
          </div>
        )}
        {d.portrait.variants.length > 0 && (
          <div>
            <p className="label mb-3">Your looks — tap one to use it</p>
            <div className="grid grid-cols-3 gap-3">
              {d.portrait.variants.map((v) => (
                <button key={v} type="button" onClick={() => choose(v)} className={`overflow-hidden rounded-xl border-2 ${d.portrait.chosen === v ? "border-accent" : "border-transparent"}`} aria-label="Use this look" aria-pressed={d.portrait.chosen === v}>
                  <PortraitPreview refId={v} kind="framed" className="rounded-none border-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <PortraitPreview refId={d.portrait.cutout ?? d.portrait.chosen ?? d.portrait.photo} kind={d.portrait.cutout ? "cutout" : "framed"} />
    </div>
  );
}

export function StepTheme() {
  const d = useDraft();
  // load every theme’s typefaces so each card previews in its own fonts
  useEffect(() => {
    for (const t of THEMES) {
      if (document.querySelector(`link[data-theme-font="${t.id}"]`)) continue;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = t.fonts.href;
      l.dataset.themeFont = t.id;
      document.head.appendChild(l);
    }
  }, []);
  const [l1, l2, l3] = d.identity.headline;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => {
        const on = t.id === d.meta.themeId;
        const c = t.colors;
        return (
          <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => mutate((x) => { x.meta.themeId = t.id; })}
            className={`overflow-hidden rounded-2xl border-2 text-left transition-transform hover:-translate-y-0.5 ${on ? "border-accent" : "border-hair"}`}>
            <div className="relative h-44 p-5" style={{ background: `radial-gradient(60% 80% at 85% 0%, ${c.stageSpot}, transparent 70%), ${c.stage}`, color: c.text }}>
              <p style={{ fontFamily: `"${t.fonts.mono}", monospace`, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: c.accent }}>{d.identity.name || "Your name"}</p>
              <p style={{ fontFamily: `"${t.fonts.display}", sans-serif`, fontWeight: t.fonts.displayWeight, textTransform: t.fonts.displayUpper ? "uppercase" : "none", fontSize: 26, lineHeight: 0.95, marginTop: 10, letterSpacing: "-0.02em" }}>
                <span className="block">{l1}</span>
                <span className="block" style={{ background: `linear-gradient(100deg, ${c.gradientFrom}, ${c.gradientTo})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{l2} {l3}</span>
              </p>
              <div className="absolute bottom-4 left-5 flex gap-1.5">
                {[c.bg, c.surface, c.accent, c.gradientTo].map((sw) => <span key={sw} className="size-4 rounded-full border border-white/15" style={{ background: sw }} />)}
              </div>
              {on && <Check className="absolute right-4 top-4 size-5" style={{ color: c.accent }} aria-hidden />}
            </div>
            <div className="bg-surface p-4">
              <p className="font-medium">{t.name}{t.mode === "light" && <span className="label ml-2">light</span>}</p>
              <p className="text-text-3 mt-1 text-sm">{t.blurb}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
