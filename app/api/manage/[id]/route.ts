import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/guard";
import { siteSigOk } from "@/lib/server/admin";
import { getSite, unpublish } from "@/lib/server/sites";

/** The emailed "manage" link: the owner unpublishes without needing a code. */
export async function POST(req: Request, ctx: RouteContext<"/api/manage/[id]">) {
  const { id } = await ctx.params;
  const parsed = z.object({ sig: z.string().max(100) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success || !siteSigOk(id, parsed.data.sig)) return fail("This link isn’t valid.", 403);
  try {
    const site = await getSite(id);
    if (!site || site.status !== "live") return fail("This portfolio isn’t online.");
    await unpublish(site, "owner");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ route: "manage", error: String(e) }));
    return fail("Couldn’t unpublish right now — try again in a minute.", 503);
  }
}
