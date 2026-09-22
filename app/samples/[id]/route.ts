import { renderSite } from "@/lib/render";
import { themeById } from "@/lib/builder/themes";
import { SAMPLES, sampleById } from "@/lib/builder/samples";

/**
 * The landing page's example portfolios, rendered at build time by the same
 * renderer as a real download. Served as plain HTML for the preview iframe,
 * which keeps the renderer out of the landing page's JavaScript.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SAMPLES.map((s) => ({ id: s.id }));
}

export async function GET(_req: Request, ctx: RouteContext<"/samples/[id]">) {
  const sample = sampleById((await ctx.params).id);
  if (!sample) return new Response("Not found", { status: 404 });
  const html = renderSite(sample.draft(), themeById(sample.themeId), { covers: {} });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
