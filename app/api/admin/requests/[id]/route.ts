import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/server/guard";
import { baseUrl, isAdmin, passwordMatches, requestSigOk } from "@/lib/server/admin";
import { adminRevoke, getCode, getRequest, issueCode, rejectRequest } from "@/lib/server/codes";
import { mailCode, mailRejected, mailRevoked } from "@/lib/server/mail";

/** Akash's actions on one request: send a code, reject, revoke, or resend the code email. */
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), sig: z.string(), code: z.string().max(20), note: z.string().max(600).default("") }),
  z.object({ action: z.literal("reject"), sig: z.string(), note: z.string().max(600).default("") }),
  z.object({ action: z.literal("revoke"), sig: z.string(), password: z.string().max(200), reason: z.string().max(600).default("") }),
  z.object({ action: z.literal("resend"), sig: z.string() }),
]);

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/requests/[id]">) {
  if (!(await isAdmin())) return fail("Sign in as admin first.", 401);
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Bad request.");
  if (!requestSigOk(id, parsed.data.sig)) return fail("This link isn’t valid.", 403);
  const body = parsed.data;

  try {
    switch (body.action) {
      case "send": {
        const { request, code } = await issueCode(id, body.code, body.note);
        try {
          await mailCode(request, code, baseUrl(req));
        } catch (e) {
          console.error(JSON.stringify({ route: "admin/send", mail: String(e) }));
          return NextResponse.json({ ok: true, code: code.code, mailed: false, error: "The code is saved, but the email failed. Use “Resend email”." });
        }
        return NextResponse.json({ ok: true, code: code.code, mailed: true });
      }
      case "reject": {
        const request = await rejectRequest(id, body.note);
        const mailed = await mailRejected(request).then(() => true, () => false);
        return NextResponse.json({ ok: true, mailed });
      }
      case "revoke": {
        // irreversible, so it asks for the admin password again
        if (!passwordMatches(body.password)) {
          await new Promise((r) => setTimeout(r, 700));
          return fail("Wrong password — the code was not revoked.", 401);
        }
        const r = await getRequest(id);
        if (!r?.code) return fail("This request has no code.");
        const c = await adminRevoke(r.code, body.reason);
        const mailed = await mailRevoked(r, c, baseUrl(req)).then(() => true, (e) => {
          console.error(JSON.stringify({ route: "admin/revoke", mail: String(e) }));
          return false;
        });
        return NextResponse.json({ ok: true, mailed });
      }
      case "resend": {
        const r = await getRequest(id);
        const c = r?.code ? await getCode(r.code) : undefined;
        if (!r || !c) return fail("This request has no code.");
        await mailCode(r, c, baseUrl(req));
        return NextResponse.json({ ok: true, mailed: true });
      }
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong.", 409);
  }
}
