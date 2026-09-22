import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveSlug } from "@/lib/server/sites";
import { siteUrl } from "@/lib/server/admin";
import { BrandLogo } from "@/components/brand";
import { ReportForm } from "@/components/sites/report-form";
import { REPORT_REASONS as REASONS } from "@/lib/report-reasons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report a portfolio", robots: { index: false, follow: false } };

export default async function ReportPage({ params }: PageProps<"/report/[slug]">) {
  const { slug } = await params;
  const hit = await resolveSlug(slug.toLowerCase()).catch(() => undefined);
  if (!hit) notFound();
  return (
    <main className="spot-bg grid min-h-svh place-items-center px-4 py-16">
      <div className="card w-full max-w-lg p-7">
        <BrandLogo size={34} />
        <h1 className="mt-6 text-2xl font-semibold">Report a portfolio</h1>
        <p className="text-text-2 mt-2 break-all text-sm">{siteUrl(hit.site.slug)}</p>
        <p className="text-text-3 mt-3 text-sm">Tell us what’s wrong. Reports go to the FolioForge team, who can take a page down.</p>
        <ReportForm slug={hit.site.slug} reasons={[...REASONS]} />
      </div>
    </main>
  );
}
