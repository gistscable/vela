import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "First Meridian — Retail Banking Preview",
  description:
    "A fictional retail-banking product prototype for internal evaluation. No real accounts or funds are offered.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
