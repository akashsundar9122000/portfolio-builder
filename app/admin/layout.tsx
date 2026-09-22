import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-[min(1100px,100%-2rem)] py-10">{children}</main>;
}
