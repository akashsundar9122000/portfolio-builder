import { Draft, type Draft as DraftT } from "./schema";

/**
 * Structured edits, used by the AI assistant and by the form.
 *
 * The assistant never returns a whole new document — it returns a few
 * small ops against dot paths. Each op is checked against an allowlist
 * (it may not touch ids, timestamps, or any binary reference such as the
 * photo or voice), then the result is validated against the full schema.
 * If anything fails, nothing is applied.
 */

export type Op =
  | { op: "set"; path: string; value: unknown }
  | { op: "insert"; path: string; index?: number; value: unknown }
  | { op: "remove"; path: string }
  | { op: "move"; path: string; from: number; to: number };

const FORBIDDEN = [
  /^version$/,
  /^meta\.(id|createdAt|expiresAt|owner)$/,
  /^portrait(\.|$)/,
  /^intro\.voice$/,
  /^resume\.file$/,
  /(^|\.)cover$/,
  /(^|\.)id$/,
];

export function pathAllowed(path: string): boolean {
  if (!/^[a-zA-Z][a-zA-Z0-9]*(\.(\d+|[a-zA-Z][a-zA-Z0-9]*))*$/.test(path)) return false;
  return !FORBIDDEN.some((re) => re.test(path));
}

type Container = Record<string, unknown> | unknown[];

function walk(root: unknown, parts: string[]): { parent: Container; key: string } {
  let cur = root as Container;
  for (const p of parts.slice(0, -1)) {
    const next = (cur as Record<string, unknown>)[p];
    if (next === null || typeof next !== "object") throw new Error(`No such path: ${parts.join(".")}`);
    cur = next as Container;
  }
  return { parent: cur, key: parts[parts.length - 1] };
}

function resolve(root: unknown, parts: string[]): unknown {
  let cur = root;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function applyOne(doc: unknown, op: Op): void {
  if (!pathAllowed(op.path)) throw new Error(`Not allowed to change "${op.path}"`);
  const parts = op.path.split(".");
  if (op.op === "set") {
    const { parent, key } = walk(doc, parts);
    if (Array.isArray(parent)) {
      const i = Number(key);
      if (!Number.isInteger(i) || i < 0 || i >= parent.length) throw new Error(`Index out of range: ${op.path}`);
      parent[i] = op.value;
    } else {
      if (!(key in parent)) throw new Error(`No such field: ${op.path}`);
      parent[key] = op.value;
    }
    return;
  }
  // insert / remove / move operate on an array at `path` (or its parent for remove)
  if (op.op === "remove") {
    const { parent, key } = walk(doc, parts);
    if (!Array.isArray(parent)) throw new Error(`"${op.path}" is not a list item`);
    const i = Number(key);
    if (!Number.isInteger(i) || i < 0 || i >= parent.length) throw new Error(`Index out of range: ${op.path}`);
    parent.splice(i, 1);
    return;
  }
  const list = resolve(doc, parts);
  if (!Array.isArray(list)) throw new Error(`"${op.path}" is not a list`);
  if (op.op === "insert") {
    const i = op.index === undefined ? list.length : Math.max(0, Math.min(list.length, op.index));
    list.splice(i, 0, op.value);
  } else {
    if (op.from < 0 || op.from >= list.length || op.to < 0 || op.to >= list.length) throw new Error("Move out of range");
    const [item] = list.splice(op.from, 1);
    list.splice(op.to, 0, item);
  }
}

export function applyOps(draft: DraftT, ops: Op[]): DraftT {
  const next = structuredClone(draft) as unknown;
  for (const op of ops) applyOne(next, op);
  const parsed = Draft.safeParse(next);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`That change doesn't fit: ${first.path.join(".")} — ${first.message}`);
  }
  return parsed.data;
}

/** Sets a single field from the form — same validation path as the assistant. */
export function setAt(draft: DraftT, path: string, value: unknown): DraftT {
  const next = structuredClone(draft) as unknown;
  const parts = path.split(".");
  const { parent, key } = walk(next, parts);
  (parent as Record<string, unknown>)[key] = value;
  return next as DraftT;
}
