import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Portfolio Builder — by Akash Sundar", template: "%s — Portfolio Builder" },
  description: "Build a cinematic personal portfolio in minutes: your photo, your voice, your work. Download it as a website.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0b0b0d", colorScheme: "dark", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-svh">{children}</body>
    </html>
  );
}
