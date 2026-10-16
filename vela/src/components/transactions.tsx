import Link from "next/link";
import { Clock3, FileText } from "lucide-react";
import { formatCents, formatDateTime } from "@/lib/money";
import { paymentMethodLabel, safeCounterparty, safeTransactionDescription } from "@/lib/external-account-display";
import type { Transaction } from "@prisma/client";

/** Plain, ledger-style row: merchant/date on the left, signed amount on the right. */
export function TransactionRow({ tx, dense = false }: { tx: Transaction; dense?: boolean }) {
  const credit = tx.amount > 0;
  const statusLabel: string | null =
    tx.status === "PENDING_APPROVAL" ? "Awaiting approval" :
      tx.status === "PROCESSING_APPROVAL" ? "Being reviewed" :
        tx.status === "REJECTED" ? "Rejected · not posted" :
          tx.status === "PENDING" ? "Pending" :
            tx.status === "FAILED" ? "Failed" : null;
  const description = safeTransactionDescription(tx.description);
  const counterparty = safeCounterparty(tx.counterparty);
  const method = paymentMethodLabel(tx.paymentMethod);

  return (
    <div className={`flex items-center justify-between gap-3 border-b border-gray-200 last:border-0 ${dense ? "px-4 py-3" : "px-5 py-4"}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-gray-900">
          {description}
          {method && <span className="ml-1.5 inline-flex rounded-sm border border-gray-300 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-gray-600">{method}</span>}
        </p>
        <p className="mt-0.5 truncate text-[10.5px] text-gray-500">
          {counterparty ? `${counterparty} · ` : ""}{formatDateTime(tx.createdAt)}
          {statusLabel && <span className={`ml-1.5 font-semibold ${tx.status === "FAILED" || tx.status === "REJECTED" ? "text-bank-red" : tx.status === "PENDING_APPROVAL" || tx.status === "PROCESSING_APPROVAL" ? "text-amber-800" : "text-gray-600"}`}>· {statusLabel}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`whitespace-nowrap text-[13px] font-medium tabular-nums ${credit ? "text-bank-blueDark" : "text-gray-900"}`}>
          {formatCents(tx.amount, { sign: true })}
        </p>
        <Link href={`/transactions/${tx.id}`} className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark">
          <FileText className="h-3 w-3" /> Receipt
        </Link>
      </div>
    </div>
  );
}

export function TransactionList({
  transactions,
  emptyTitle = "No transactions yet",
  emptyBody = "Money movement will show up here.",
  dense = false,
}: {
  transactions: Transaction[];
  emptyTitle?: string;
  emptyBody?: string;
  dense?: boolean;
}) {
  if (transactions.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-[13px] font-bold text-gray-700">{emptyTitle}</p>
        <p className="mt-1 text-[12px] text-gray-500">{emptyBody}</p>
      </div>
    );
  }
  return (
    <div>
      {transactions.map((tx) => (
        <TransactionRow key={tx.id} tx={tx} dense={dense} />
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 border-b border-gray-300 pb-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[24px] font-bold leading-tight text-bank-navy">{title}</h1>
          {subtitle && <p className="mt-1 text-[12px] text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

export function Toast({ kind }: { kind?: string }) {
  const messages: Record<string, string> = {
    deposit: "Your deposit request is awaiting approval. The account balance has not changed, and no bank payment was sent.",
    "mobile-deposit": "Your mobile deposit request is awaiting approval. No check image was retained and no funds have been posted.",
    withdraw: "Your external transfer request is awaiting approval. No bank payout was sent.",
    transfer: "Your internal transfer request is awaiting approval. Neither account balance has changed.",
    send: "Your Quick Pay request is awaiting approval. No payment network was used.",
  };
  if (!kind || !messages[kind]) return null;
  return (
    <div className="mb-5 flex items-start gap-2.5 border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-950">
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
      <p><strong className="font-bold">Request submitted. </strong>{messages[kind]}</p>
    </div>
  );
}

export function SeeAllLink({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="text-[11.5px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark">
      {label} &gt;
    </Link>
  );
}
