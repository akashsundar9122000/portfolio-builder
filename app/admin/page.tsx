import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin, requestSig } from "@/lib/server/admin";
import { listRequests, StoreMissing, type RequestRow } from "@/lib/server/codes";
import { StatusChip, rowState, when, type RowState } from "@/components/admin/status";
import { AdminSignOut, RevokeButton } from "@/components/admin/admin-actions";

// reads the admin cookie on every request
export const dynamic = "force-dynamic";

const FILTERS: ("all" | RowState)[] = ["all", "pending", "active", "used", "expired", "revoked", "rejected"];

export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  if (!(await isAdmin())) redirect("/admin/login?next=/admin");
  const f = String((await searchParams).status ?? "all");
  const filter = (FILTERS as string[]).includes(f) ? f : "all";

  let rows: RequestRow[] = [];
  let problem = "";
  try {
    rows = await listRequests(200);
  } catch (e) {
    problem = e instanceof StoreMissing ? e.message : "Couldn’t reach the code store.";
  }
  const counts = Object.fromEntries(FILTERS.map((k) => [k, k === "all" ? rows.length : rows.filter((r) => rowState(r) === k).length]));
  const shown = filter === "all" ? rows : rows.filter((r) => rowState(r) === filter);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-accent">FolioForge · Admin</p>
          <h1 className="mt-3 text-2xl font-semibold">Access codes</h1>
          <p className="text-text-2 mt-1 text-sm">Requests from the last 30 days, newest first.</p>
        </div>
        <AdminSignOut />
      </div>

      {problem && <p role="alert" className="border-danger/40 bg-danger/10 text-danger mt-6 rounded-xl border px-4 py-3 text-sm">{problem}</p>}

      <nav aria-label="Filter by status" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((k) => (
          <Link key={k} href={k === "all" ? "/admin" : `/admin?status=${k}`} aria-current={filter === k ? "page" : undefined} className={`chip ${filter === k ? "border-accent text-accent" : ""}`}>
            {k} <span className="text-text-3">{counts[k]}</span>
          </Link>
        ))}
      </nav>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="label">
            <tr className="border-hair border-b">
              <th scope="col" className="px-4 py-3 font-normal">Requested</th>
              <th scope="col" className="px-4 py-3 font-normal">Who</th>
              <th scope="col" className="px-4 py-3 font-normal">Code</th>
              <th scope="col" className="px-4 py-3 font-normal">Downloads</th>
              <th scope="col" className="px-4 py-3 font-normal">Status</th>
              <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.request.id} className="border-hair border-b last:border-0">
                <td className="text-text-2 whitespace-nowrap px-4 py-3">{when(r.request.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link className="hover:text-accent underline-offset-4 hover:underline" href={`/admin/requests/${r.request.id}?sig=${requestSig(r.request.id)}`}>
                    {r.request.name}
                  </Link>
                  <div className="text-text-3">{r.request.email}</div>
                </td>
                <td className="px-4 py-3 font-mono">{r.request.code ?? "—"}</td>
                <td className="text-text-2 px-4 py-3">{r.code ? (["zip", "html"] as const).map((k) => `${k.toUpperCase()} ${r.code!.downloads.includes(k) ? "✓" : "·"}`).join("  ") : "—"}</td>
                <td className="px-4 py-3"><StatusChip state={rowState(r)} /></td>
                <td className="px-4 py-3 text-right">
                  {rowState(r) === "active" && r.request.code && (
                    <RevokeButton compact id={r.request.id} sig={requestSig(r.request.id)} email={r.request.email} code={r.request.code} />
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td colSpan={6} className="text-text-3 px-4 py-10 text-center">Nothing here yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
