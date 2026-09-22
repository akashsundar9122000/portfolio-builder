/**
 * Every text tone against every surface, in every theme. WCAG AA:
 * 4.5:1 for body text and labels (text, secondary, tertiary, accent),
 * and the accent's own contrast colour on an accent fill.
 */
import { THEMES } from "../lib/builder/themes";

function lum(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

let failures = 0;
for (const t of THEMES) {
  const c = t.colors;
  const surfaces = { bg: c.bg, bgSunken: c.bgSunken, surface: c.surface, surfaceRaised: c.surfaceRaised, stage: c.stage };
  const tones = { text: c.text, textSecondary: c.textSecondary, textTertiary: c.textTertiary, accent: c.accent };
  for (const [tn, tv] of Object.entries(tones)) {
    for (const [sn, sv] of Object.entries(surfaces)) {
      const r = ratio(tv, sv);
      if (r < 4.5) { failures++; console.log(`  ✗ ${t.id}: ${tn} on ${sn} = ${r.toFixed(2)}`); }
    }
  }
  const fill = ratio(c.accentContrast, c.accent);
  if (fill < 4.5) { failures++; console.log(`  ✗ ${t.id}: accentContrast on accent = ${fill.toFixed(2)}`); }
  // the headline gradient's darker stop must still read as large text (3:1)
  for (const stop of [c.gradientFrom, c.gradientTo]) {
    const r = ratio(stop, c.stage);
    if (r < 3) { failures++; console.log(`  ✗ ${t.id}: gradient stop ${stop} on stage = ${r.toFixed(2)}`); }
  }
}
if (failures) { console.error(`\n${failures} contrast failure(s).`); process.exit(1); }
console.log(`Contrast: all ${THEMES.length} themes pass.`);
