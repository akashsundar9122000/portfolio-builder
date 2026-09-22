import { NextResponse } from "next/server";
import { fail } from "@/lib/server/guard";
import { ensureSite, MAX_ASSET_BYTES, noteAsset, storeAsset } from "@/lib/server/sites";
import { publisher, publishError, withinDaily } from "@/lib/server/publish-http";

/**
 * One image / audio / PDF per request (the raw bytes as the body, ?ext=jpg),
 * because Vercel caps a request at 4.5 MB. Returns its content-hash name.
 */
export async function POST(req: Request) {
  const who = await publisher();
  if (who instanceof NextResponse) return who;
  const ext = new URL(req.url).searchParams.get("ext") ?? "";
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_ASSET_BYTES) return fail("Each file must be under 4 MB.", 413);
  try {
    if (!(await withinDaily("asset", who.owner, 150))) return fail("You’ve uploaded a lot today — try again tomorrow.", 429);
    const bytes = new Uint8Array(await req.arrayBuffer());
    const site = await ensureSite(who.owner, "Portfolio");
    if (site.status === "removed") return fail("This site was taken down by FolioForge and can’t be republished.", 403);
    const file = await storeAsset(site, bytes, ext);
    await noteAsset(site, file, bytes.length);
    return NextResponse.json({ file });
  } catch (e) {
    return publishError(e, "publish:asset");
  }
}
