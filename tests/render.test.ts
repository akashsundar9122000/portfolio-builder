import { describe, expect, it } from "vitest";
import { h, safeUrl, jsonForScript } from "@/lib/render/html";
import { renderSite } from "@/lib/render";
import { sampleDraft, emptyDraft } from "@/lib/builder/defaults";
import { THEMES } from "@/lib/builder/themes";
import { applyOps, pathAllowed } from "@/lib/builder/patch";
import { Draft } from "@/lib/builder/schema";

describe("escaping", () => {
  it("escapes markup and quotes", () => {
    expect(h(`<img src=x onerror="a()">'`)).toBe("&lt;img src=x onerror=&quot;a()&quot;&gt;&#39;");
  });
  it("allows only web, mailto and tel links", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,<b>")).toBe("");
    expect(safeUrl("github.com/me")).toBe("https://github.com/me");
    expect(safeUrl("a@b.co", "email")).toBe("mailto:a@b.co");
    expect(safeUrl("not an email", "email")).toBe("");
    expect(safeUrl("+91 98765 43210", "tel")).toBe("tel:+919876543210");
  });
  it("keeps </script> out of inline JSON", () => {
    expect(jsonForScript({ t: "</script><script>x" })).not.toContain("</script>");
  });
});

describe("renderSite", () => {
  it("never lets typed text become markup", () => {
    const d = sampleDraft();
    d.identity.name = `<script>alert(1)</script>`;
    d.projects[0].liveUrl = "javascript:alert(2)";
    const html = renderSite(d, THEMES[0], { covers: {} });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("javascript:alert(2)");
  });
  it("renders every theme", () => {
    for (const t of THEMES) {
      const html = renderSite(sampleDraft(), t, { covers: {} });
      expect(html).toContain(t.colors.accent);
      expect(html.startsWith("<!doctype html>")).toBe(true);
    }
  });
  it("omits sections with no content", () => {
    const html = renderSite(emptyDraft(), THEMES[0], { covers: {} });
    expect(html).not.toContain('id="projects"');
    expect(html).not.toContain('id="resume"');
  });
});

describe("assistant patches", () => {
  it("refuses protected paths", () => {
    expect(pathAllowed("portrait.photo")).toBe(false);
    expect(pathAllowed("meta.expiresAt")).toBe(false);
    expect(pathAllowed("projects.0.cover")).toBe(false);
    expect(pathAllowed("identity.bioLong")).toBe(true);
    expect(pathAllowed("__proto__.x")).toBe(false);
  });
  it("applies valid ops and rejects invalid ones atomically", () => {
    const d = sampleDraft();
    const next = applyOps(d, [
      { op: "set", path: "identity.bioShort", value: "New line." },
      { op: "move", path: "meta.sections", from: 2, to: 0 },
    ]);
    expect(next.identity.bioShort).toBe("New line.");
    expect(next.meta.sections[0].id).toBe("projects");
    expect(() => applyOps(d, [{ op: "set", path: "identity.name", value: 42 }])).toThrow();
    expect(() => applyOps(d, [{ op: "set", path: "identity.nope", value: "x" }])).toThrow();
    expect(d.identity.bioShort).not.toBe("New line.");
  });
  it("round-trips the schema", () => {
    expect(Draft.safeParse(JSON.parse(JSON.stringify(sampleDraft()))).success).toBe(true);
  });
});

import { alignCaptions, speechSegments, splitScript, timeCaptionsByPace } from "@/lib/media/captions";

describe("captions", () => {
  it("splits long sentences at commas", () => {
    const lines = splitScript("Hello there. I build products end to end, from the database schema, to the interface people actually use every day.");
    expect(lines[0]).toBe("Hello there.");
    expect(lines.every((l) => l.split(" ").length <= 14)).toBe(true);
  });
  it("finds speech segments and merges short gaps", () => {
    const vad = new Float32Array(300); // 3 s
    vad.fill(0.9, 20, 100); vad.fill(0.9, 110, 140); vad.fill(0.9, 200, 280);
    const segs = speechSegments(vad);
    expect(segs.length).toBe(2);
    expect(segs[0].start).toBeCloseTo(0.2, 1);
    expect(segs[1].start).toBeCloseTo(2.0, 1);
  });
  it("snaps sentence boundaries to pauses", () => {
    const segs = [{ start: 0.3, end: 2.1 }, { start: 2.9, end: 5.0 }];
    const caps = alignCaptions("Hello there, I'm Alex. I build calm software.", segs, 5.4);
    expect(caps).toHaveLength(2);
    expect(caps[1].start).toBeGreaterThan(2.3);
    expect(caps[1].start).toBeLessThan(2.7);
  });
  it("times captions by reading pace without audio", () => {
    const caps = timeCaptionsByPace("One two three four five. Six seven.");
    expect(caps[1].start).toBeGreaterThan(caps[0].end);
  });
});
