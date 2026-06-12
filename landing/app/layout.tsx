import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReloGo - Your Canadian Relocation Autopilot",
  description:
    "Moving between provinces? ReloGo builds your personalized checklist of licences, registrations, and address updates - so nothing slips through the cracks.",
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
