"use client";

import type { Draft } from "./schema";
import { getBlob } from "./store";
import { portraitRef } from "./export";
import { downscale } from "@/lib/media/image";

/**
 * Publishing from the browser: every image, recording and PDF is uploaded
 * on its own (photos shrunk to web size first), then the draft itself. The
 * server renders the page from the draft — it never takes HTML from here.
 */

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "application/pdf": "pdf",
};

const MAX = 4 * 1024 * 1024;

/** Web-sized: longest side 1600px. Cut-outs keep their transparency (WebP, else PNG). */
async function forWeb(blob: Blob, transparent: boolean): Promise<Blob> {
  if (!blob.type.startsWith("image/")) return blob;
  if (!transparent) return downscale(blob, 1600, "image/jpeg", 0.84);
  const webp = await downscale(blob, 1600, "image/webp", 0.86);
  return webp.type === "image/webp" ? webp : downscale(blob, 1600, "image/png");
}

async function upload(blob: Blob): Promise<string> {
  const ext = EXT[blob.type];
  if (!ext) throw new Error(`A ${blob.type || "file"} can’t be published — try re-adding it.`);
  if (blob.size > MAX) throw new Error(blob.type === "application/pdf" ? "Your resume PDF is over 4 MB — upload a smaller one to publish." : "One of your files is over 4 MB even after shrinking.");
  const res = await fetch(`/api/publish/asset?ext=${ext}`, { method: "POST", body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Upload failed.");
  return data.file as string;
}

export interface PublishResult { url: string; slug: string; first: boolean; renamed: boolean; mailed: boolean }

export async function publishSite(d: Draft, slug: string, onStep: (text: string) => void): Promise<PublishResult> {
  const jobs: { ref: string; transparent: boolean }[] = [];
  const p = portraitRef(d);
  if (p) jobs.push({ ref: p.ref, transparent: p.kind === "cutout" });
  if (d.intro.mode === "voice" && d.intro.voice) jobs.push({ ref: d.intro.voice, transparent: false });
  if (d.resume.file) jobs.push({ ref: d.resume.file, transparent: false });
  for (const pr of d.projects) if (pr.cover) jobs.push({ ref: pr.cover, transparent: false });

  const files = new Map<string, string>();
  for (const [i, job] of jobs.entries()) {
    if (files.has(job.ref)) continue;
    const blob = await getBlob(job.ref);
    if (!blob) continue;
    onStep(`Uploading file ${i + 1} of ${jobs.length}…`);
    files.set(job.ref, await upload(await forWeb(blob, job.transparent)));
  }

  onStep("Publishing your site…");
  const covers: Record<string, string> = {};
  for (const pr of d.projects) if (pr.cover && files.has(pr.cover)) covers[pr.cover] = files.get(pr.cover)!;
  const assets = {
    portrait: p && files.has(p.ref) ? { file: files.get(p.ref)!, kind: p.kind } : undefined,
    voice: d.intro.mode === "voice" && d.intro.voice ? files.get(d.intro.voice) : undefined,
    resume: d.resume.file ? files.get(d.resume.file) : undefined,
    covers,
  };
  const res = await fetch("/api/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, draft: d, assets }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Publishing failed.");
  return data as PublishResult;
}
