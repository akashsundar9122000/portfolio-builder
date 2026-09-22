import type { Draft } from "./schema";
import { themeById } from "./themes";

/**
 * A resume PDF generated from the draft, entirely in the browser.
 *
 * One column, standard headings, real text (not an image): the layout
 * applicant-tracking systems parse reliably. A4, 1–2 pages. The theme's
 * accent is used only for thin rules, so it prints well on any theme.
 *
 * pdf-lib's built-in Helvetica covers Latin text; typographic characters
 * are normalised and anything it can't encode (e.g. non-Latin scripts)
 * is dropped rather than breaking generation — `droppedCharacters`
 * reports it so the UI can say so.
 */

const A4 = { w: 595.28, h: 841.89 };
const M = { x: 50, top: 52, bottom: 52 };

const REPLACE: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": " - ",
  "…": "...", "•": "-", " ": " ", "‑": "-", "‒": "-", "′": "'", "·": "|",
};

export interface ResumeResult { pdf: Blob; pages: number; droppedCharacters: boolean }

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function missingForResume(d: Draft): string[] {
  const missing: string[] = [];
  if (!d.identity.name.trim()) missing.push("your name (step 1)");
  const hasBody = d.experience.some((e) => e.role || e.company) || d.projects.some((p) => p.title) || d.education.some((e) => e.degree);
  if (!hasBody) missing.push("at least one job, project or degree");
  return missing;
}

export async function generateResumePdf(d: Draft): Promise<ResumeResult> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.identity.name} - Resume`);
  doc.setAuthor(d.identity.name);
  doc.setCreator("Portfolio Builder");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.11, 0.12);
  const muted = rgb(0.36, 0.36, 0.38);
  const accent = rgb(...hexToRgb(themeById(d.meta.themeId).mode === "light" ? themeById(d.meta.themeId).colors.accent : themeById(d.meta.themeId).colors.gradientTo));
  let dropped = false;

  // normalise to what Helvetica (WinAnsi) can encode
  const clean = (s: string) => {
    let out = "";
    for (const ch of s.replace(/[‘’“”–—…• ‑‒′·]/g, (c) => REPLACE[c] ?? c)) {
      try {
        regular.encodeText(ch);
        out += ch;
      } catch {
        dropped = true;
      }
    }
    return out.replace(/\s+/g, " ").trim();
  };

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M.top;
  const width = A4.w - M.x * 2;

  const ensure = (needed: number) => {
    if (y - needed < M.bottom) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - M.top;
    }
  };

  const wrap = (text: string, font: typeof regular, size: number, maxW: number): string[] => {
    const words = clean(text).split(" ").filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxW) line = next;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const para = (text: string, o: { size?: number; font?: typeof regular; color?: ReturnType<typeof rgb>; indent?: number; gap?: number; bullet?: boolean } = {}) => {
    const size = o.size ?? 9.8;
    const font = o.font ?? regular;
    const indent = o.indent ?? 0;
    const lead = size * 1.42;
    const lines = wrap(text, font, size, width - indent - (o.bullet ? 10 : 0));
    for (const [i, l] of lines.entries()) {
      ensure(lead);
      if (o.bullet && i === 0) page.drawText("\u2022", { x: M.x + indent, y, size, font, color: muted });
      page.drawText(l, { x: M.x + indent + (o.bullet ? 10 : 0), y, size, font, color: o.color ?? ink });
      y -= lead;
    }
    y -= o.gap ?? 0;
  };

  const rowWithRight = (left: string, right: string, size = 10.5) => {
    ensure(size * 1.5);
    const r = clean(right);
    const rw = regular.widthOfTextAtSize(r, 9);
    const leftLines = wrap(left, bold, size, width - rw - 16);
    page.drawText(r, { x: M.x + width - rw, y, size: 9, font: regular, color: muted });
    for (const l of leftLines) {
      ensure(size * 1.4);
      page.drawText(l, { x: M.x, y, size, font: bold, color: ink });
      y -= size * 1.4;
    }
  };

  const heading = (label: string) => {
    ensure(40);
    y -= 8;
    page.drawText(clean(label).toUpperCase(), { x: M.x, y, size: 9, font: bold, color: accent });
    y -= 5;
    page.drawLine({ start: { x: M.x, y }, end: { x: M.x + width, y }, thickness: 0.6, color: accent });
    y -= 13;
  };

  // ── header ──
  const id = d.identity;
  page.drawText(clean(id.name), { x: M.x, y: y - 6, size: 22, font: bold, color: ink });
  y -= 30;
  if (id.roles.length) para(id.roles.join("  \u2022  "), { size: 10.5, color: accent, font: bold });
  const contact = [id.location, id.email, id.phone, ...id.socials.map((s) => s.url.replace(/^https?:\/\//, "").replace(/\/$/, ""))].filter(Boolean);
  if (contact.length) para(contact.join("  \u2022  "), { size: 9, color: muted });
  y -= 2;
  page.drawLine({ start: { x: M.x, y }, end: { x: M.x + width, y }, thickness: 1.1, color: ink });
  y -= 14;

  // ── summary ──
  const summary = id.bioLong.split(/\n\s*\n/)[0]?.trim() || id.bioShort.trim();
  if (summary) {
    heading("Summary");
    para(summary, { gap: 2 });
  }

  // ── experience ──
  const jobs = d.experience.filter((e) => e.role || e.company);
  if (jobs.length) {
    heading("Experience");
    for (const e of jobs) {
      rowWithRight([e.role, e.company].filter(Boolean).join(" - "), [e.start, e.end || (e.start ? "Present" : "")].filter(Boolean).join(" - "));
      if (e.location) para(e.location, { size: 9, color: muted });
      if (e.description) para(e.description, { gap: 1 });
      for (const h of e.highlights.filter(Boolean)) para(h, { bullet: true, indent: 4 });
      if (e.tech.length) para(`Tech: ${e.tech.join(", ")}`, { size: 9, color: muted });
      y -= 7;
    }
  }

  // ── projects ──
  const projects = d.projects.filter((p) => p.title);
  if (projects.length) {
    heading("Projects");
    for (const p of projects) {
      const link = (p.liveUrl || p.repoUrl).replace(/^https?:\/\//, "").replace(/\/$/, "");
      rowWithRight(p.tagline ? `${p.title} - ${p.tagline}` : p.title, link);
      if (p.description) para(p.description, { gap: 1 });
      const facts = p.metrics.filter((m) => m.label && m.value).map((m) => `${m.label}: ${m.value}`);
      if (facts.length) para(facts.join("  \u2022  "), { size: 9, color: muted });
      if (p.tech.length) para(`Tech: ${p.tech.join(", ")}`, { size: 9, color: muted });
      y -= 7;
    }
  }

  // ── skills ──
  const groups = d.skillGroups.filter((g) => g.skills.length);
  if (groups.length) {
    heading("Skills");
    for (const g of groups) {
      const label = clean(`${g.label}: `);
      ensure(14);
      page.drawText(label, { x: M.x, y, size: 9.8, font: bold, color: ink });
      const lw = bold.widthOfTextAtSize(label, 9.8);
      const lines = wrap(g.skills.join(", "), regular, 9.8, width - lw);
      for (const [i, l] of lines.entries()) {
        if (i > 0) ensure(14);
        page.drawText(l, { x: M.x + (i === 0 ? lw : 0), y, size: 9.8, font: regular, color: ink });
        y -= 14;
      }
    }
    y -= 4;
  }

  // ── education ──
  const edu = d.education.filter((e) => e.degree);
  if (edu.length) {
    heading("Education");
    for (const e of edu) {
      rowWithRight([e.degree, e.institution].filter(Boolean).join(" - "), [e.start, e.end].filter(Boolean).join(" - "));
      const extra = [e.grade, e.note].filter(Boolean).join("  \u2022  ");
      if (extra) para(extra, { size: 9, color: muted });
      y -= 5;
    }
  }

  // ── awards ──
  const awards = d.awards.filter((a) => a.title);
  if (awards.length) {
    heading("Awards & Certifications");
    for (const a of awards) {
      rowWithRight([a.title, a.issuer].filter(Boolean).join(" - "), a.year, 10);
      if (a.note) para(a.note, { size: 9, color: muted });
      y -= 3;
    }
  }

  const bytes = await doc.save();
  return { pdf: new Blob([bytes as BlobPart], { type: "application/pdf" }), pages: doc.getPageCount(), droppedCharacters: dropped };
}
