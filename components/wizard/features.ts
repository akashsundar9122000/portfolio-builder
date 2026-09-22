"use client";

import { useSyncExternalStore } from "react";

/**
 * What this deployment can do (AI text, outfit editing, image generation),
 * as reported by /api/session. Loaded once and shared, so any step can
 * hide a button whose backend isn't configured.
 */
export interface BuilderFeatures { text: boolean; image: boolean; generate: boolean }

let features: BuilderFeatures = { text: false, image: false, generate: false };
const listeners = new Set<() => void>();

export function setBuilderFeatures(f: Partial<BuilderFeatures>) {
  features = { ...features, ...f };
  listeners.forEach((l) => l());
}

export function useBuilderFeatures(): BuilderFeatures {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => features,
    () => features,
  );
}
