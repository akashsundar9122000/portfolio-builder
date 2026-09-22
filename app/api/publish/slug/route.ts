import { NextResponse } from "next/server";
import { checkSlug } from "@/lib/server/sites";
import { publisher, publishError } from "@/lib/server/publish-http";

/** Is this site name free for me? Returns the normalised name either way. */
export async function GET(req: Request) {
  const who = await publisher();
  if (who instanceof NextResponse) return who;
  const name = new URL(req.url).searchParams.get("name") ?? "";
  try {
    return NextResponse.json(await checkSlug(name.slice(0, 80), who.owner));
  } catch (e) {
    return publishError(e, "publish:slug");
  }
}
