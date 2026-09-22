/**
 * axe on every screen, desktop and phone. Starts the production server,
 * signs in with the first invite code so /build and /studio render.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const PORT = 3190;
const server = spawn("pnpm", ["start", "-p", String(PORT)], { stdio: "ignore", detached: true });
const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const code = (readFileSync(".env.local", "utf8").match(/CREATE_INVITE_CODES=([^:,\s]+)/) ?? [])[1];

const browser = await chromium.launch();
let violations = 0;
for (const [name, opts] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["phone", devices["iPhone 14"]]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  if (code) await page.request.post(`${base}/api/session`, { data: { code } });
  for (const path of ["/", "/build?step=basics", "/build?step=theme", "/build?step=voice", "/studio"]) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("iframe").analyze();
    const v = r.violations.filter((x) => x.impact === "serious" || x.impact === "critical");
    violations += v.length;
    console.log(`  ${v.length ? "FAIL " : "clean"} ${name.padEnd(7)} ${path}`);
    for (const x of v) console.log(`      [${x.impact}] ${x.id}: ${x.help}\n        ${x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n        ")}`);
  }
  await ctx.close();
}
await browser.close();
process.kill(-server.pid);
if (violations) { console.error(`\n${violations} accessibility violation(s).`); process.exit(1); }
console.log("\nNo accessibility violations.");
