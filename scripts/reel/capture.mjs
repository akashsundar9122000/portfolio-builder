/**
 * Stills for the Instagram reel (scripts/reel/film.html).
 *
 * Shoots the real app against a locally running server, signed in with the
 * first master code and carrying the developer sample as a draft, so the
 * wizard and studio are full of believable content instead of placeholders.
 *
 *   BASE=http://localhost:3000 node scripts/reel/capture.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? ".work/reel/shots";
const PHONE = { width: 430, height: 932 };

mkdirSync(OUT, { recursive: true });

const code = readFileSync(".env", "utf8").match(/CREATE_INVITE_CODES=([^:,\s]+)/)?.[1];
if (!code) throw new Error("CREATE_INVITE_CODES is needed to film the builder");

// the sample developer, as if this person were building their own portfolio
// (written by: pnpm exec tsx, see scripts/reel/README)
const draft = JSON.parse(readFileSync(".work/reel/draft.json", "utf8"));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 3, reducedMotion: "reduce" });
await ctx.request.post(`${BASE}/api/session`, { data: { code } });

const page = await ctx.newPage();
const shot = async (name, opts = {}) => {
  await page.waitForTimeout(opts.settle ?? 700);
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts.shot });
  console.log(`  ${name}`);
};

// seed the draft and its portrait into this browser
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.evaluate(async (d) => {
  const blob = await (await fetch("/sample-photos/developer.jpg")).blob();
  await new Promise((res, rej) => {
    const r = indexedDB.open("portfolio-builder");
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => {
      const tx = r.result.transaction("kv", "readwrite");
      tx.objectStore("kv").put(blob, "blob:reel-portrait");
      tx.objectStore("kv").put({ savedAt: Date.now() + 60000, draft: d }, "draft:v1");
      tx.oncomplete = res;
      tx.onerror = rej;
    };
  });
  localStorage.setItem("pb:draft-backup", JSON.stringify({ savedAt: Date.now() + 60000, draft: d }));
}, draft);

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await shot("landing");

for (const [step, name] of [["basics", "step-basics"], ["photo", "step-photo"], ["theme", "step-theme"], ["voice", "step-voice"]]) {
  await page.goto(`${BASE}/build?step=${step}`, { waitUntil: "networkidle" });
  await shot(name, { settle: 1200 });
}

// the studio, wide, so the preview and the assistant both read
const wide = await ctx.newPage();
await wide.setViewportSize({ width: 1280, height: 800 });
await wide.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
await wide.waitForTimeout(3500);
await wide.screenshot({ path: `${OUT}/studio.png` });
console.log("  studio");
await wide.getByRole("button", { name: /^Publish$/ }).first().click();
await wide.waitForTimeout(2500);
await wide.screenshot({ path: `${OUT}/publish.png` });
console.log("  publish");

// the finished portfolio, on a phone
await page.goto(`${BASE}/samples/developer`, { waitUntil: "networkidle" });
await shot("site-hero", { settle: 1500 });
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.22 }));
await shot("site-work", { settle: 1200 });
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.45 }));
await shot("site-exp", { settle: 1200 });

writeFileSync(`${OUT}/../shots.json`, JSON.stringify({ at: Date.now(), base: BASE }, null, 2));
await browser.close();
console.log(`\nStills in ${OUT}`);
