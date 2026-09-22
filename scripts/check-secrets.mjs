/**
 * Proves the negative: no API key in anything shipped to the browser.
 * Scans .next/static for known key shapes and for the literal values of
 * every secret in .env and .env.local.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// public by design: shown on the landing page or used in links, not secrets
const PUBLIC = new Set(["MAIL_FROM", "ADMIN_EMAIL", "GMAIL_USER", "APP_URL", "SMTP_HOST", "SMTP_PORT"]);
const secrets = [".env", ".env.local"].some((f) => existsSync(f))
  ? [".env", ".env.local"].filter((f) => existsSync(f)).map((f) => readFileSync(f, "utf8")).join("\n").split("\n")
      .filter((l) => !PUBLIC.has(l.split("=")[0].trim()))
      .map((l) => l.split("=").slice(1).join("=").trim()).filter((v) => v.length >= 12)
  : [];
const shapes = [/nvapi-[A-Za-z0-9_-]{20,}/, /AIza[0-9A-Za-z_-]{30,}/, /AQ\.[A-Za-z0-9_-]{30,}/, /sk-[A-Za-z0-9]{24,}/];

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|css|html|json|txt)$/.test(p)) yield p;
  }
}

let hits = 0, files = 0;
for (const file of walk(".next/static")) {
  files++;
  const text = readFileSync(file, "utf8");
  for (const re of shapes) if (re.test(text)) { hits++; console.error(`  key-shaped string in ${file}`); }
  for (const s of secrets) if (text.includes(s)) { hits++; console.error(`  a .env value appears in ${file}`); }
}
if (hits) { console.error(`\n${hits} secret leak(s).`); process.exit(1); }
console.log(`Scanned ${files} client files: no secrets.`);
