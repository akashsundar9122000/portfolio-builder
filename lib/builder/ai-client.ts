"use client";

import type { Draft } from "./schema";

/**
 * Everything the AI may know about the person — their own inputs only,
 * as compact plain text. Binary refs, ids and timestamps never leave.
 */
export function summarize(d: Draft): string {
  const id = d.identity;
  const lines: string[] = [];
  if (id.name) lines.push(`Name: ${id.name}`);
  if (id.roles.length) lines.push(`Roles: ${id.roles.join(", ")}`);
  if (id.location) lines.push(`Location: ${id.location}`);
  if (id.bioShort) lines.push(`One-liner: ${id.bioShort}`);
  for (const e of d.experience) {
    if (!e.role && !e.company) continue;
    lines.push(`Experience: ${e.role} at ${e.company} (${e.start || "?"} – ${e.end || "present"}). ${e.description} ${e.highlights.join("; ")} Tech: ${e.tech.join(", ")}`);
  }
  for (const p of d.projects) {
    if (!p.title) continue;
    lines.push(`Project: ${p.title} — ${p.tagline}. ${p.description} Tech: ${p.tech.join(", ")}. ${p.metrics.map((m) => `${m.label}: ${m.value}`).join(", ")}`);
  }
  for (const e of d.education) if (e.degree) lines.push(`Education: ${e.degree}, ${e.institution} ${e.start}-${e.end} ${e.grade}`);
  const skills = d.skillGroups.flatMap((g) => g.skills);
  if (skills.length) lines.push(`Skills: ${skills.join(", ")}`);
  for (const a of d.awards) if (a.title) lines.push(`Award: ${a.title} (${a.issuer} ${a.year}) ${a.note}`);
  return lines.join("\n").slice(0, 6000);
}

export type WriteTask = "bioShort" | "bioLong" | "script" | "project" | "experience" | "polish" | "seo";

export async function aiWrite(task: WriteTask, context: string, text = ""): Promise<{ text?: string; title?: string; description?: string }> {
  const res = await fetch("/api/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, context, text }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "The AI couldn't respond.");
  return data;
}

/** The draft as the assistant sees it: no binary refs. */
export function draftForAssistant(d: Draft): string {
  return JSON.stringify(d, (k, v) => (typeof v === "string" && v.startsWith("blob:") ? "[file]" : k === "createdAt" || k === "expiresAt" ? undefined : v));
}
