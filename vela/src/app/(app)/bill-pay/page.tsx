import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccounts } from "@/lib/queries";
import { formatCents, formatDate } from "@/lib/money";
import { Alert } from "@/components/ui";
import { PageHeader } from "@/components/transactions";
import { BillPayClient } from "@/components/BillPayClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bill Pay — First Meridian" };

function localDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function BillPayPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [accounts, payees, payments, confirmed] = await Promise.all([
    getAccounts(user.id),
    db.billPayee.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    db.billPayment.findMany({
      where: { userId: user.id },
      include: { payee: true, account: true },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      take: 12,
    }),
    params.confirmation
      ? db.billPayment.findFirst({
          where: { userId: user.id, confirmationNumber: params.confirmation },
          include: { payee: true, account: true },
        })
      : Promise.resolve(null),
  ]);
  const today = new Date();
  const minDate = localDateInputValue(today);

  return (
    <div>
      <PageHeader
        title="Bill Pay"
        subtitle="Manage saved companies, schedule a payment and review every detail before submitting."
      />

      {confirmed && (
        <div className="mb-5">
          <Alert tone={confirmed.status === "PENDING_APPROVAL" ? "info" : "success"} title={confirmed.status === "PENDING_APPROVAL" ? "Payment awaiting approval" : "Payment instruction saved"}>
            {formatCents(confirmed.amount)} for {confirmed.payee.name} is set for {formatDate(confirmed.scheduledFor)}.{confirmed.memo ? ` Memo: ${confirmed.memo}.` : ""} Confirmation {confirmed.confirmationNumber}. {confirmed.status === "PENDING_APPROVAL" ? "The balance is unchanged and no biller has been paid." : "This instruction does not confirm that an outside biller was paid."}
          </Alert>
        </div>
      )}

      <BillPayClient
        accounts={accounts.filter((account) => account.status === "ACTIVE").map((account) => ({
          id: account.id,
          name: account.name,
          balance: account.balance,
        }))}
        payees={payees.map((payee) => ({
          id: payee.id,
          name: payee.name,
          category: payee.category,
          accountMask: payee.accountMask,
        }))}
        payments={payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          scheduledFor: payment.scheduledFor.toISOString(),
          frequency: payment.frequency,
          memo: payment.memo,
          status: payment.status,
          confirmationNumber: payment.confirmationNumber,
          payee: { name: payment.payee.name, accountMask: payment.payee.accountMask },
          account: { name: payment.account.name },
        }))}
        minDate={minDate}
      />
    </div>
  );
}
