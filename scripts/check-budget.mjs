/** Gzipped first-load JS per route, measured in a real browser. */
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { gzipSync } from "node:zlib";

const PORT = 3191;
const BUDGET = { "/": 90, "/build": 230, "/studio": 250 };
const server = spawn("pnpm", ["start", "-p", String(PORT)], { stdio: "ignore", detached: true });
const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const browser = await chromium.launch();
let over = 0;
for (const [route, kb] of Object.entries(BUDGET)) {
  const page = await browser.newPage();
  let bytes = 0;
  page.on("response", async (r) => {
    if (r.request().resourceType() !== "script") return;
    // bodies arrive decompressed, so gzip them to measure transfer size
    bytes += gzipSync(await r.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto(base + route, { waitUntil: "networkidle" });
  const size = bytes / 1024;
  const ok = size <= kb;
  if (!ok) over++;
  console.log(`  ${route.padEnd(8)} ${size.toFixed(1).padStart(6)} / ${kb} kB  ${ok ? "ok" : "OVER"}`);
  await page.close();
}
await browser.close();
process.kill(-server.pid);
if (over) process.exit(1);
