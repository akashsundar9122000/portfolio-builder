import { NextResponse } from "next/server";
import { fail } from "@/lib/server/guard";
import { siteForOwner, unpublish } from "@/lib/server/sites";
import { publisher, publishError } from "@/lib/server/publish-http";

/** The owner takes their own site down from the studio. */
export async function POST() {
  const who = await publisher();
  if (who instanceof NextResponse) return who;
  try {
    const site = await siteForOwner(who.owner);
    if (!site || site.status !== "live") return fail("You don’t have a live site.");
    await unpublish(site, "owner");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return publishError(e, "publish:unpublish");
  }
}
