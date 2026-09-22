"use client";

import { createStore, del, get, keys, set } from "idb-keyval";
import { useSyncExternalStore } from "react";
import { Draft, type Draft as DraftT } from "./schema";
import { emptyDraft, uid } from "./defaults";
import { applyOps, setAt, type Op } from "./patch";

/**
 * The friend's draft lives in THEIR browser, nowhere else.
 *
 * - The JSON draft autosaves to IndexedDB (debounced) on every change.
 * - Files (photo, portrait, voice, covers, resume) are separate IndexedDB
 *   entries keyed by BlobRef; the draft only holds the refs.
 * - Everything expires 7 days after the draft was started, and "Delete my
 *   draft" wipes it immediately.
 * - Orphaned blobs (e.g. an old photo that was replaced) are collected on
 *   save.
 *
 * One tiny external store, read with useSyncExternalStore: no context
 * provider, no re-render outside the components that read the draft.
 */

const db = typeof indexedDB !== "undefined" ? createStore("portfolio-builder", "kv") : undefined;
const DRAFT_KEY = "draft:v1";
const BACKUP_KEY = "pb:draft-backup";

interface Saved { savedAt: number; draft: unknown }

/** A synchronous copy: IndexedDB writes started while a tab closes can be lost. */
function backup() {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: Date.now(), draft } satisfies Saved));
  } catch {
    // storage full or blocked: IndexedDB remains the primary copy
  }
}

let draft: DraftT = emptyDraft(0);
let loaded = false;
const listeners = new Set<() => void>();
const history: DraftT[] = [];
const urls = new Map<string, string>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit() {
  listeners.forEach((l) => l());
}

let dirty = false;

async function flush() {
  if (!db || !dirty) return;
  dirty = false;
  clearTimeout(saveTimer);
  await set(DRAFT_KEY, { savedAt: Date.now(), draft } satisfies Saved, db);
}

function scheduleSave() {
  if (!db) return;
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await flush();
    await collectGarbage();
  }, 250);
}

// Never lose the last keystroke: save the moment the tab is hidden or
// closed, not only after the debounce.
if (typeof window !== "undefined") {
  const now = () => {
    if (loaded) backup();
    void flush();
  };
  window.addEventListener("pagehide", now);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && now());
}

function referencedBlobs(d: DraftT): Set<string> {
  const out = new Set<string>();
  JSON.stringify(d, (_k, v) => {
    if (typeof v === "string" && v.startsWith("blob:")) out.add(v);
    return v;
  });
  return out;
}

async function collectGarbage() {
  if (!db) return;
  const used = referencedBlobs(draft);
  for (const k of await keys(db)) {
    if (typeof k === "string" && k.startsWith("blob:") && !used.has(k)) {
      await del(k, db);
      const u = urls.get(k);
      if (u) URL.revokeObjectURL(u);
      urls.delete(k);
    }
  }
}

export async function loadDraft(): Promise<DraftT> {
  if (loaded || !db) return draft;
  const fromDb = (await get<Saved>(DRAFT_KEY, db)) ?? null;
  let fromLs: Saved | null = null;
  try {
    fromLs = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "null");
  } catch {
    fromLs = null;
  }
  // whichever copy is newer wins
  const newest = [fromDb, fromLs].filter((x): x is Saved => Boolean(x && x.savedAt)).sort((a, b) => b.savedAt - a.savedAt)[0];
  const stored = newest?.draft;
  const parsed = Draft.safeParse(stored);
  if (parsed.success && parsed.data.meta.expiresAt > Date.now()) {
    draft = parsed.data;
  } else {
    if (stored) await wipeEverything();
    draft = emptyDraft();
  }
  loaded = true;
  emit();
  return draft;
}

export function getDraft(): DraftT {
  return draft;
}

export function isLoaded(): boolean {
  return loaded;
}

function commit(next: DraftT, remember = true) {
  if (remember) {
    history.push(draft);
    if (history.length > 50) history.shift();
  }
  draft = next;
  emit();
  scheduleSave();
}

/** Form edits: one field at a time. */
export function update(path: string, value: unknown) {
  commit(setAt(draft, path, value), false);
}

/** Whole-draft functional update (for list editors). */
export function mutate(fn: (d: DraftT) => void) {
  const next = structuredClone(draft);
  fn(next);
  commit(next, false);
}

/** Assistant edits: validated, undoable. Throws with a readable message. */
export function applyAssistantOps(ops: Op[]) {
  commit(applyOps(draft, ops), true);
}

export function canUndo(): boolean {
  return history.length > 0;
}

export function undo() {
  const prev = history.pop();
  if (prev) commit(prev, false);
}

export function useDraft(): DraftT {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => draft,
    () => draft,
  );
}

// ── files ────────────────────────────────────────────────────────────────

export async function putBlob(blob: Blob): Promise<string> {
  const ref = `blob:${uid()}`;
  if (db) await set(ref, blob, db);
  return ref;
}

export async function getBlob(ref: string | null | undefined): Promise<Blob | undefined> {
  if (!ref || !db) return undefined;
  return get<Blob>(ref, db);
}

/** A stable object URL per ref, for previews. */
export async function blobUrl(ref: string | null | undefined): Promise<string | undefined> {
  if (!ref) return undefined;
  const cached = urls.get(ref);
  if (cached) return cached;
  const b = await getBlob(ref);
  if (!b) return undefined;
  const u = URL.createObjectURL(b);
  urls.set(ref, u);
  return u;
}

export async function wipeEverything() {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // nothing stored
  }
  if (!db) return;
  for (const k of await keys(db)) await del(k, db);
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  history.length = 0;
  draft = emptyDraft();
  emit();
}
