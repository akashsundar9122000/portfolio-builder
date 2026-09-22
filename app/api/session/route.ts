import { NextResponse } from "next/server";
import { z } from "zod";
import { endSession, findCode, startSession, currentCode } from "@/lib/server/session";
import { hasText } from "@/lib/server/env";
import { editingAvailable, imageGateway } from "@/lib/imagegen";

function features() {
  const configured = imageGateway().registry.configured();
  return { text: hasText, image: editingAvailable(), generate: configured.some((p) => p.capabilities.textToImage) };
}

const Body = z.object({ code: z.string().min(2).max(64) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your invite code." }, { status: 400 });
  // a small constant delay blunts guessing
  await new Promise((r) => setTimeout(r, 400));
  const code = findCode(parsed.data.code);
  if (!code) return NextResponse.json({ error: "That code isn't valid." }, { status: 401 });
  const https = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  await startSession(code, https);
  return NextResponse.json({ ok: true, features: features() });
}

export async function GET() {
  const code = await currentCode();
  return NextResponse.json({ active: Boolean(code), features: features() });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
