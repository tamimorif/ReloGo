import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ReloGo - Your Canadian Move Checklist",
  description:
    "Moving to another province or territory? ReloGo organizes common government tasks, suggested timing, and official-source links into one personalized checklist.",
  alternates: {
    // Pages with their own paths (/privacy, /terms) override this per-page.
    canonical: "/",
  },
  openGraph: {
    // No title/description here on purpose: they fall back to each page's
    // own metadata, so /privacy and /terms keep their titles in share cards.
    siteName: "ReloGo",
    url: "/",
    type: "website",
    locale: "en_CA",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
