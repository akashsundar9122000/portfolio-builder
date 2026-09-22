import { redirect } from "next/navigation";
import { adminConfigured, isAdmin, safeNext } from "@/lib/server/admin";
import { AdminLogin } from "@/components/admin/admin-login";

// reads the admin cookie on every request
export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const next = safeNext((await searchParams).next as string | undefined);
  if (await isAdmin()) redirect(next);
  return (
    <div className="mx-auto max-w-sm">
      <p className="label text-accent">FolioForge · Admin</p>
      <h1 className="mt-3 text-2xl font-semibold">Sign in</h1>
      {adminConfigured() ? (
        <AdminLogin next={next} />
      ) : (
        <p className="text-text-2 mt-4 text-sm">Set <code>ADMIN_PASSWORD</code> (8+ characters) in the environment to enable the admin pages.</p>
      )}
    </div>
  );
}
