import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/guard";
import { resolveSlug } from "@/lib/server/sites";
import { baseUrl, siteUrl } from "@/lib/server/admin";
import { mailReport } from "@/lib/server/mail";
import { withinDaily } from "@/lib/server/publish-http";

import { REPORT_REASONS as REASONS } from "@/lib/report-reasons";

const Body = z.object({
  slug: z.string().max(60),
  reason: z.enum(REASONS),
  details: z.string().trim().max(1000).default(""),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  website: z.string().max(0).optional(), // honeypot
});

/** "Report this page" on a published portfolio: emails the admin. */
export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    if (raw && typeof raw === "object" && "website" in raw && raw.website) return NextResponse.json({ ok: true });
    return fail("Choose a reason for your report.");
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  try {
    if (!(await withinDaily("report", ip, 10))) return fail("Too many reports today — try again tomorrow.", 429);
    const hit = await resolveSlug(parsed.data.slug.toLowerCase());
    if (!hit) return fail("That portfolio doesn’t exist.", 404);
    await mailReport({
      slug: hit.site.slug, url: siteUrl(hit.site.slug, req), reason: parsed.data.reason, details: parsed.data.details,
      from: parsed.data.email ?? "", ip, adminUrl: `${baseUrl(req)}/admin/sites?q=${encodeURIComponent(hit.site.slug)}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ route: "report", error: String(e) }));
    return fail("Couldn’t send your report — try again in a minute.", 503);
  }
}
