import { NextResponse } from "next/server";
import { z } from "zod";
import { endSession, findCode, startSession, currentCode } from "@/lib/server/session";
import { hasImage, hasText } from "@/lib/server/env";

const Body = z.object({ code: z.string().min(2).max(64) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your invite code." }, { status: 400 });
  // a small constant delay blunts guessing
  await new Promise((r) => setTimeout(r, 400));
  const code = findCode(parsed.data.code);
  if (!code) return NextResponse.json({ error: "That code isn't valid." }, { status: 401 });
  await startSession(code);
  return NextResponse.json({ ok: true, features: { text: hasText, image: hasImage } });
}

export async function GET() {
  const code = await currentCode();
  return NextResponse.json({ active: Boolean(code), features: { text: hasText, image: hasImage } });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
