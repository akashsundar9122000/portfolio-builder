/**
 * Regenerates the landing page's sample thumbnails (public/sample-thumbs)
 * from the rendered /samples/<id> pages. Run against a running server:
 *   BASE=http://localhost:3000 node scripts/capture-samples.mjs
 * Static pictures, not live iframes: three full portfolios running inside
 * the landing page used enough memory to crash iPhone Safari.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const IDS = ["developer", "marketer", "student"];

mkdirSync("public/sample-thumbs", { recursive: true });
const browser = await chromium.launch();
for (const id of IDS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
  await page.goto(`${BASE}/samples/${id}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `public/sample-thumbs/${id}.jpg`, type: "jpeg", quality: 80 });
  await page.close();
  console.log(`  public/sample-thumbs/${id}.jpg`);
}
await browser.close();
