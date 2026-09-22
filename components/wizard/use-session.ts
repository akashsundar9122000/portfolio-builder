"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadDraft } from "@/lib/builder/store";
import { setBuilderFeatures } from "./features";

export interface Features { text: boolean; image: boolean; generate: boolean }

/** Loads the draft and checks the invite session; sends people without one back to the start. */
export function useBuilderSession(): { ready: boolean; features: Features } {
  const router = useRouter();
  const [state, setState] = useState<{ ready: boolean; features: Features }>({ ready: false, features: { text: false, image: false, generate: false } });
  useEffect(() => {
    let live = true;
    void (async () => {
      const [res] = await Promise.all([fetch("/api/session").then((r) => r.json()).catch(() => ({ active: false })), loadDraft()]);
      if (!live) return;
      if (!res.active) { router.replace("/?expired=1"); return; }
      setBuilderFeatures(res.features);
      setState({ ready: true, features: res.features });
    })();
    return () => { live = false; };
  }, [router]);
  return state;
}
