import { NextResponse } from "next/server";
import { z } from "zod";
import { endSession, resolveLogin, sessionState, startSession } from "@/lib/server/session";
import { hasText } from "@/lib/server/env";
import { StoreMissing, downloadsFor } from "@/lib/server/codes";
import { editingAvailable, imageGateway } from "@/lib/imagegen";

function features() {
  const configured = imageGateway().registry.configured();
  return { text: hasText, image: editingAvailable(), generate: configured.some((p) => p.capabilities.textToImage) };
}

const Body = z.object({ email: z.string().max(200).optional().default(""), code: z.string().min(2).max(64) });

const WHY: Record<string, string> = {
  invalid: "That email and code don’t match. Check both — the code is in the email we sent you.",
  used: "This code has already been used to download a portfolio. Request a new code to build another.",
  expired: "This code has expired (codes last 7 days). Request a new one below.",
  revoked: "This code was replaced or cancelled. Use the newest code we emailed you, or request a new one.",
};

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email and access code." }, { status: 400 });
  // a small constant delay blunts guessing
  await new Promise((r) => setTimeout(r, 400));
  try {
    const login = await resolveLogin(parsed.data.email, parsed.data.code);
    if (!login.ok) return NextResponse.json({ error: WHY[login.reason] ?? WHY.invalid, reason: login.reason }, { status: 401 });
    const https = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
    await startSession(login.code, login.expiresAt, https);
    return NextResponse.json({ ok: true, features: features() });
  } catch (e) {
    if (e instanceof StoreMissing) return NextResponse.json({ error: WHY.invalid, reason: "invalid" }, { status: 401 });
    console.error(JSON.stringify({ route: "session", error: e instanceof Error ? e.message : String(e) }));
    return NextResponse.json({ error: "Couldn’t check your code right now — try again in a minute." }, { status: 503 });
  }
}

export async function GET() {
  const s = await sessionState();
  if (!s.code) return NextResponse.json({ active: false, ended: s.ended ?? null, features: features() });
  const access =
    s.code.kind === "issued"
      ? { kind: "issued" as const, email: s.code.email, downloads: await downloadsFor(s.code.code).catch(() => []) }
      : { kind: "master" as const };
  return NextResponse.json({ active: true, access, features: features() });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
