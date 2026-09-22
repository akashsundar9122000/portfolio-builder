import { mimeFor, readAsset } from "@/lib/server/sites";
import { siteHeaders } from "@/lib/server/site-pages";

/** A published site's image, audio or PDF. Named by content hash, so it never changes. */
export async function GET(_req: Request, ctx: RouteContext<"/s/[id]/[file]">) {
  const { id, file } = await ctx.params;
  try {
    const bytes = /^[a-z0-9]{10,24}$/.test(id) ? await readAsset(id, file) : null;
    if (!bytes) return new Response("Not found", { status: 404, headers: siteHeaders() });
    return new Response(bytes, {
      headers: siteHeaders({ "Content-Type": mimeFor(file), "Cache-Control": "public, max-age=31536000, immutable", "Content-Disposition": "inline" }),
    });
  } catch {
    return new Response("Unavailable", { status: 503, headers: siteHeaders() });
  }
}
