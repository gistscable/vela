import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${BRAND.name} — Retail Banking`,
  description:
    `Banking products and services from ${BRAND.name}, including checking, savings, cards and Online Banking.`,
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name} — Retail Banking`,
    description: `Everyday banking, made clear and simple. Explore checking, savings, cards and Online Banking from ${BRAND.name}.`,
    images: [{ url: "/fmb-social.png", width: 1200, height: 630, alt: `${BRAND.name} — Banking that moves with you` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — Retail Banking`,
    description: `Everyday banking, made clear and simple.`,
    images: ["/fmb-social.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
