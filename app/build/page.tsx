import { Suspense } from "react";
import type { Metadata } from "next";
import { Wizard } from "@/components/wizard/wizard";

export const metadata: Metadata = { title: "Build", robots: { index: false } };

export default function BuildPage() {
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}
