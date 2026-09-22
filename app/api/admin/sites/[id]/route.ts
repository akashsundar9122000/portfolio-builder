import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/guard";
import { isAdmin, passwordMatches, siteUrl } from "@/lib/server/admin";
import { getSite, unpublish } from "@/lib/server/sites";
import { mailSiteRemoved } from "@/lib/server/mail";

/** Admin take-down: asks for the password again, emails the owner, can't be republished. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/sites/[id]">) {
  if (!(await isAdmin())) return fail("Sign in as admin first.", 401);
  const { id } = await ctx.params;
  const parsed = z.object({ password: z.string().max(200), reason: z.string().max(600).default("") }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Bad request.");
  if (!passwordMatches(parsed.data.password)) {
    await new Promise((r) => setTimeout(r, 700));
    return fail("Wrong password — the site was not taken down.", 401);
  }
  try {
    const site = await getSite(id);
    if (!site || site.status !== "live") return fail("That site isn’t live.");
    const removed = await unpublish(site, "admin", parsed.data.reason);
    const mailed = site.owner.includes("@")
      ? await mailSiteRemoved(site.owner, removed, siteUrl(site.slug, req)).then(() => true, () => false)
      : false;
    return NextResponse.json({ ok: true, mailed });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t take the site down.", 503);
  }
}
