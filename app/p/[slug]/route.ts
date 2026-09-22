import { readHtml, resolveSlug } from "@/lib/server/sites";
import { footer, notice, siteHeaders } from "@/lib/server/site-pages";

/**
 * A published portfolio: /p/<name>. Old names redirect to the current one.
 *
 * Never cached at the edge: a take-down (ours or the owner's) has to be
 * immediate, and a cached copy outlives the delete. Every view is one KV
 * read, which the free plan has plenty of room for.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/p/[slug]">) {
  const slug = (await ctx.params).slug.toLowerCase();
  const html = (status: number, body: string, cache = "no-store, must-revalidate") =>
    new Response(body, { status, headers: siteHeaders({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache }) });

  try {
    const hit = await resolveSlug(slug);
    if (!hit || hit.site.status === "pending") return html(404, notice("Portfolio not found", "There’s no published portfolio at this address."));
    if (!hit.current) return Response.redirect(new URL(`/p/${hit.site.slug}`, req.url), 308);
    if (hit.site.status !== "live") return html(410, notice("This portfolio is no longer online", "Its owner or FolioForge has taken it down."));
    const page = await readHtml(hit.site.id);
    if (!page) return html(410, notice("This portfolio is no longer online", "Its owner or FolioForge has taken it down."));
    const text = new TextDecoder().decode(page).replace("</body>", `${footer(hit.site.slug)}</body>`);
    return html(200, text);
  } catch (e) {
    console.error(JSON.stringify({ route: "p", error: String(e) }));
    return html(503, notice("Couldn’t load this portfolio", "Please try again in a minute."));
  }
}
