import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteSigOk, siteUrl } from "@/lib/server/admin";
import { getSite } from "@/lib/server/sites";
import { BrandLogo } from "@/components/brand";
import { UnpublishOwn } from "@/components/sites/unpublish-own";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage your portfolio", robots: { index: false, follow: false } };

/** Reached from the private link in the "your portfolio is live" email. */
export default async function ManageSite({ params, searchParams }: PageProps<"/manage/[id]">) {
  const { id } = await params;
  const sig = String((await searchParams).sig ?? "");
  if (!siteSigOk(id, sig)) notFound();
  const site = await getSite(id);
  if (!site || site.status === "pending") notFound();
  const url = siteUrl(site.slug);
  return (
    <main className="spot-bg grid min-h-svh place-items-center px-4 py-16">
      <div className="card w-full max-w-lg p-7">
        <BrandLogo size={34} />
        <h1 className="mt-6 text-2xl font-semibold">Your published portfolio</h1>
        {site.status === "live" ? (
          <>
            <p className="text-text-2 mt-3">It’s online at</p>
            <a href={url} target="_blank" rel="noopener" className="text-accent mt-1 block break-all font-mono underline underline-offset-4">{url}</a>
            <p className="text-text-3 mt-5 text-sm">Unpublishing takes it offline and deletes its files from our storage. The address stays reserved for you — republish with a valid code any time.</p>
            <UnpublishOwn id={id} sig={sig} />
          </>
        ) : (
          <p className="text-text-2 mt-3">This portfolio is no longer online{site.status === "removed" ? " — it was taken down by FolioForge" : ""}.</p>
        )}
      </div>
    </main>
  );
}
