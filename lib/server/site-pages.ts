import "server-only";

/**
 * Headers for everything served from a published site. `sandbox` makes the
 * page run in an opaque origin, so even though it's served from our domain
 * it can't read our cookies or call our APIs as the visitor.
 */
export const SITE_CSP = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads";

export const siteHeaders = (extra: Record<string, string> = {}) => ({
  "Content-Security-Policy": SITE_CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  ...extra,
});

/** A small, quiet footer added to every published page. */
export function footer(slug: string): string {
  return `<div style="padding:28px 16px 36px;text-align:center;font:12px/1.5 ui-monospace,Menlo,monospace;letter-spacing:.08em;opacity:.55">
<a href="/" target="_blank" rel="noopener" style="color:inherit">Made with FolioForge</a> · <a href="/report/${slug}" target="_blank" rel="noopener" style="color:inherit">Report this page</a></div>`;
}

export function notice(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#f3f1ec;font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px">
<div><p style="font:600 12px ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#eba84d">FolioForge</p>
<h1 style="font-size:24px;margin:8px 0">${title}</h1><p style="color:#bdb8ae;max-width:36ch;margin:0 auto">${body}</p>
<p style="margin-top:24px"><a href="/" style="color:#eba84d">Make your own portfolio</a></p></div></body></html>`;
}
