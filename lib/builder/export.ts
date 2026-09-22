"use client";

import { zipSync, strToU8 } from "fflate";
import type { Draft } from "./schema";
import { themeById } from "./themes";
import { blobUrl, getBlob } from "./store";
import { renderSite, type RenderAssets } from "@/lib/render";
import { blobToDataUrl } from "@/lib/media/image";

/**
 * Resolves every file the page needs, for one of three targets:
 *   preview  → blob: URLs (instant, nothing copied)
 *   zip      → relative paths, with the bytes collected for the archive
 *   inline   → data: URIs, so the whole site is one .html file
 */

type Target = "preview" | "zip" | "inline";

const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "application/pdf": "pdf",
};

export function portraitRef(d: Draft): { ref: string; kind: "cutout" | "framed" } | null {
  if (d.portrait.cutout) return { ref: d.portrait.cutout, kind: "cutout" };
  if (d.portrait.chosen) return { ref: d.portrait.chosen, kind: "framed" };
  if (d.portrait.photo) return { ref: d.portrait.photo, kind: "framed" };
  return null;
}

export async function collect(d: Draft, target: Target): Promise<{ assets: RenderAssets; files: Record<string, Uint8Array> }> {
  const files: Record<string, Uint8Array> = {};
  const resolve = async (ref: string | null | undefined, name: string): Promise<string | undefined> => {
    if (!ref) return undefined;
    if (target === "preview") return blobUrl(ref);
    const blob = await getBlob(ref);
    if (!blob) return undefined;
    if (target === "inline") return blobToDataUrl(blob);
    const path = `assets/${name}.${EXT[blob.type] ?? "bin"}`;
    files[path] = new Uint8Array(await blob.arrayBuffer());
    return path;
  };

  const p = portraitRef(d);
  const portraitSrc = p ? await resolve(p.ref, "portrait") : undefined;
  const covers: Record<string, string> = {};
  for (const [i, pr] of d.projects.entries()) {
    const src = await resolve(pr.cover, `project-${i + 1}`);
    if (src && pr.cover) covers[pr.cover] = src;
  }
  return {
    assets: {
      portrait: p && portraitSrc ? { src: portraitSrc, kind: p.kind } : undefined,
      voice: d.intro.mode === "voice" ? await resolve(d.intro.voice, "intro") : undefined,
      resume: await resolve(d.resume.file, "resume"),
      covers,
    },
    files,
  };
}

export async function renderPreview(d: Draft): Promise<string> {
  const { assets } = await collect(d, "preview");
  return renderSite(d, themeById(d.meta.themeId), assets);
}

function slug(d: Draft): string {
  return (d.identity.name || "portfolio").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "portfolio";
}

function save(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function downloadZip(d: Draft) {
  const { assets, files } = await collect(d, "zip");
  const html = renderSite(d, themeById(d.meta.themeId), assets);
  const readme = `Your portfolio\n\nOpen index.html in a browser to view it.\n\nTo publish it free: drag this folder onto https://app.netlify.com/drop,\nor push it to a GitHub repository and enable GitHub Pages.\n`;
  const zip = zipSync({ "index.html": strToU8(html), "README.txt": strToU8(readme), ...files }, { level: 6 });
  save(new Blob([zip as BlobPart], { type: "application/zip" }), `${slug(d)}-portfolio.zip`);
}

export async function downloadSingle(d: Draft): Promise<number> {
  const { assets } = await collect(d, "inline");
  const html = renderSite(d, themeById(d.meta.themeId), assets);
  const blob = new Blob([html], { type: "text/html" });
  save(blob, `${slug(d)}-portfolio.html`);
  return blob.size;
}
