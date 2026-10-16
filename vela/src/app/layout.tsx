import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "First Meridian — Retail Banking",
  description:
    "Banking products and services from First Meridian Bank, including checking, savings, cards and Online Banking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
