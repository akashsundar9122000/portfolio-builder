import "server-only";
import { env } from "@/lib/server/env";

/**
 * NVIDIA NIM chat completions (OpenAI-compatible), made resilient.
 *
 * Free NIM endpoints are volatile: in one measurement the same key saw
 * one model answer in 0.9 s, two return 503 "overloaded", four return 404
 * (retired) and seven time out — and the picture changes hour to hour.
 * So instead of trying models one after another, requests are HEDGED:
 *
 *   - start the best model; if it hasn't answered within HEDGE_MS, start
 *     the next one in parallel (up to MAX_PARALLEL), and immediately on a
 *     failure;
 *   - the first valid answer wins and the others are aborted;
 *   - a model that fails is skipped for a while (retired models for an
 *     hour), and models that recently answered quickly are tried first;
 *   - everything finishes inside DEADLINE_MS, well within the route limit.
 *
 * When NVIDIA as a whole is degraded, hedging between its models can't
 * help, so Pollinations' cheap text models (≈0.0001 pollen per answer,
 * using POLLINATIONS_API_KEY) join as the third hedge slot: they only run
 * if the first two NVIDIA models haven't answered within ~12 s.
 * AI_TEXT_FALLBACK=none keeps it NVIDIA-only.
 *
 * Callers only ever see a plain "busy" message; details go to the log.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AiUnavailable extends Error {}

export const DEFAULT_MODELS = [
  "mistralai/mistral-nemotron",
  "nvidia/nemotron-3-super-120b-a12b",
  "deepseek-ai/deepseek-v4.1-flash",
  "z-ai/glm-5.3-flash",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "openai/gpt-oss-20b",
  "moonshotai/kimi-k3",
];

/** Pollinations text models used as the paid last-resort slot (cheap, non-paid-only). */
export const POLLINATIONS_FALLBACK = ["pollinations:nova-fast", "pollinations:gpt-oss"];

const HEDGE_MS = 6_000;
const MAX_PARALLEL = 3;
const PER_MODEL_TIMEOUT_MS = 30_000;
const DEADLINE_MS = 50_000;
const COOLDOWN_MS = 2 * 60_000;
const RETIRED_COOLDOWN_MS = 60 * 60_000;

interface ModelStats { coolUntil: number; lastLatency?: number }
const stats = new Map<string, ModelStats>();

const s = (m: string) => stats.get(m) ?? (stats.set(m, { coolUntil: 0 }), stats.get(m)!);

/** Configured order, cooled-down models last, recently fast ones first. */
export function orderModels(configured: string[], now = Date.now()): string[] {
  const idx = new Map(configured.map((m, i) => [m, i]));
  const warm = configured.filter((m) => s(m).coolUntil <= now);
  const cold = configured.filter((m) => s(m).coolUntil > now);
  warm.sort((a, b) => {
    const la = s(a).lastLatency, lb = s(b).lastLatency;
    if (la !== undefined && lb !== undefined) return la - lb;
    if (la !== undefined) return -1;
    if (lb !== undefined) return 1;
    return idx.get(a)! - idx.get(b)!;
  });
  // cooling models go last rather than being dropped: better a slow chance than none
  return [...warm, ...cold];
}

export function resetModelStats() {
  stats.clear();
}

function configuredModels(): string[] {
  const list = (env.NVIDIA_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_MODELS;
}

/**
 * The hedge queue: the two best NVIDIA models, then (if enabled) the
 * Pollinations fallback, then the remaining NVIDIA models.
 */
export function buildQueue(nvidia: string[], pollinationsEnabled: boolean): string[] {
  const ordered = orderModels(nvidia);
  if (!pollinationsEnabled) return ordered;
  return [...ordered.slice(0, 2), ...orderModels(POLLINATIONS_FALLBACK), ...ordered.slice(2)];
}

async function callModel(model: string, messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number }, signal: AbortSignal): Promise<string> {
  const viaPollinations = model.startsWith("pollinations:");
  const res = await fetch(viaPollinations ? "https://gen.pollinations.ai/v1/chat/completions" : `${env.NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${viaPollinations ? env.POLLINATIONS_API_KEY : env.NVIDIA_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    // no response_format: not every NIM model supports it; callers parse JSON leniently
    body: JSON.stringify({ model: viaPollinations ? model.slice("pollinations:".length) : model, messages, max_tokens: opts.maxTokens ?? 1200, temperature: opts.temperature ?? 0.6 }),
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  // reasoning models may wrap their thinking in <think>…</think>
  const text = (data.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) throw new Error("empty reply");
  return text;
}

export async function chat(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number; json?: boolean } = {}): Promise<string> {
  const pollinations = Boolean(env.POLLINATIONS_API_KEY) && env.AI_TEXT_FALLBACK !== "none";
  if (!env.NVIDIA_API_KEY && !pollinations) throw new AiUnavailable("The AI assistant isn't configured yet.");
  const queue = env.NVIDIA_API_KEY ? buildQueue(configuredModels(), pollinations) : orderModels(POLLINATIONS_FALLBACK);
  const controllers = new Map<string, AbortController>();
  const failures: string[] = [];
  const started = Date.now();

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let running = 0;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => finish(new AiUnavailable("The AI is busy right now — please try again in a minute.")), DEADLINE_MS);

    const finish = (result: string | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(hedgeTimer);
      controllers.forEach((c) => c.abort());
      if (typeof result === "string") resolve(result);
      else {
        console.warn(JSON.stringify({ event: "ai_text_unavailable", tried: failures, ms: Date.now() - started }));
        reject(result);
      }
    };

    const launchNext = () => {
      if (settled) return;
      clearTimeout(hedgeTimer);
      const model = queue.shift();
      if (!model) {
        if (running === 0) finish(new AiUnavailable("The AI is busy right now — please try again in a minute."));
        return;
      }
      running++;
      const ctrl = new AbortController();
      controllers.set(model, ctrl);
      const timer = setTimeout(() => ctrl.abort(), PER_MODEL_TIMEOUT_MS);
      const t0 = Date.now();
      callModel(model, messages, opts, ctrl.signal)
        .then((text) => {
          s(model).lastLatency = Date.now() - t0;
          s(model).coolUntil = 0;
          finish(text);
        })
        .catch((e: Error & { status?: number }) => {
          if (settled) return; // aborted because another model won
          const retired = e.status === 404 || e.status === 410;
          s(model).coolUntil = Date.now() + (retired ? RETIRED_COOLDOWN_MS : COOLDOWN_MS);
          s(model).lastLatency = undefined;
          failures.push(`${model}:${e.status ?? e.name}`);
          running--;
          launchNext(); // a failure frees a slot straight away
        })
        .finally(() => clearTimeout(timer));
      // hedge: if nothing has answered soon, start another in parallel
      if (running < MAX_PARALLEL) hedgeTimer = setTimeout(launchNext, HEDGE_MS);
    };

    launchNext();
  });
}

/** Pulls the first JSON object out of a model reply, tolerating ```json fences. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in reply");
  return JSON.parse(body.slice(start, end + 1));
}
