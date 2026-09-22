# Image generation gateway

`lib/imagegen/` is a provider-agnostic gateway for hosted image generation.
The frontend asks for an image; the backend decides which provider makes it,
falls back when one fails, and hands back an image the app owns. The
frontend never learns which provider was used.

Current providers: **Pollinations** and **AI Horde**. Neither is described
here as free or unlimited: quotas, pricing, queue times and terms belong to
the providers and change. The gateway is built to survive that.

## Architecture

```
Browser ── POST /api/generate-image ─────────┐        (or /api/portrait for outfit edits)
   │                                         ▼
   │                            ImageGenerationService      lib/imagegen/service.ts
   │                                         │
   │                            IntelligentProviderRouter   router.ts  ◄── ProviderHealthTracker (health.ts)
   │                                         │                         ◄── ProviderRegistry (registry.ts)
   │                        ┌────────────────┴───────────────┐
   │                PollinationsProvider              AIHordeProvider        providers/
   │                  (synchronous)                    (asynchronous)
   │                        └────────────────┬───────────────┘
   │                                   ImageStorage          storage.ts
   └── GET /api/generate-image/:id ◄── { generationId, status, imageUrl }
```

| Module | Role |
|---|---|
| `types.ts` | The contract: `ImageGenerationRequest`, `GenerationResult`, `ProviderCapabilities`, `ImageGenerationProvider` |
| `validate.ts` | Public request schema: strict, normalised, no provider fields |
| `models.ts` | Model aliases (`FAST`, `QUALITY`, `CINEMATIC`, `ILLUSTRATION`, `EDIT`) → per-provider preference lists |
| `registry.ts` | The list of providers |
| `router.ts` | Eligibility, recovery probes, strategies, AUTO scoring |
| `health.ts` | Rolling-window health, cooldown, quota/auth states, latency percentiles |
| `service.ts` | Attempts, fallback, async lifecycle, hard timeouts |
| `lifecycle.ts` | The status state machine |
| `token.ts` | Signed, user-bound generation IDs |
| `storage.ts` | Where finished images go |
| `events.ts` | Structured lifecycle logging |
| `ratelimit.ts` | Per-user and global limits |
| `index.ts` | Composition root (reads config, registers providers) |

### Why there is no database table

This app deliberately keeps nothing about users on the server: drafts,
photos and recordings live in the visitor's browser and expire after 7 days.
So instead of a `generations` table, the **generation ID is the record**: an
HMAC-signed token carrying the owner (a hash of their session), provider,
provider request ID, start time, providers already tried, and — for text
prompts — the normalised request needed for a later fallback. It cannot be
forged or pointed at another user's generation, and it never contains
credentials. Status transitions follow `lifecycle.ts` and are enforced in the
service (terminal states never change).

If a database is added later, persist the same fields (`id, userId,
provider, providerRequestId, prompt, model, width, height, status, imageUrl,
errorMessage, generationDurationMs, metadata, createdAt, updatedAt,
completedAt`, indexed on `providerRequestId` and `(userId, createdAt)`) and
look them up in `service.status()`; the public API does not change.

## Providers

### Pollinations — synchronous

Per `https://gen.pollinations.ai/openapi.json`:

- `POST /v1/images/generations` (text → image) and `POST /v1/images/edits`
  (image + prompt → image). Edits accept a **base64 data URI**, so user
  photos never need a public URL.
- `GET /image/models` — live catalogue with `input_modalities`, `paid_only`,
  per-model pricing (in pollen) and aliases. The adapter resolves each alias
  against it (cached 10 min), skipping paid-only models unless
  `POLLINATIONS_ALLOW_PAID_MODELS=true`, and skipping text-only models for edits.
- Auth: `Authorization: Bearer sk_…`, server-side only.
- `402` = pollen balance or key budget exhausted → `QUOTA_EXHAUSTED` (30 min
  exclusion, no retries). `429` → `RATE_LIMITED` (short back-off). `401/403`
  → `AUTHENTICATION`. `5xx` → `TRANSIENT`.
- Provider-side safety filters are enabled (`safe=true,nsfw`).

### AI Horde — asynchronous

Per `https://aihorde.net/api/swagger.json` (API v2.6):

| Step | Endpoint |
|---|---|
| submit | `POST /v2/generate/async` → `202 { id, kudos }` |
| poll | `GET /v2/generate/check/{id}` → `waiting`, `processing`, `done`, `wait_time`, `queue_position`, `is_possible`, `faulted` |
| fetch result | `GET /v2/generate/status/{id}` — **limited to 10 requests/min**; called once, only when `done` |
| cancel | `DELETE /v2/generate/status/{id}` |
| load | `GET /v2/status/performance`, `GET /v2/status/models` |

- Requests are deleted by the Horde **10 minutes** after submission, so
  `AI_HORDE_MAX_WAIT_MS` defaults to 10 minutes; past it the gateway cancels
  and ends in `TIMEOUT` (or falls back).
- Without `AI_HORDE_API_KEY` requests are anonymous and run at the lowest
  priority; `allow_downgrade` is set so oversize requests shrink rather than fail.
- Images come back via Cloudflare R2 download links; the adapter downloads
  them (host allowlist, size cap) — the frontend never sees those URLs.
- Workers run their own NSFW filter on the output and it produces false
  positives on harmless prompts (observed during testing). A censored result
  is treated as a provider-side failure (fallback eligible), not the user's fault.
- Queue awareness: `/v2/status/performance` gives queued vs per-minute
  megapixel-steps; that becomes a queue estimate that lowers AI Horde's AUTO
  score when it is busy — but it is still used when it is the only option.
- Webhooks exist (`webhook` field) but need a persistent store to receive
  into; this app has none, so status is advanced by controlled polling.
- **Capabilities**: text-to-image only. Its img2img redraws the subject, so it
  does not advertise identity-preserving editing — outfit edits never route to it.

## Routing

`IMAGE_PROVIDER_STRATEGY` = `AUTO` (default) | `HEALTH_BASED` | `LEAST_LATENCY` | `ROUND_ROBIN` | `WEIGHTED`.

1. **Eligibility** — configured, supports the task (`textToImage` / `imageEditing`) and size, not cooling down; `IMAGE_FORCE_PROVIDER` narrows to one (server-side only).
2. **Recovery** — a provider whose cooldown has expired goes first for exactly one request; the next provider is its fallback.
3. **Order** — AUTO scores each provider:

```
score = 0.45 · health        (window success rate, minus 15 % per consecutive failure)
      + 0.25 · latency       (1 / (1 + avgLatency / 10 s))
      + 0.15 · availability  (HEALTHY 1, DEGRADED 0.6, recovery probe 0.4)
      + 0.15 · load          (1 − max(queue score, active requests / 10))
```

A fast, healthy Pollinations beats a queued AI Horde; after repeated failures
Pollinations cools down and traffic moves to AI Horde until it recovers.

## Fallback and errors

Every failure is classified (`errors.ts`): `TRANSIENT`, `TIMEOUT`,
`PROVIDER_UNAVAILABLE`, `RATE_LIMITED`, `QUOTA_EXHAUSTED`, `AUTHENTICATION`,
`INVALID_REQUEST`, `PERMANENT`.

- Everything except `INVALID_REQUEST` falls back to the next provider, up to
  `IMAGE_MAX_PROVIDER_ATTEMPTS` providers in total. Invalid prompts are never retried.
- For async providers, fallback also happens on a later poll (Horde faulted,
  expired, impossible for 90 s, or over its wait limit). The response then
  carries a **new generationId**; clients poll whichever ID they last received.
- Every provider call runs under a hard deadline (the gateway races it), so a
  provider that ignores cancellation can't hold a request open.
- Users only ever see: *"Image generation failed. Please try again."*, *"…is
  busy right now…"*, *"…took too long…"* or *"That request can't be generated…"*.

## Health and cooldown

- Rolling window of `PROVIDER_HEALTH_WINDOW_SIZE` outcomes (default 20).
- One failure = `DEGRADED` (still routable). `PROVIDER_FAILURE_THRESHOLD`
  consecutive failures (default 3) = `COOLDOWN` for `PROVIDER_COOLDOWN_MS`.
- After cooldown one recovery request is allowed. Success → `HEALTHY`,
  back-off reset. Failure → cooldown doubles, capped at `PROVIDER_MAX_COOLDOWN_MS`.
- `QUOTA` and `AUTH_ERROR` are separate states (30 min exclusion) and do not
  count as reliability failures; rate limits get a short back-off.
- Tracked: requests, success/failure counts and rates, consecutive failures,
  average / p50 / p95 latency, timeouts, fallbacks, active requests, queue
  estimate, last success/failure/error, cooldown.
- Health is **per server instance** — correct but local. Nothing depends on it
  for correctness; with many instances each learns independently.

## Storage

Providers' URLs are never handed to the frontend. The backend downloads every
result (host-allowlisted, size-capped) and passes the bytes to `ImageStorage`.
This app's storage is the visitor's browser (IndexedDB), so the default
`InlineImageStorage` returns a `data:` URL and the client saves it there. To
store server-side instead, implement `ImageStorage.store()` (e.g. upload to
S3/R2, return the permanent URL) and pass it in `index.ts`.

## API

All routes require an invite session (401 otherwise).

`POST /api/generate-image`
```json
{ "prompt": "cinematic futuristic city at night", "model": "CINEMATIC", "width": 1024, "height": 1024, "quality": "high" }
```
`model` ∈ `FAST | QUALITY | CINEMATIC | ILLUSTRATION` (default `QUALITY`),
width/height 256–1536, quality `low | medium | high`. Unknown fields are
rejected — including any attempt to pick a provider.
→ `202 { "generationId": "…", "status": "QUEUED" | "COMPLETED", "imageUrl": null | "data:…" }`

`GET /api/generate-image/:generationId` → `{ generationId, status, imageUrl, message? }`
(404 for missing, forged, or another user's ID).

`DELETE /api/generate-image/:generationId` → cancels a queued generation.

`POST /api/portrait` — the outfit step: `{ photo (data URI), outfitId, color, consent: true }`,
same response shape, routed with `task: "imageEditing"` / alias `EDIT`.

`GET /api/admin/image-providers` — health snapshot per provider. Requires
`Authorization: Bearer $IMAGE_ADMIN_TOKEN`; 404 otherwise. No credentials in the output.

## Frontend lifecycle

`lib/imagegen/client.ts` → `runGeneration(start, { onStatus })`: starts, then
polls with back-off (4 s → 12 s) until a terminal state. UI states:
Generating → Queued (after 20 s: "Still in the queue — busy right now…") →
Processing → image, or the friendly failure message. Used by the outfit step
and the project "Generate a cover" button.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `POLLINATIONS_API_KEY` | — | Enables Pollinations (secret `sk_` key) |
| `POLLINATIONS_ALLOW_PAID_MODELS` | `false` | Allow `paid_only` catalogue models |
| `AI_HORDE_API_KEY` | anonymous | Higher Horde priority |
| `IMAGE_PROVIDER_STRATEGY` | `AUTO` | Routing strategy |
| `IMAGE_PROVIDER_WEIGHTS` | — | `WEIGHTED` only: `pollinations:3,ai_horde:1` |
| `IMAGE_FORCE_PROVIDER` | — | Dev/testing: pin one provider |
| `IMAGE_MAX_PROVIDER_ATTEMPTS` | `2` | Providers tried per generation |
| `PROVIDER_FAILURE_THRESHOLD` | `3` | Consecutive failures before cooldown |
| `PROVIDER_COOLDOWN_MS` | `60000` | First cooldown |
| `PROVIDER_MAX_COOLDOWN_MS` | `900000` | Back-off cap |
| `PROVIDER_HEALTH_WINDOW_SIZE` | `20` | Rolling window |
| `IMAGE_GENERATION_TIMEOUT_MS` | `120000` | Synchronous call deadline (the routes allow 150 s) |
| `AI_HORDE_MAX_WAIT_MS` | `600000` | Max queue wait |
| `IMAGE_REQUESTS_PER_MINUTE` | `5` | Per user |
| `IMAGE_GLOBAL_REQUESTS_PER_MINUTE` | `60` | Whole deployment |
| `IMAGE_MODEL_MAP` | — | JSON override of `models.ts` |
| `IMAGE_ADMIN_TOKEN` | — | Enables the admin endpoint |

Rate limits use the existing Upstash store when `UPSTASH_REDIS_REST_URL/TOKEN`
are set (shared across instances), otherwise per instance.

## How to add another image provider

Example: Replicate.

1. **Adapter** — `lib/imagegen/providers/replicate.ts`:

```ts
import { classifyHttp } from "../errors";
import { downloadImage, fitSize, type Fetch } from "../http";
import { modelPreferences } from "../models";
import type { GenerationResult, ImageGenerationProvider, ImageGenerationRequest, ProviderCapabilities } from "../types";

export class ReplicateProvider implements ImageGenerationProvider {
  readonly name = "replicate";
  readonly capabilities: ProviderCapabilities = {
    textToImage: true, imageToImage: true, imageEditing: false,
    maxWidth: 1440, maxHeight: 1440, sizeStep: 16, asynchronous: true,
  };
  constructor(private o: { token?: string; fetch?: Fetch }) {}
  isConfigured() { return Boolean(this.o.token); }

  async generate(req: ImageGenerationRequest, signal: AbortSignal): Promise<GenerationResult> {
    const [model] = modelPreferences(req.model, this.name);
    const { width, height } = fitSize(req.width, req.height, 1440, 1440, 16);
    const res = await (this.o.fetch ?? fetch)(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: "POST", signal,
      headers: { Authorization: `Bearer ${this.o.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: { prompt: req.prompt, width, height } }),
    });
    if (!res.ok) throw classifyHttp(res.status, this.name, await res.text());
    const p = await res.json();
    return { provider: this.name, status: "QUEUED", providerRequestId: p.id };
  }

  async getStatus(id: string, signal: AbortSignal): Promise<GenerationResult> {
    const res = await (this.o.fetch ?? fetch)(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${this.o.token}` }, signal,
    });
    if (!res.ok) throw classifyHttp(res.status, this.name);
    const p = await res.json();
    if (p.status === "succeeded") {
      const image = await downloadImage(this.o.fetch ?? fetch, p.output[0], ["replicate.delivery"], this.name, signal);
      return { provider: this.name, status: "COMPLETED", providerRequestId: id, image };
    }
    if (p.status === "failed" || p.status === "canceled") return { provider: this.name, status: "FAILED", providerRequestId: id, error: p.error };
    return { provider: this.name, status: p.status === "processing" ? "PROCESSING" : "QUEUED", providerRequestId: id };
  }
}
```

2. **Register** it in `lib/imagegen/index.ts`: `.register(new ReplicateProvider({ token: process.env.REPLICATE_API_TOKEN }))`
   (add the variable to `config.ts` and `.env.example`).
3. **Models** — add a `replicate` entry to the aliases it serves in `models.ts`.
4. **Test** — mock its HTTP like the Pollinations/AI Horde tests in `tests/imagegen.test.ts`.

Nothing else changes: not the router, service, API, database shape or UI.

## Testing

`pnpm test` — `tests/imagegen.test.ts` covers both adapters against mocked
HTTP (success, queued/processing/completed, 402/429, timeout, faults, expiry,
censorship, host allowlist), health (threshold, cooldown, single recovery
probe, bounded back-off, quota/auth states, rolling window), every routing
strategy, capability filtering, forced provider, and service scenarios A–H,
max attempts, user isolation, forged IDs, cancellation, rate limits, request
validation and secret redaction. No test calls a real provider.

## Troubleshooting

| Symptom | Check |
|---|---|
| "busy right now" immediately | `GET /api/admin/image-providers`: are providers `configured`, in `COOLDOWN`/`QUOTA`/`AUTH_ERROR`? |
| Pollinations never used | `POLLINATIONS_API_KEY` set? `QUOTA` state = balance/budget exhausted (402). |
| Outfit button hidden | `/api/session` → `features.image` is false: no editing-capable provider configured (needs Pollinations). |
| Generations sit in QUEUED | AI Horde queue; see `queueSeconds` in the admin snapshot. A key raises priority. |
| Harmless prompt fails on AI Horde | Worker NSFW false positive (see above); it falls back if another provider is available. |
| Logs | JSON lines with `event: image_generation_*`; no prompts, images or keys are logged. |
