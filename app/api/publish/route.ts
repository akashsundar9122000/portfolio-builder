import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/guard";
import { publish, siteForOwner } from "@/lib/server/sites";
import { publisher, publishError, withinDaily } from "@/lib/server/publish-http";
import { manageLink, siteUrl } from "@/lib/server/admin";
import { mailPublished } from "@/lib/server/mail";

/** GET: this person's published site, if any. POST: publish (or update / rename) it. */
export async function GET(req: Request) {
  const who = await publisher();
  if (who instanceof NextResponse) return who;
  try {
    const site = await siteForOwner(who.owner);
    if (!site || site.status === "pending") return NextResponse.json({ site: null });
    return NextResponse.json({ site: { slug: site.slug, url: siteUrl(site.slug, req), status: site.status, updatedAt: site.updatedAt } });
  } catch (e) {
    return publishError(e, "publish:get");
  }
}

const Files = z.string().max(40);
const Body = z.object({
  slug: z.string().max(60),
  draft: z.unknown(),
  assets: z.object({
    portrait: z.object({ file: Files, kind: z.enum(["cutout", "framed"]) }).optional(),
    voice: Files.optional(),
    resume: Files.optional(),
    covers: z.record(z.string().max(80), Files).default({}),
  }),
});

export async function POST(req: Request) {
  const who = await publisher();
  if (who instanceof NextResponse) return who;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Bad publish request.");
  try {
    if (!(await withinDaily("publish", who.owner, 40))) return fail("You’ve published a lot today — try again tomorrow.", 429);
    const { site, first, renamed } = await publish(who.owner, parsed.data);
    const url = siteUrl(site.slug, req);
    let mailed = false;
    if (who.email && (first || renamed)) {
      mailed = await mailPublished(who.email, site, url, manageLink(site.id, req), renamed && !first).then(() => true, (e) => {
        console.error(JSON.stringify({ route: "publish", mail: String(e) }));
        return false;
      });
    }
    return NextResponse.json({ ok: true, url, slug: site.slug, first, renamed, mailed });
  } catch (e) {
    return publishError(e, "publish");
  }
}
