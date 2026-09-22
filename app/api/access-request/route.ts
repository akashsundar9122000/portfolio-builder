import { NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/guard";
import { StoreMissing, createRequest, discardRequest } from "@/lib/server/codes";
import { mailAdminNewRequest, mailRequestReceived } from "@/lib/server/mail";
import { requestLink } from "@/lib/server/admin";

/** "Get a code": stores the request and emails Akash a link to issue one. */
const Body = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(120),
  reason: z.string().trim().max(300).optional().default(""),
  website: z.string().max(0).optional(), // honeypot: people never see it, bots fill it
});

const REFUSED = {
  "active-code": "You already have an active code — check your inbox (and spam folder) for mail from FolioForge. Codes last 7 days.",
  pending: "Your request is already with us — we’ll email your code once it’s approved, usually within 24 hours.",
  "rate-limited": "Too many requests today. Please try again tomorrow.",
} as const;

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    // a filled honeypot gets a normal-looking success, so bots learn nothing
    if (raw && typeof raw === "object" && "website" in raw && raw.website) return NextResponse.json({ ok: true });
    return fail("Enter your name and a valid email address.");
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  try {
    const r = await createRequest({ ...parsed.data, ip });
    if (!r.ok) return NextResponse.json({ error: REFUSED[r.reason], reason: r.reason }, { status: r.reason === "rate-limited" ? 429 : 409 });
    try {
      await mailAdminNewRequest(r.request, requestLink(r.request.id, req));
    } catch (e) {
      await discardRequest(r.request);
      throw e;
    }
    // the acknowledgement is a courtesy; the request stands even if it fails
    await mailRequestReceived(r.request).catch((e) => console.error(JSON.stringify({ route: "access-request", ack: String(e) })));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StoreMissing) return fail("Code requests aren’t open yet. Please try again later.", 503);
    console.error(JSON.stringify({ route: "access-request", error: e instanceof Error ? e.message : String(e) }));
    return fail("We couldn’t send your request right now. Please try again in a few minutes.", 503);
  }
}
