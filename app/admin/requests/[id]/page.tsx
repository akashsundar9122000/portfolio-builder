import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdmin, requestSigOk } from "@/lib/server/admin";
import { codeDetails, getRequest, previewCode } from "@/lib/server/codes";
import { StatusChip, rowState, when } from "@/components/admin/status";
import { RequestActions } from "@/components/admin/admin-actions";

// reads the admin cookie on every request
export const dynamic = "force-dynamic";

export default async function AdminRequest({ params, searchParams }: PageProps<"/admin/requests/[id]">) {
  const { id } = await params;
  const sig = String((await searchParams).sig ?? "");
  if (!(await isAdmin())) redirect(`/admin/login?next=${encodeURIComponent(`/admin/requests/${id}?sig=${sig}`)}`);
  if (!requestSigOk(id, sig)) notFound();

  const request = await getRequest(id);
  if (!request) notFound();
  const code = request.code ? await codeDetails(request.code) : undefined;
  const state = rowState({ request, code });
  const firstCode = request.status === "pending" ? await previewCode() : undefined;

  const facts: [string, React.ReactNode][] = [
    ["Name", request.name],
    ["Email", <a key="e" className="text-accent underline-offset-4 hover:underline" href={`mailto:${request.email}`}>{request.email}</a>],
    ["Reason", request.reason || <span key="r" className="text-text-3">—</span>],
    ["Requested", when(request.createdAt)],
    ["IP", <span key="ip" className="font-mono">{request.ip}</span>],
  ];
  if (request.decidedAt) facts.push([request.status === "rejected" ? "Rejected" : "Sent", when(request.decidedAt)]);
  if (request.note) facts.push(["Note", <span key="n" className="whitespace-pre-line">{request.note}</span>]);
  if (code) {
    facts.push(["Code", <span key="c" className="font-mono text-base">{code.code}</span>]);
    facts.push(["Valid until", when(code.expiresAt)]);
    facts.push(["Downloads", (["zip", "html"] as const).map((k) => `${k.toUpperCase()} ${code.downloads.includes(k) ? "✓" : "—"}`).join("   ")]);
    if (code.usedAt) facts.push(["Used up", when(code.usedAt)]);
    if (code.revokedAt) facts.push(["Revoked", when(code.revokedAt)]);
    if (code.revokeReason) facts.push(["Revoke reason", <span key="rr" className="whitespace-pre-line">{code.revokeReason}</span>]);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin" className="btn"><ArrowLeft className="size-4" aria-hidden /> All requests</Link>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Code request</h1>
        <StatusChip state={state} />
      </div>
      <dl className="card mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 p-6 text-sm">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-text-3">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <RequestActions id={id} sig={sig} state={state} firstCode={firstCode} email={request.email} issuedCode={request.code} />
    </div>
  );
}
