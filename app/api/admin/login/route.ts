import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/guard";
import { adminConfigured, endAdmin, isHttps, passwordMatches, startAdmin } from "@/lib/server/admin";

const Body = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  if (!adminConfigured()) return fail("Set ADMIN_PASSWORD to use the admin pages.", 503);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  // slow enough to make guessing pointless
  await new Promise((r) => setTimeout(r, 700));
  if (!parsed.success || !passwordMatches(parsed.data.password)) return fail("Wrong password.", 401);
  await startAdmin(isHttps(req));
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await endAdmin();
  return NextResponse.json({ ok: true });
}
