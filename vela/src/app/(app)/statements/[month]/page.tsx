import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getStatementsData } from "@/lib/queries";
import { formatDate, formatCents, maskAccountNumber } from "@/lib/money";
import { safeCounterparty, safeTransactionDescription } from "@/lib/external-account-display";
import { PrintButton } from "@/components/PrintButton";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Statement — First Meridian Bank" };

export default async function StatementPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const user = await requireUser();
  const { month } = await params;
  const { accounts, statements } = await getStatementsData(user.id);
  const statement = statements.find((s) => s.key === month);
  if (!statement) notFound();

  return (
    <div>
      <div className="no-print mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <Link
          href="/statements"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Statements &amp; Documents
        </Link>
        <PrintButton />
      </div>

      <div className="print-area mx-auto max-w-3xl border border-gray-300 bg-white shadow-panel">
        {/* Statement letterhead */}
        <div className="flex flex-col justify-between gap-3 border-b-2 border-bank-navy px-8 pb-5 pt-7 sm:flex-row sm:items-start">
          <div>
            <p className="text-[20px] font-bold tracking-tight text-bank-navy">
              First Meridian<span className="font-normal"> Bank</span>
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-bank-red">Monthly account statement</p>
          </div>
          <div className="text-right text-[12px]">
            <p className="font-bold text-gray-900">{statement.label}</p>
            <p className="mt-1 text-gray-600">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-gray-600">{user.email}</p>
          </div>
        </div>

        <div className="px-8 py-6">
          {/* Accounts */}
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">Accounts</h2>
          <table className="mt-2.5 w-full border border-gray-200 text-left text-[12px]">
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-bold text-gray-900">{a.name}</p>
                    <p className="text-[10.5px] text-gray-500">
                      {maskAccountNumber(a.accountNumber)} · {a.type}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-gray-900">
                    {formatCents(a.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div className="mt-5 grid grid-cols-3 border border-gray-200">
            <div className="border-r border-gray-200 bg-emerald-50 px-4 py-3">
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-emerald-800">Total credits</p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums text-emerald-800">
                {formatCents(statement.inflow, { sign: true })}
              </p>
            </div>
            <div className="border-r border-gray-200 px-4 py-3">
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-gray-500">Total debits</p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums text-gray-800">-{formatCents(statement.outflow)}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-gray-500">Net change</p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums text-gray-800">
                {formatCents(statement.inflow - statement.outflow, { sign: true })}
              </p>
            </div>
          </div>

          {/* Transactions */}
          <h2 className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
            Transactions ({statement.transactions.length})
          </h2>
          <table className="mt-2.5 w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-y border-gray-300 bg-gray-50 text-left text-[9.5px] uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-bold">Date</th>
                <th className="py-2 pr-3 font-bold">Description</th>
                <th className="hidden py-2 pr-3 font-bold sm:table-cell">Category</th>
                <th className="py-2 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {statement.transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="whitespace-nowrap py-2 pr-3 text-gray-600">
                    {formatDate(t.createdAt, { month: "short", day: "numeric" })}
                  </td>
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-gray-900">{safeTransactionDescription(t.description)}</p>
                    {t.counterparty && <p className="text-[10px] text-gray-500">{safeCounterparty(t.counterparty)}</p>}
                    {t.status !== "COMPLETED" && <p className="text-[10px] font-semibold text-amber-800">{t.status === "PENDING_APPROVAL" ? "Awaiting approval · not posted" : t.status === "REJECTED" ? "Rejected · not posted" : t.status.toLowerCase().replaceAll("_", " ")}</p>}
                  </td>
                  <td className="hidden py-2 pr-3 text-gray-600 sm:table-cell">{t.category}</td>
                  <td
                    className={`whitespace-nowrap py-2 text-right font-semibold tabular-nums ${
                      t.amount > 0 ? "text-emerald-700" : "text-gray-900"
                    }`}
                  >
                    {formatCents(t.amount, { sign: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 border-t border-gray-200 pt-4">
            <p className="text-[9px] leading-relaxed text-gray-500">
              <strong className="text-gray-600">Important information about this statement:</strong> If
              you have questions about this statement, contact First Meridian Bank. Generated on {formatDate(new Date())}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
