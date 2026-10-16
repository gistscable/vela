"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Camera,
  CreditCard,
  FileText,
  HandCoins,
  HelpCircle,
  History,
  House,
  Landmark,
  LogOut,
  Menu,
  ReceiptText,
  Send,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { logoutAction } from "@/lib/actions";
import { PreviewNavigationFallback } from "./PreviewNavigationFallback";
import { Logo } from "./Logo";

const TABS = [
  { href: "/dashboard", label: "Accounts Overview" },
  { href: "/transfer", label: "Transfers" },
  { href: "/bill-pay", label: "Bill Pay" },
  { href: "/cards", label: "Card Services" },
  { href: "/statements", label: "Statements & Documents" },
  { href: "/transactions", label: "Account Activity" },
  { href: "/services", label: "Services" },
  { href: "/settings", label: "Settings" },
];

const MORE_LINKS = [
  { href: "/transfer?tab=send", label: "Send money", icon: Send },
  { href: "/receive", label: "Receive money", icon: HandCoins },
  { href: "/mobile-deposit", label: "Deposit a check", icon: Camera },
  { href: "/transfer?tab=deposit", label: "Add funds from bank", icon: Landmark },
  { href: "/bill-pay", label: "Pay bills", icon: ReceiptText },
  { href: "/cards", label: "Cards & products", icon: CreditCard },
  { href: "/transactions", label: "Recent activity", icon: History },
  { href: "/statements", label: "Statements & documents", icon: FileText },
  { href: "/linked-accounts", label: "Linked accounts", icon: Landmark },
  { href: "/services", label: "All services", icon: Menu },
  { href: "/help", label: "Help & support", icon: HelpCircle },
  { href: "/settings", label: "Services & settings", icon: Settings },
];

export function AppShell({
  user,
  children,
  sharedPreview = false,
}: {
  user: { firstName: string; lastName: string; email: string; isAdmin: boolean };
  children: React.ReactNode;
  sharedPreview?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const mobileTransferTab = pathname === "/transfer" && searchParams.get("tab") === "deposit" ? "deposit" : "transfer";
  const tabs = user.isAdmin ? [...TABS, { href: "/admin", label: "Admin approvals" }] : TABS;
  const moreLinks = user.isAdmin ? [...MORE_LINKS, { href: "/admin", label: "Admin approvals", icon: ShieldCheck }] : MORE_LINKS;
  const isServicePath = ["/receive", "/mobile-deposit", "/services", "/bill-pay", "/cards", "/transactions", "/statements", "/linked-accounts", "/help", "/settings", "/admin"].some((href) => pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="flex min-h-screen flex-col bg-bank-bg">
      {sharedPreview && <PreviewNavigationFallback enabled />}
      <header className="sticky top-0 z-30 border-b border-gray-300 bg-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-3 py-2.5 sm:px-4 md:py-3">
          {/* Desktop web header */}
          <div className="hidden w-full items-center justify-between md:flex">
            <Link href="/dashboard" aria-label="First Meridian Bank Account Summary" className="flex items-center gap-4">
              <Logo />
              <span className="border-l border-gray-300 pl-4 text-[13px] font-semibold text-gray-600">Online Banking</span>
            </Link>
            <div className="flex items-center gap-4 text-[11.5px]">
              <Link href="/help" className="flex items-center gap-1 text-gray-600 hover:text-bank-navy hover:underline">
                <HelpCircle className="h-3.5 w-3.5" /> Help
              </Link>
              <div className="text-right">
                <p className="font-semibold text-bank-navy">Welcome, {user.firstName} {user.lastName}</p>
                <p className="text-[10px] text-gray-500">{sharedPreview ? "Shared account" : "Online Banking · Secure session"}</p>
              </div>
              {!sharedPreview && (
                <form action={logoutAction}>
                  <button type="submit" title="Sign out" className="inline-flex h-8 items-center gap-1.5 rounded border border-gray-400 bg-white px-3 text-[11.5px] font-bold text-bank-navy hover:bg-gray-50">
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Compact mobile app header */}
          <div className="flex w-full items-center justify-between md:hidden">
            <button type="button" onClick={() => setMoreOpen(true)} aria-label="Open menu" className="flex min-h-11 min-w-11 flex-col items-center justify-center text-gray-600">
              <Menu className="h-5 w-5" />
              <span className="mt-0.5 text-[9px]">Menu</span>
            </button>
            <Link href="/dashboard" aria-label="First Meridian accounts"><Logo compact /></Link>
            <div className="flex items-center gap-1">
              <Link href="/transactions" aria-label="Recent activity" className="flex min-h-11 min-w-10 flex-col items-center justify-center text-gray-600">
                <History className="h-5 w-5" />
                <span className="mt-0.5 text-[8px]">Activity</span>
              </Link>
              <Link href="/cards" aria-label="Cards and products" className="flex min-h-11 min-w-10 flex-col items-center justify-center text-gray-600">
                <CreditCard className="h-5 w-5" />
                <span className="mt-0.5 text-[8px]">Products</span>
              </Link>
            </div>
          </div>
        </div>
      </header>


      {/* Desktop banking navigation. Mobile uses the bottom app dock below. */}
      <nav className="hidden border-b border-gray-300 bg-bank-navy md:block" aria-label="Online Banking">
        <div className="mx-auto flex max-w-[1180px] gap-0 overflow-x-auto px-4">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link key={tab.href} href={tab.href} className={`whitespace-nowrap border-b-[3px] px-4 py-3 text-[12.5px] font-semibold transition-colors ${active ? "border-bank-red bg-bank-navyDark text-white" : "border-transparent text-white/75 hover:bg-white/10 hover:text-white"}`}>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="flex-1">
        <div className="mx-auto max-w-[1180px] px-3 pb-28 pt-4 sm:px-4 md:py-7 md:pb-7">{children}</div>
      </main>

      <footer className="hidden border-t border-gray-300 bg-white md:block">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-[10.5px] text-gray-500">
          {sharedPreview && <span>This shared account's activity and saved destinations may change.</span>}
          <span>© 2026 First Meridian Bank.</span>
          <nav className="ml-auto flex flex-wrap gap-4" aria-label="Footer links">
            <Link href="/help" className="hover:text-bank-link hover:underline">Help & support</Link>
            <Link href="/services" className="hover:text-bank-link hover:underline">Services</Link>
            <Link href="/settings" className="hover:text-bank-link hover:underline">Settings</Link>
          </nav>
        </div>
      </footer>
      <footer className="border-t border-gray-200 bg-white px-4 py-3 text-center text-[10px] leading-relaxed text-gray-500 md:hidden">
        <p>© 2026 First Meridian Bank.{sharedPreview ? " This shared account's activity and saved destinations may change." : ""}</p>
        <nav className="mt-2 flex justify-center gap-4" aria-label="Footer links">
          <Link href="/help" className="font-semibold text-bank-link underline underline-offset-2">Help</Link>
          <Link href="/services" className="font-semibold text-bank-link underline underline-offset-2">Services</Link>
          <Link href="/settings" className="font-semibold text-bank-link underline underline-offset-2">Settings</Link>
        </nav>
      </footer>

      {moreOpen && (
        <>
          <button className="fixed inset-0 z-30 bg-black/30 md:hidden" aria-label="Close services menu" onClick={() => setMoreOpen(false)} />
          <div className="fixed inset-x-3 bottom-[70px] z-40 max-h-[calc(100dvh-6rem)] overflow-y-auto border border-gray-300 bg-white shadow-dropdown md:hidden" role="dialog" aria-label="More banking services">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <p className="text-[13px] font-bold text-bank-navy">Menu & services</p>
                <p className="text-[10px] text-gray-500">{sharedPreview ? "Shared account" : `Signed in as ${user.firstName} ${user.lastName}`}</p>
              </div>
              <button onClick={() => setMoreOpen(false)} aria-label="Close menu" className="p-2 text-gray-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 divide-y divide-gray-100">
              {moreLinks.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className="flex min-h-11 items-center gap-3 px-4 py-3 text-[12px] font-semibold text-bank-link">
                  <item.icon className="h-4 w-4 text-bank-navy" /> {item.label}
                </Link>
              ))}
            </div>
            {!sharedPreview && (
              <div className="border-t border-gray-200 p-3">
                <form action={logoutAction}>
                  <button type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 border border-gray-300 bg-white px-4 text-[12px] font-semibold text-gray-700 hover:bg-gray-50">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-300 bg-white shadow-[0_-3px_12px_rgba(0,0,0,0.08)] md:hidden" aria-label="Mobile banking">
        <div className="mx-auto grid max-w-[520px] grid-cols-4" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <MobileNavLink href="/dashboard" label="Accounts" active={pathname === "/dashboard" || pathname.startsWith("/accounts")} icon={House} />
          <MobileNavLink href="/transfer?tab=transfer" label="Pay & Transfer" active={pathname === "/transfer" && mobileTransferTab === "transfer"} icon={ArrowLeftRight} />
          <MobileNavLink href="/mobile-deposit" label="Deposit" active={pathname === "/mobile-deposit" || (pathname === "/transfer" && mobileTransferTab === "deposit")} icon={ArrowDownToLine} />
          <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} className={`flex min-h-[58px] flex-col items-center justify-center gap-1 border-t-[3px] px-1 text-[9.5px] font-semibold ${moreOpen || isServicePath ? "border-bank-red text-bank-navy" : "border-transparent text-gray-500"}`}>
            {moreOpen ? <X className="h-[17px] w-[17px]" /> : <Menu className="h-[17px] w-[17px]" />}
            Services
          </button>
        </div>
      </nav>
    </div>
  );
}

function MobileNavLink({ href, label, active, icon: Icon }: { href: string; label: string; active: boolean; icon: LucideIcon }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[58px] flex-col items-center justify-center gap-1 border-t-[3px] px-1 text-[9.5px] font-semibold ${active ? "border-bank-red text-bank-navy" : "border-transparent text-gray-500"}`}>
      <Icon className="h-[17px] w-[17px]" />
      {label}
    </Link>
  );
}
