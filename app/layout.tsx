import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FolioForge — forge the portfolio your career deserves", template: "%s — FolioForge" },
  applicationName: "FolioForge",
  description: "FolioForge builds a cinematic personal portfolio in minutes: your photo, your voice, your work, your career. Download it as a website.",
  openGraph: { siteName: "FolioForge", title: "FolioForge — forge the portfolio your career deserves" },
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
