"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { UI_THEME_KEY as KEY } from "./ui-theme-boot";

/**
 * Light / dark for the builder's own interface (the portfolio being built
 * has its own theme, chosen in the wizard). Stored per browser; applied
 * before first paint by the inline script in app/layout.tsx.
 */

type UiTheme = "dark" | "light";

const listeners = new Set<() => void>();
function read(): UiTheme {
  return document.documentElement.dataset.ui === "light" ? "light" : "dark";
}

function apply(t: UiTheme) {
  document.documentElement.dataset.ui = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // private mode: the choice lasts for this page only
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#f6f2ea" : "#0b0b0d");
  listeners.forEach((l) => l());
}

export function UiThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    read,
    () => "dark" as UiTheme,
  );
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => apply(next)}
      className={`btn size-11 shrink-0 px-0 ${className}`}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
