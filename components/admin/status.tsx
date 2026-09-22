import type { RequestRow } from "@/lib/server/codes";

/** One word for where a request stands: pending, rejected, or its code's state. */
export type RowState = "pending" | "rejected" | "active" | "used" | "expired" | "revoked";

export function rowState(r: RequestRow): RowState {
  if (r.request.status === "pending") return "pending";
  if (r.request.status === "rejected") return "rejected";
  return r.code?.state ?? "revoked";
}

const TONE: Record<RowState, string> = {
  pending: "border-accent/50 text-accent",
  active: "border-ok/50 text-ok",
  used: "border-hair-strong text-text-2",
  expired: "border-hair-strong text-text-3",
  revoked: "border-danger/40 text-danger",
  rejected: "border-danger/40 text-danger",
};

export function StatusChip({ state }: { state: RowState }) {
  return <span className={`chip min-h-7 ${TONE[state]}`}>{state}</span>;
}

export const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
