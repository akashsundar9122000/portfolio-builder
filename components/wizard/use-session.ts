"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { claimDraft, loadDraft } from "@/lib/builder/store";
import { setBuilderFeatures } from "./features";

export interface Features { text: boolean; image: boolean; generate: boolean }

/** How the person signed in: a permanent master code, or an emailed code valid for 7 days. */
export type Access = { kind: "master" } | { kind: "issued"; email: string; expiresAt: number; downloads: ("html" | "zip")[] };

interface State { ready: boolean; features: Features; access: Access }

/** Loads the draft and checks the invite session; sends people without one back to the start, saying why. */
export function useBuilderSession(): State {
  const router = useRouter();
  const [state, setState] = useState<State>({ ready: false, features: { text: false, image: false, generate: false }, access: { kind: "master" } });
  useEffect(() => {
    let live = true;
    void (async () => {
      const [res] = await Promise.all([fetch("/api/session").then((r) => r.json()).catch(() => ({ active: false })), loadDraft()]);
      if (!live) return;
      if (!res.active) { router.replace(`/?expired=${res.ended ?? "1"}#access`); return; }
      const access: Access = res.access ?? { kind: "master" };
      await claimDraft(access.kind === "issued" ? access.email : "master", access.kind === "issued" ? access.expiresAt : undefined);
      if (!live) return;
      setBuilderFeatures(res.features);
      setState({ ready: true, features: res.features, access });
    })();
    return () => { live = false; };
  }, [router]);
  return state;
}
