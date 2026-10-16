import Link from "next/link";
import { BookOpen, CircleHelp, MessageCircleQuestion } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/transactions";
import { Panel } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help & Support — First Meridian" };

const FAQS = [
  { question: "Why did I land on the sign-in page?", answer: "A protected page needs a valid session. Sign in again if your session expired. Ordinary account, activity, transfer and service links should keep you signed in; the mobile Sign out control is inside the Menu." },
  { question: "Can I send money to another member?", answer: "Use Send money / Quick Pay to submit a request to another First Meridian member. It stays unposted until an admin approves it and does not contact an external payment network." },
  { question: "How can I receive money?", answer: "Use Receive money to request funds from another member. If they choose to pay, the internal transfer still needs admin approval before either balance changes. External incoming transfers are not enabled." },
  { question: "Does mobile check deposit process my check?", answer: "No. Check images stay on your device and are not uploaded. The request must be approved before a balance changes; no bank processes the check." },
  { question: "Are ACH deposits and bill payments real?", answer: "No bank payment is sent. A configured Stripe checkout accepts test keys only and creates a request that still needs admin approval. Bill Pay records a request but does not pay an outside biller." },
  { question: "Where are statements and card controls?", answer: "Open Services from the bottom navigation (or Menu from the top), then choose Statements & documents or Cards & products. They are also available from the desktop navigation." },
];

export default async function HelpPage() {
  await requireUser();
  return (
    <div>
      <PageHeader title="Help & Support" subtitle="Answers about First Meridian services and account activity." />
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
            <p className="mt-2">There is no live contact center, account servicing team, fraud monitoring or emergency support. Do not enter real banking credentials or rely on this product for payments.</p>
            <Link href="/services" className="mt-3 inline-flex items-center gap-1 font-semibold text-bank-link underline underline-offset-2"><BookOpen className="h-3.5 w-3.5" /> View all services</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
