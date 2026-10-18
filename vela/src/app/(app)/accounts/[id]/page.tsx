import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, CreditCard, Landmark, PiggyBank, Wallet } from "lucide-react";
import { accountTypeLabel } from "@/lib/products";
import { requireUser } from "@/lib/auth";
import { getAccountForUser, getTransactions } from "@/lib/queries";
import { formatAccountNumberLong, formatCents, maskAccountNumber } from "@/lib/money";
import { Badge, Panel } from "@/components/ui";
import { PageHeader, TransactionList } from "@/components/transactions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account Details — FMB" };

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const account = await getAccountForUser(user.id, id);
  if (!account) notFound();

  const transactions = await getTransactions(user.id, { accountId: account.id, take: 100 });
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const monthTx = transactions.filter((t) => new Date(t.createdAt) >= monthAgo);
  const monthIn = monthTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const monthOut = monthTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const Icon = account.type === "SAVINGS" || account.type === "BUSINESS_SAVINGS" || account.type === "MONEY_MARKET"
    ? PiggyBank
    : account.type === "BUSINESS_CHECKING"
      ? Briefcase
      : account.type === "CD"
        ? Landmark
        : account.type === "CREDIT"
          ? CreditCard
          : Wallet;

  return (
    <div>
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-bank-link underline underline-offset-2 hover:text-bank-blueDark"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Account Summary
      </Link>

      <PageHeader
        title={account.name}
        subtitle={`Account number ending in ${account.accountNumber.slice(-4)} · Routing ${account.routingNumber}`}
        actions={
          <>
            <Badge tone={account.status === "ACTIVE" ? "green" : "amber"}>{account.status}</Badge>
            <Link
              href={`/transfer?tab=transfer&from=${account.id}`}
              className="inline-flex h-9 items-center rounded border border-gray-400 bg-white px-4 text-[12px] font-bold text-bank-navy hover:bg-gray-50"
            >
              Transfer funds
            </Link>
            {account.cards.length > 0 && (
              <Link
                href="/cards"
                className="inline-flex h-9 items-center rounded bg-bank-red px-4 text-[12px] font-bold text-white hover:bg-bank-redDark"
              >
                <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Card settings
              </Link>
            )}
          </>
        }
      />

      {/* Account details box */}
      <div className="border border-gray-300 bg-white shadow-panel">
        <div className="border-b border-gray-200 bg-bank-navy px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded border border-white/25 bg-white/10">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/70">{account.type === "CREDIT" ? "Current balance" : "Available balance"}</p>
              <p className="text-[26px] font-bold leading-tight">{formatCents(account.type === "CREDIT" ? Math.abs(account.balance) : account.balance)}</p>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 px-6 py-5 sm:grid-cols-4">
          <div>
            <dt className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Account number</dt>
            <dd className="mt-1 text-[13px] font-semibold tabular-nums text-gray-900">
              {formatAccountNumberLong(account.accountNumber)}
            </dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Routing number</dt>
            <dd className="mt-1 text-[13px] font-semibold tabular-nums text-gray-900">{account.routingNumber}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Account type</dt>
            <dd className="mt-1 text-[13px] font-semibold text-gray-900">
              {accountTypeLabel(account.type)}
            </dd>
          </div>
          {account.apy ? (
            <div>
              <dt className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Interest rate</dt>
              <dd className="mt-1 text-[13px] font-semibold text-bank-red">{account.apy}% APY</dd>
            </div>
          ) : (
            <div>
              <dt className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Status</dt>
              <dd className="mt-1 text-[13px] font-semibold text-gray-900">{account.status}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Monthly summary */}
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <div className="border border-gray-300 bg-white p-4 shadow-panel">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Deposits (30 days)</p>
          <p className="mt-1 text-[18px] font-bold tabular-nums text-emerald-700">{formatCents(monthIn, { sign: true })}</p>
        </div>
        <div className="border border-gray-300 bg-white p-4 shadow-panel">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Withdrawals (30 days)</p>
          <p className="mt-1 text-[18px] font-bold tabular-nums text-gray-900">-{formatCents(monthOut)}</p>
        </div>
        <div className="border border-gray-300 bg-white p-4 shadow-panel">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Total transactions</p>
          <p className="mt-1 text-[18px] font-bold tabular-nums text-bank-navy">{transactions.length}</p>
        </div>
      </div>

      {/* Activity */}
      <Panel
        title="Account activity"
        action={
          <Link href={`/transactions?account=${account.id}`} className="text-[11.5px] font-semibold text-bank-link underline underline-offset-2">
            Search &amp; filter &gt;
          </Link>
        }
        bodyClassName="px-2 pb-2"
      >
        <TransactionList
          transactions={transactions}
          emptyTitle="No activity yet"
          emptyBody="Deposits and transfers will appear here."
          dense
        />
      </Panel>
    </div>
  );
}
