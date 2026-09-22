import "server-only";
import { NextResponse } from "next/server";
import { currentCode } from "./session";
import type { InviteCode } from "./env";

/** Every AI route starts here: a valid invite session, or 401. */
export async function requireSession(): Promise<InviteCode | NextResponse> {
  const code = await currentCode();
  if (!code) return NextResponse.json({ error: "Your invite session has expired — enter your code again." }, { status: 401 });
  return code;
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
