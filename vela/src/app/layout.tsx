import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

// Use the production URL as the canonical share origin so preview builds or local
// development settings cannot emit localhost or a stale host in social metadata.
const siteUrl = "https://myfmb2.netlify.app";
const shareImage = new URL("/fmb-social.png", siteUrl);

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#002855",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${BRAND.name} — Retail Banking`,
  description:
    `Explore checking, savings, cards, and helpful account tools from ${BRAND.name}.`,
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: BRAND.name,
    title: `${BRAND.name} — Retail Banking`,
    description: `Everyday banking, made clear and simple. Explore checking, savings, and card features from ${BRAND.name}.`,
    images: [{ url: shareImage, width: 1200, height: 630, alt: `${BRAND.name} — Banking that moves with you` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — Retail Banking`,
    description: `Everyday banking, made clear and simple.`,
    images: [shareImage],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
