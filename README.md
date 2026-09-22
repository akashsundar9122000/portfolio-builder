# FolioForge

*Forge the portfolio your career deserves.*

A friend fills in a guided form — photo, outfit, voice intro, theme, work,
skills — previews a cinematic portfolio in the style of
[akashsundar-portfolio.vercel.app](https://akashsundar-portfolio.vercel.app),
refines it with an AI assistant, and downloads it as static HTML.

- **Private by design.** Drafts, photos and recordings live in the visitor's
  browser (IndexedDB) and expire after 7 days. Nothing is stored server-side.
- **Low running cost.** Text AI is NVIDIA NIM; images go through a multi-provider
  gateway (Pollinations, AI Horde — see docs/image-generation.md); photo cut-out
  (MediaPipe) and voice cleanup (RNNoise) run in the browser.
- **One renderer.** `lib/render` turns a draft + theme into one HTML string:
  the studio preview and both downloads are the same bytes.

## Environment (Vercel project settings)

| Variable | Purpose |
|---|---|
| `NVIDIA_API_KEY` | Text AI (write/polish, assistant) |
| `NVIDIA_MODEL` | Comma-separated model fallback list |
| `CREATE_INVITE_CODES` | `CODE:portraitLimit,CODE2:limit` |
| `CREATE_SESSION_SECRET` | Signs invite sessions (32+ random chars) |
| `POLLINATIONS_API_KEY` | Image gateway: Pollinations (needed for AI outfits) |
| `AI_HORDE_API_KEY` | Image gateway: AI Horde (optional; anonymous without) |
| `IMAGE_*`, `PROVIDER_*` | Gateway routing and limits — see docs/image-generation.md |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Optional: enforces per-code limits |

## Scripts

`pnpm dev` · `pnpm verify` (contrast, types, lint, tests, build, secrets, a11y, budget)
