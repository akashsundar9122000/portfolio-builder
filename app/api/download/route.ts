import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, requireSession } from "@/lib/server/guard";
import { downloadsFor, recordDownload } from "@/lib/server/codes";

/**
 * The studio asks "check" before building a download (so a revoked or
 * expired code is caught first) and reports "done" after the file is
 * saved. Downloads are only recorded for the admin dashboard — a code
 * stays valid for its full 7 days however often it's used.
 */
const Body = z.object({ kind: z.enum(["html", "zip"]), phase: z.enum(["check", "done"]) });

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Bad request.");
  if (session.kind === "master") return NextResponse.json({ ok: true, downloads: [] });

  try {
    if (parsed.data.phase === "check") return NextResponse.json({ ok: true, downloads: await downloadsFor(session.code) });
    return NextResponse.json({ ok: true, ...(await recordDownload(session.code, parsed.data.kind)) });
  } catch (e) {
    console.error(JSON.stringify({ route: "download", error: e instanceof Error ? e.message : String(e) }));
    return fail("Couldn’t reach the code store — try the download again in a minute.", 503);
  }
}
