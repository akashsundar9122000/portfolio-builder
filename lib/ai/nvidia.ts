import "server-only";
import { env } from "@/lib/server/env";

/**
 * NVIDIA NIM chat completions (OpenAI-compatible).
 *
 * Same approach Akash's other projects use: NVIDIA rate-limits per MODEL,
 * so NVIDIA_MODEL may be a comma-separated list and a 429/5xx/404 on one
 * falls through to the next. Every call has a hard timeout well inside
 * Vercel Hobby's function limit.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AiUnavailable extends Error {}

export async function chat(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number; json?: boolean } = {}): Promise<string> {
  if (!env.NVIDIA_API_KEY) throw new AiUnavailable("The AI assistant isn't configured yet.");
  const models = env.NVIDIA_MODEL.split(",").map((m) => m.trim()).filter(Boolean);
  let lastError = "";
  for (const model of models) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    try {
      const res = await fetch(`${env.NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: opts.maxTokens ?? 1200,
          temperature: opts.temperature ?? 0.6,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (res.status === 429 || res.status === 404 || res.status >= 500) {
        lastError = `${model}: HTTP ${res.status}`;
        continue;
      }
      if (!res.ok) throw new Error(`AI request failed (${res.status})`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? "";
      // reasoning models may wrap thoughts in <think>…</think>
      return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if ((e as Error).name === "AbortError") continue;
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`The AI is busy right now — please try again in a minute. (${lastError})`);
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
