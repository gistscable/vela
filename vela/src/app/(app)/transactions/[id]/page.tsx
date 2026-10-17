import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, formatDateTime, formatDate, maskAccountNumber } from "@/lib/money";
import { isAdminCreditReference, paymentMethodLabel, safeCounterparty, safeTransactionDescription } from "@/lib/external-account-display";
import { PageHeader } from "@/components/transactions";
import { PrintButton } from "@/components/PrintButton";
import { Panel } from "@/components/ui";

export const metadata: Metadata = { title: "Transaction receipt — FMB" };

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "External transfer",
  TRANSFER_IN: "Transfer received",
  TRANSFER_OUT: "Transfer sent",
  CARD_PURCHASE: "Card purchase",
  PAYMENT: "Bill payment",
  FEE: "Fee",
  INTEREST: "Interest",
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-gray-100 py-3 last:border-0">
      <dt className="text-[12px] text-gray-500">{label}</dt>
      <dd className="max-w-[65%] break-words text-right text-[12px] font-semibold text-gray-900">{children}</dd>
    </div>
  );
}

export default async function TransactionReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const transaction = await db.transaction.findFirst({
    where: { id, account: { userId: user.id } },
    include: { account: true },
  });
  if (!transaction) notFound();

  const billPayment = transaction.paymentMethod === "BILL_PAY" && transaction.reference
    ? await db.billPayment.findFirst({
        where: { userId: user.id, confirmationNumber: transaction.reference },
        include: { payee: true },
      })
    : null;

  const isExternalTransfer = transaction.type === "WITHDRAWAL" && (
    transaction.paymentMethod === "ACH" ||
    transaction.paymentMethod === "WIRE" ||
    /external transfer/i.test(transaction.description)
  );
  const method = paymentMethodLabel(transaction.paymentMethod) ?? TYPE_LABELS[transaction.type] ?? "Account activity";
  const displayStatus =
    transaction.status === "PENDING_APPROVAL" || transaction.status === "PROCESSING_APPROVAL" ? "Processing" :
      transaction.status === "REJECTED" ? "Not completed" :
        transaction.status === "PENDING" ? "Pending" :
          transaction.status === "FAILED" ? "Failed" : "Posted to account";
  const description = safeTransactionDescription(transaction.description);
  const counterparty = isAdminCreditReference(transaction.reference) ? null : safeCounterparty(transaction.counterparty);
  const title = isExternalTransfer ? "External transfer receipt" : "Transaction receipt";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={title}
        subtitle="Transaction details and status"
        actions={(
          <>
            <Link href="/transactions" className="no-print inline-flex h-9 items-center gap-2 border border-gray-400 bg-white px-3 text-[11.5px] font-bold text-bank-navy hover:bg-gray-50">
              <ArrowLeft className="h-3.5 w-3.5" /> Account activity
            </Link>
            <PrintButton />
          </>
        )}
      />

      <Panel className="print-area" title="FMB · Transaction record" bodyClassName="p-5 sm:p-7">
        <div className="border-b border-gray-200 pb-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">{description}</p>
          <p className="mt-2 text-[32px] font-bold tabular-nums text-bank-navy">{formatCents(transaction.amount, { sign: true })}</p>
          <span className={`mt-3 inline-flex border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            transaction.status === "FAILED" || transaction.status === "REJECTED" ? "border-red-300 bg-red-50 text-red-800" :
              transaction.status === "PENDING" || transaction.status === "PENDING_APPROVAL" || transaction.status === "PROCESSING_APPROVAL" ? "border-amber-300 bg-amber-50 text-amber-900" :
                "border-gray-300 bg-gray-50 text-gray-700"
          }`}>
            {displayStatus}
          </span>
        </div>

        <dl className="mt-2">
          <Detail label="Transaction type">{TYPE_LABELS[transaction.type] ?? transaction.type.replaceAll("_", " ")}</Detail>
          <Detail label="Method">{method}</Detail>
          <Detail label="Date and time">{formatDateTime(transaction.createdAt)}</Detail>
          <Detail label="From account">{transaction.account.name} · {maskAccountNumber(transaction.account.accountNumber)}</Detail>
          {counterparty && <Detail label={isExternalTransfer ? "To external account" : "Counterparty"}>{counterparty}</Detail>}
          {billPayment && (
            <>
              <Detail label="Scheduled for">{formatDate(billPayment.scheduledFor)}</Detail>
              <Detail label="Frequency">{billPayment.frequency === "MONTHLY" ? "Monthly" : "One time"}</Detail>
              {billPayment.memo && <Detail label="Memo">{billPayment.memo}</Detail>}
            </>
          )}
          <Detail label="Status">{displayStatus}</Detail>
          <Detail label="Reference">{transaction.reference ?? transaction.id}</Detail>
        </dl>
      </Panel>

      <div className="mt-4 border-l-4 border-bank-red bg-gray-50 px-4 py-3 text-[11px] leading-relaxed text-gray-600">
        {isExternalTransfer ? (
          <><strong className="text-gray-800">External transfer record.</strong> Review the status and details of this transfer above.</>
        ) : transaction.paymentMethod === "BILL_PAY" ? (
          transaction.status === "PENDING_APPROVAL" || transaction.status === "PROCESSING_APPROVAL" ? (
            <><strong className="text-gray-800">Payment processing.</strong> The balance has not changed and the biller has not been paid.</>
          ) : (
            <><strong className="text-gray-800">Bill payment record.</strong> Review the status and details of this payment above.</>
          )
        ) : (
          <><strong className="text-gray-800">FMB account record.</strong> Review the status and details of this transaction above.</>
        )}
      </div>

      <div className="no-print mt-5 flex flex-wrap gap-3">
        <Link href="/transactions" className="inline-flex h-10 items-center border border-gray-400 bg-white px-4 text-[12px] font-bold text-bank-navy hover:bg-gray-50">Back to account activity</Link>
        <Link href="/dashboard" className="inline-flex h-10 items-center bg-bank-navy px-4 text-[12px] font-bold text-white hover:bg-bank-navy/90">Accounts overview</Link>
      </div>
    </div>
  );
}
