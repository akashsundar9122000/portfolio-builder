import { NextResponse } from "next/server";
import { z } from "zod";
import { chat, extractJson, AiUnavailable } from "@/lib/ai/nvidia";
import { ASSIST_SYSTEM } from "@/lib/ai/prompts";
import { requireSession, fail } from "@/lib/server/guard";
import { consume } from "@/lib/server/limits";

export const maxDuration = 120; // hedged AI calls finish within 50 s; the assistant may retry once

const Body = z.object({
  draft: z.string().max(40_000), // JSON, binary refs already stripped by the client
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).min(1).max(16),
});

const Reply = z.object({
  reply: z.string().max(1200),
  ops: z
    .array(
      z.union([
        z.object({ op: z.literal("set"), path: z.string().max(120), value: z.unknown() }),
        z.object({ op: z.literal("insert"), path: z.string().max(120), index: z.number().int().optional(), value: z.unknown() }),
        z.object({ op: z.literal("remove"), path: z.string().max(120) }),
        z.object({ op: z.literal("move"), path: z.string().max(120), from: z.number().int(), to: z.number().int() }),
      ]),
    )
    .max(20)
    .default([]),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Bad request.");
  if (!(await consume(session.code, "text", 400))) return fail("This invite code has used its AI allowance.", 429);

  const messages = [
    { role: "system" as const, content: `${ASSIST_SYSTEM}\n\nCurrent draft:\n${parsed.data.draft}` },
    ...parsed.data.messages,
  ];
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await chat(messages, { maxTokens: 2000, temperature: 0.4, json: true });
      try {
        return NextResponse.json(Reply.parse(extractJson(out)));
      } catch {
        messages.push({ role: "assistant", content: out.slice(0, 1500) }, { role: "user", content: "That was not valid JSON in the required shape. Reply again with ONLY the JSON object." });
      }
    }
    return fail("The assistant couldn't produce a valid change — try rephrasing.", 502);
  } catch (e) {
    if (e instanceof AiUnavailable) return fail(e.message, 503);
    console.error(JSON.stringify({ event: "ai_route_error", route: "assist", message: e instanceof Error ? e.message.slice(0, 200) : "unknown" }));
    return fail("The AI couldn’t respond just now — please try again in a minute.", 502);
  }
}
