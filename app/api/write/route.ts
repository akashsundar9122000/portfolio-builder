import { NextResponse } from "next/server";
import { z } from "zod";
import { chat, extractJson, AiUnavailable } from "@/lib/ai/nvidia";
import { STYLE, WRITE_INSTRUCTIONS, type WriteTask } from "@/lib/ai/prompts";
import { requireSession, fail } from "@/lib/server/guard";
import { consume } from "@/lib/server/limits";

export const maxDuration = 120; // hedged AI calls finish within 50 s; the assistant may retry once

const Body = z.object({
  task: z.enum(["bioShort", "bioLong", "script", "project", "experience", "polish", "seo"]),
  /** What the model may use: the person's own details, pre-trimmed by the client. */
  context: z.string().max(6000),
  /** The current text being improved, if any. */
  text: z.string().max(2000).default(""),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Bad request.");
  if (!(await consume(session.code, "text", 400))) return fail("This invite code has used its AI allowance.", 429);
  const { task, context, text } = parsed.data;
  try {
    const out = await chat(
      [
        { role: "system", content: `${STYLE}\n\n${WRITE_INSTRUCTIONS[task as WriteTask]}` },
        { role: "user", content: `Details about me:\n${context}${text ? `\n\nCurrent text:\n${text}` : ""}` },
      ],
      { maxTokens: 700, temperature: 0.7, json: task === "seo" },
    );
    if (task === "seo") {
      const j = z.object({ title: z.string(), description: z.string() }).parse(extractJson(out));
      return NextResponse.json({ title: j.title.slice(0, 70), description: j.description.slice(0, 160) });
    }
    const clean = out.replace(/^["']|["']$/g, "").trim();
    // a model that still refuses must not have its apology pasted into the form
    if (!clean || /^(i[’']?m sorry|sorry|i (can|could)(no|’|')t|i need more|as an ai)/i.test(clean)) {
      return fail("Add a little more first — your roles, a job or a project — and try again.", 422);
    }
    return NextResponse.json({ text: clean });
  } catch (e) {
    if (e instanceof AiUnavailable) return fail(e.message, 503);
    console.error(JSON.stringify({ event: "ai_route_error", route: "write", message: e instanceof Error ? e.message.slice(0, 200) : "unknown" }));
    return fail("The AI couldn’t respond just now — please try again in a minute.", 502);
  }
}
