import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Camera,
  CreditCard,
  FileText,
  HandCoins,
  Landmark,
  ReceiptText,
  Settings,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/transactions";
import { Panel } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Services — First Meridian" };

const SERVICES = [
  { href: "/transfer?tab=transfer", title: "Transfer between accounts", body: "Submit a checking-to-savings transfer request for approval.", icon: ArrowLeftRight },
  { href: "/transfer?tab=send", title: "Send money", body: "Submit a member-to-member Quick Pay request for approval.", icon: ArrowUpRight },
  { href: "/receive", title: "Receive money", body: "Request money from another First Meridian member.", icon: HandCoins },
  { href: "/mobile-deposit", title: "Mobile deposit", body: "Submit check details for approval; images stay on your device.", icon: Camera },
  { href: "/transfer?tab=deposit", title: "Add funds from bank", body: "Submit a deposit request or use Stripe test checkout when configured.", icon: Landmark },
  { href: "/bill-pay", title: "Bill Pay", body: "Save billers and submit payment instructions for approval.", icon: ReceiptText },
  { href: "/cards", title: "Card services", body: "View the virtual card, freeze or unfreeze it, and adjust its spending limit.", icon: CreditCard },
  { href: "/transactions", title: "Account activity", body: "Search posted activity and requests awaiting approval.", icon: FileText },
  { href: "/statements", title: "Statements & documents", body: "Review and print monthly account summaries.", icon: FileText },
  { href: "/linked-accounts", title: "Linked accounts", body: "Connect test institutions with Plaid Sandbox when configured.", icon: Landmark },
  { href: "/help", title: "Help & support", body: "Read answers about transfers, deposits, sessions and service limits.", icon: FileText },
  { href: "/settings", title: "Profile & security settings", body: "Manage your profile and sign-in settings.", icon: Settings },
];

export default async function ServicesPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="Services" subtitle="Choose a banking task or manage your account." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map(({ href, title, body, icon: Icon }) => (
          <Link key={href} href={href} className="group block">
            <Panel className="h-full transition-colors group-hover:border-bank-link" bodyClassName="flex h-full items-start gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bank-sand text-bank-navy"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-bank-link group-hover:underline">{title}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-gray-600">{body}</span>
              </span>
            </Panel>
          </Link>
        ))}
      </div>
      <p className="mt-5 border-t border-gray-200 pt-3 text-[10.5px] leading-relaxed text-gray-500">
        Requests remain unposted until approved. No bank payment is sent through these services.
      </p>
    </div>
  );
}
