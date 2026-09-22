import { NextResponse } from "next/server";
import { fail } from "@/lib/server/guard";
import { isAdmin } from "@/lib/server/admin";
import { previewCode } from "@/lib/server/codes";

/** A fresh, never-issued code to show on the request page. Nothing is reserved until Send. */
export async function POST() {
  if (!(await isAdmin())) return fail("Sign in as admin first.", 401);
  try {
    return NextResponse.json({ code: await previewCode() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t generate a code.", 503);
  }
}
