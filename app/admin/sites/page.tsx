import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { isAdmin, siteUrl } from "@/lib/server/admin";
import { listSites, siteBytes, type Site } from "@/lib/server/sites";
import { AdminSignOut } from "@/components/admin/admin-actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { TakeDownButton } from "@/components/admin/site-actions";
import { when } from "@/components/admin/status";

// reads the admin cookie on every request
export const dynamic = "force-dynamic";

const TONE: Record<Site["status"], string> = {
  live: "border-ok/50 text-ok",
  unpublished: "border-hair-strong text-text-3",
  removed: "border-danger/40 text-danger",
  pending: "border-hair-strong text-text-3",
};
const mb = (n: number) => (n / 1048576).toFixed(1) + " MB";

export default async function AdminSites({ searchParams }: PageProps<"/admin/sites">) {
  if (!(await isAdmin())) redirect("/admin/login?next=/admin/sites");
  const q = String((await searchParams).q ?? "").trim().toLowerCase();
  let sites: Site[] = [];
  let problem = "";
  try {
    sites = await listSites(300);
  } catch {
    problem = "Couldn’t reach the site store.";
  }
  const shown = q ? sites.filter((s) => s.slug.includes(q) || s.owner.includes(q) || s.oldSlugs.some((o) => o.includes(q))) : sites;
  const total = sites.filter((s) => s.status === "live").reduce((a, s) => a + siteBytes(s), 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-accent">FolioForge · Admin</p>
          <h1 className="mt-3 text-2xl font-semibold">Published sites</h1>
          <p className="text-text-2 mt-1 text-sm">{sites.filter((s) => s.status === "live").length} live · {mb(total)} of the 1 GB free storage</p>
        </div>
        <AdminSignOut />
      </div>
      <AdminNav current="sites" />
      {problem && <p role="alert" className="border-danger/40 bg-danger/10 text-danger mt-6 rounded-xl border px-4 py-3 text-sm">{problem}</p>}

      <form className="mt-6 flex gap-2" role="search">
        <label htmlFor="site-q" className="sr-only">Search sites</label>
        <input id="site-q" name="q" defaultValue={q} placeholder="Search by name or email" className="input max-w-sm" />
        <button type="submit" className="btn">Search</button>
        {q && <Link href="/admin/sites" className="btn">Clear</Link>}
      </form>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="label">
            <tr className="border-hair border-b">
              <th scope="col" className="px-4 py-3 font-normal">Site</th>
              <th scope="col" className="px-4 py-3 font-normal">Owner</th>
              <th scope="col" className="px-4 py-3 font-normal">Updated</th>
              <th scope="col" className="px-4 py-3 font-normal">Size</th>
              <th scope="col" className="px-4 py-3 font-normal">Status</th>
              <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="border-hair border-b last:border-0">
                <td className="px-4 py-3">
                  <a href={`/p/${s.slug}`} target="_blank" rel="noopener" className="hover:text-accent inline-flex items-center gap-1.5 font-mono">/p/{s.slug} <ExternalLink className="size-3.5" aria-hidden /></a>
                  {s.oldSlugs.length > 0 && <div className="text-text-3 text-xs">was {s.oldSlugs.map((o) => `/p/${o}`).join(", ")}</div>}
                </td>
                <td className="text-text-2 px-4 py-3">{s.owner === "master" ? "master code" : s.owner}</td>
                <td className="text-text-2 whitespace-nowrap px-4 py-3">{when(s.updatedAt)}</td>
                <td className="text-text-2 px-4 py-3">{s.status === "live" ? mb(siteBytes(s)) : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`chip min-h-7 ${TONE[s.status]}`}>{s.status === "removed" ? "taken down" : s.status}</span>
                  {s.unpublishReason && <div className="text-text-3 mt-1 max-w-48 truncate text-xs" title={s.unpublishReason}>{s.unpublishReason}</div>}
                </td>
                <td className="px-4 py-3 text-right">{s.status === "live" && <TakeDownButton id={s.id} url={siteUrl(s.slug)} owner={s.owner} />}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="text-text-3 px-4 py-10 text-center">{q ? "No sites match." : "No published sites yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
