import Link from "next/link";
import { FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getStatementsData } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import { Panel } from "@/components/ui";
import { PageHeader } from "@/components/transactions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Statements & Documents — First Meridian Bank" };

export default async function StatementsPage() {
  const user = await requireUser();
  const { statements } = await getStatementsData(user.id);

  return (
    <div>
      <PageHeader
        title="Statements & Documents"
        subtitle="Monthly account statements are generated automatically. Select a statement to view or print."
      />

      {statements.length === 0 ? (
        <Panel>
          <div className="py-10 text-center">
            <p className="text-[13px] font-bold text-gray-700">No statements available</p>
            <p className="mt-1 text-[12px] text-gray-500">Statements appear once your accounts have activity.</p>
          </div>
        </Panel>
      ) : (
        <Panel bodyClassName="p-0">
          <div className="divide-y divide-gray-100 sm:hidden">
            {statements.map((s) => (
              <article key={`mobile-${s.key}`} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/statements/${s.key}`} className="flex min-w-0 items-center gap-2.5 font-bold text-bank-link underline underline-offset-2">
                    <FileText className="h-4 w-4 shrink-0 text-bank-navy" />
                    <span className="truncate">{s.label}</span>
                  </Link>
                  <Link href={`/statements/${s.key}`} className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-bank-link underline underline-offset-2">
                    View &gt;
                  </Link>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[11.5px]">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Total in</p>
                    <p className="mt-1 font-semibold tabular-nums text-emerald-700">{formatCents(s.inflow, { sign: true })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Total out</p>
                    <p className="mt-1 font-semibold tabular-nums text-gray-800">-{formatCents(s.outflow)}</p>
                  </div>
                  <p className="col-span-2 text-[10.5px] text-gray-500">{s.transactions.length} transactions</p>
                </div>
              </article>
            ))}
          </div>
          <table className="hidden w-full text-left text-[13px] sm:table">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-[10.5px] uppercase tracking-wide text-gray-500">
                <th className="px-5 py-2.5 font-semibold">Statement period</th>
                <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Transactions</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total in</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total out</th>
                <th className="px-5 py-2.5 text-right font-semibold">Document</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.key} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <Link href={`/statements/${s.key}`} className="flex items-center gap-2.5 font-bold text-bank-link underline underline-offset-2">
                      <FileText className="h-4 w-4 text-bank-navy" />
                      {s.label}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-3.5 text-gray-600 sm:table-cell">{s.transactions.length}</td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-emerald-700">
                    {formatCents(s.inflow, { sign: true })}
                  </td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-gray-800">
                    -{formatCents(s.outflow)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/statements/${s.key}`} className="text-[11.5px] font-semibold text-bank-link underline underline-offset-2">
                      View statement &gt;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
