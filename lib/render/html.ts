/**
 * The only way user text reaches the page.
 *
 * Everything a person typed goes through `h()` (text) or `attr()` (an
 * attribute value). Links go through `safeUrl()`, which allows only
 * https/http, mailto and tel — so `javascript:` or `data:` can never be
 * smuggled into an href, whatever the form or the AI assistant produced.
 */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function h(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

export const attr = h;

/** Normalises what people actually type ("github.com/me") and rejects anything unsafe. */
export function safeUrl(raw: string, kind: "web" | "email" | "tel" = "web"): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (kind === "email") {
    const e = v.replace(/^mailto:/i, "");
    return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e) ? `mailto:${e}` : "";
  }
  if (kind === "tel") {
    const t = v.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
    return t.length >= 6 ? `tel:${t}` : "";
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

/** Display form of a URL: host + path, no scheme, no trailing slash. */
export function prettyUrl(href: string): string {
  try {
    const u = new URL(href);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return href;
  }
}

/** JSON that is safe inside <script type="application/json">. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
