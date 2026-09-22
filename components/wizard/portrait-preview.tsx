"use client";

import { useEffect, useState } from "react";
import { blobUrl, useDraft } from "@/lib/builder/store";
import { themeById } from "@/lib/builder/themes";

/** The portrait as it will appear: on the theme’s stage, under its spotlight. */
export function PortraitPreview({ refId, kind, className = "" }: { refId: string | null; kind: "cutout" | "framed"; className?: string }) {
  const d = useDraft();
  const t = themeById(d.meta.themeId).colors;
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    void blobUrl(refId).then((u) => live && setSrc(u));
    return () => { live = false; };
  }, [refId]);
  return (
    <div className={`relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-hair ${className}`} style={{ background: `radial-gradient(70% 60% at 50% 12%, ${t.stageSpot}, transparent 70%), ${t.stage}` }}>
      <div className="absolute inset-x-[12%] bottom-0 top-[18%] rounded-full blur-3xl" style={{ background: `radial-gradient(closest-side, ${t.glow}, transparent)` }} />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Your portrait preview" className={`relative h-full w-full ${kind === "cutout" ? "object-contain object-bottom" : "object-cover object-top"}`} style={kind === "framed" ? { WebkitMaskImage: "radial-gradient(120% 95% at 50% 40%, #000 62%, transparent 100%)", maskImage: "radial-gradient(120% 95% at 50% 40%, #000 62%, transparent 100%)" } : undefined} />
      ) : (
        <div className="text-text-3 relative grid h-full place-items-center text-sm">No photo yet</div>
      )}
    </div>
  );
}
