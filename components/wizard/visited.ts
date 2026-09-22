"use client";

import { useSyncExternalStore } from "react";

/**
 * Which wizard steps this browser has opened. Some steps have a valid
 * default (a theme is always selected; the Finish settings are optional),
 * so "done" for them means "you've looked at it", not "it has a value".
 */
const KEY = "ff:visited-steps";
const listeners = new Set<() => void>();
let cache: string | null = null;

function snapshot(): string {
  if (cache === null) {
    try {
      cache = localStorage.getItem(KEY) ?? "";
    } catch {
      cache = "";
    }
  }
  return cache;
}

export function markVisited(step: string) {
  const set = new Set(snapshot().split(",").filter(Boolean));
  if (set.has(step)) return;
  set.add(step);
  cache = [...set].join(",");
  try {
    localStorage.setItem(KEY, cache);
  } catch {
    // private mode: remembered for this page only
  }
  listeners.forEach((l) => l());
}

export function useVisited(): Set<string> {
  const raw = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    snapshot,
    () => "",
  );
  return new Set(raw.split(",").filter(Boolean));
}
