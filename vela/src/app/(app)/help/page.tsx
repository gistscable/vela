import Link from "next/link";
import { BookOpen, CircleHelp, MessageCircleQuestion } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/transactions";
import { Panel } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help & Support — FMB" };

const FAQS = [
  { question: "Why did I land on the sign-in page?", answer: "A protected page needs a valid session. Sign in again if your session expired. Ordinary account, activity, transfer and service links should keep you signed in; the mobile Sign out control is inside the Menu." },
  { question: "Can I send money to another member?", answer: "Use Send money / Quick Pay to send funds to another FMB member. Payments appear in account activity as they are processed." },
  { question: "How can I receive money?", answer: "Use Receive money to request funds from another member. If they choose to pay, the transfer appears in account activity as it is processed." },
  { question: "How does mobile check deposit work?", answer: "Check images stay on your device. Your deposit appears in account activity as it is processed." },
  { question: "How do ACH deposits and bill payments work?", answer: "Deposit and bill payment details appear in account activity as they are processed." },
  { question: "Where are statements and card controls?", answer: "Open Services from the bottom navigation (or Menu from the top), then choose Statements & documents or Cards & products. They are also available from the desktop navigation." },
  { question: "How do I open another account or get a card?", answer: "Use Open an account from Account Summary or Services. You can apply for business checking and savings, extra personal accounts, a debit card on a checking account, or a credit card. Each application is reviewed; after approval the product appears below your existing accounts (cards in the Cards section). An administrator can also credit deposit accounts and credit cards." },
  { question: "Why does older activity keep appearing?", answer: "If generated history was included when the account was approved, the same pattern of payroll, bills, transfers, debits and credits continues after opening so the ledger stays current as days pass. An administrator can pause or resume that generated activity, delete individual entries, or lock an account and record a reason." },
];

export default async function HelpPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="Help & Support" subtitle="Answers about FMB services and account activity." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="Common questions" bodyClassName="divide-y divide-gray-200 p-0">
          {FAQS.map((faq) => (
            <details key={faq.question} className="group px-4 py-3.5 sm:px-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12.5px] font-semibold text-gray-900">
                <span className="flex items-center gap-2"><CircleHelp className="h-4 w-4 shrink-0 text-bank-navy" />{faq.question}</span>
                <span className="text-gray-400 group-open:rotate-180">⌄</span>
              </summary>
              <p className="mt-3 pl-6 text-[11.5px] leading-relaxed text-gray-600">{faq.answer}</p>
            </details>
          ))}
        </Panel>
        <aside className="space-y-4">
          <Panel title="Go to a service" bodyClassName="space-y-2 p-4">
            {[
              ["Send or transfer", "/transfer?tab=transfer"],
              ["Receive money", "/receive"],
              ["Mobile deposit", "/mobile-deposit"],
              ["Bill Pay", "/bill-pay"],
            ].map(([label, href]) => <Link key={href} href={href} className="block text-[11.5px] font-semibold text-bank-link underline underline-offset-2">{label}</Link>)}
          </Panel>
          <div className="border border-gray-300 bg-gray-50 p-4 text-[11px] leading-relaxed text-gray-600">
            <h2 className="flex items-center gap-2 text-[12px] font-bold text-bank-navy"><MessageCircleQuestion className="h-4 w-4" /> About support</h2>
            <p className="mt-2">Contact us through Help & Support for help with your account, transfers, deposits and other services.</p>
            <Link href="/services" className="mt-3 inline-flex items-center gap-1 font-semibold text-bank-link underline underline-offset-2"><BookOpen className="h-3.5 w-3.5" /> View all services</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
