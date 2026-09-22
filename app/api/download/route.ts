import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, requireSession } from "@/lib/server/guard";
import { downloadsFor, recordDownload } from "@/lib/server/codes";
import { endSession } from "@/lib/server/session";

/**
 * The single-portfolio rule for emailed codes. The studio asks "check"
 * before building a download and reports "done" after the file is saved;
 * once both the ZIP and the single HTML are done, the code is used up and
 * the session ends. Master codes are never used up.
 */
const Body = z.object({ kind: z.enum(["html", "zip"]), phase: z.enum(["check", "done"]) });

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Bad request.");
  if (session.kind === "master") return NextResponse.json({ ok: true, burned: false, downloads: [] });

  try {
    if (parsed.data.phase === "check") return NextResponse.json({ ok: true, burned: false, downloads: await downloadsFor(session.code) });
    const r = await recordDownload(session.code, parsed.data.kind);
    if (r.burned) await endSession();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error(JSON.stringify({ route: "download", error: e instanceof Error ? e.message : String(e) }));
    return fail("Couldn’t reach the code store — try the download again in a minute.", 503);
  }
}
