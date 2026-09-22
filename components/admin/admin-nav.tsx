import Link from "next/link";

/** Switch between the admin lists. */
export function AdminNav({ current }: { current: "codes" | "sites" }) {
  const tab = (id: "codes" | "sites", href: string, label: string) => (
    <Link href={href} aria-current={current === id ? "page" : undefined} className={`chip ${current === id ? "border-accent text-accent" : ""}`}>{label}</Link>
  );
  return <nav aria-label="Admin sections" className="mt-4 flex gap-2">{tab("codes", "/admin", "Access codes")}{tab("sites", "/admin/sites", "Published sites")}</nav>;
}
