import Link from "next/link";
import { CreditCard, ShieldCheck, Snowflake } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Badge, Panel } from "@/components/ui";
import { PageHeader, TransactionList } from "@/components/transactions";
import { CardControls, CardVisual } from "@/components/CardsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Card Services — FMB" };

export default async function CardsPage() {
  const user = await requireUser();
  const accounts = await db.account.findMany({
    where: { userId: user.id },
    include: { cards: true },
    orderBy: { createdAt: "asc" },
  });
  const cards = accounts.flatMap((account) => account.cards.map((card) => ({ ...card, account })));
  const accountIds = cards.map((card) => card.accountId);
  const cardTransactions = accountIds.length
    ? await db.transaction.findMany({
        where: { accountId: { in: accountIds }, type: "CARD_PURCHASE" },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Card Services"
        subtitle="Manage FMB debit and credit cards. New cards appear here after approval."
        actions={
          <Link
            href="/products"
            className="inline-flex h-9 items-center rounded bg-bank-red px-4 text-[12px] font-bold text-white hover:bg-bank-redDark"
          >
            Apply for a card
          </Link>
        }
      />

      {cards.length === 0 ? (
        <Panel>
          <div className="py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded border border-gray-300 bg-gray-50 text-gray-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <h2 className="mt-3 text-[15px] font-bold text-bank-navy">No card issued</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-[12px] text-gray-500">
              Apply for a Visa debit card on a checking account, or a credit card with its own balance. It shows below your accounts after an administrator approves it.
            </p>
            <Link href="/products" className="mt-4 inline-flex h-9 items-center rounded bg-bank-navy px-4 text-[12px] font-bold text-white hover:bg-bank-navyDark">
              Browse cards
            </Link>
          </div>
        </Panel>
      ) : (
        <div className="space-y-8">
          {cards.map((card) => (
            <div key={card.id} className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="min-w-0">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[15px] font-bold text-bank-navy">{card.account.name}</h2>
                  <Badge tone={card.status === "FROZEN" ? "red" : "green"}>{card.status === "FROZEN" ? "Locked" : "Active"}</Badge>
                </div>
                <CardVisual card={card} holderName={`${user.firstName} ${user.lastName}`} />
                <div className="mt-5">
                  <CardControls cardId={card.id} dailyLimit={card.dailyLimit} frozen={card.status === "FROZEN"} />
                </div>
              </div>

              <div className="min-w-0 space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <div className="border border-gray-300 bg-white p-4 shadow-panel">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">{card.kind === "CREDIT" ? "Current balance" : "Spent today"}</p>
                    <p className="mt-1 text-[18px] font-bold tabular-nums text-gray-900">
                      {formatCents(card.kind === "CREDIT" ? Math.abs(card.account.balance) : card.spentToday)}
                    </p>
                  </div>
                  <div className="border border-gray-300 bg-white p-4 shadow-panel">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">{card.kind === "CREDIT" ? "Credit line" : "Daily limit"}</p>
                    <p className="mt-1 text-[18px] font-bold tabular-nums text-gray-900">{formatCents(card.kind === "CREDIT" ? (card.creditLimit ?? 0) : card.dailyLimit)}</p>
                  </div>
                </div>

                <div className="border-l-4 border-bank-red bg-gray-50 p-4">
                  <h3 className="flex items-center gap-2 text-[12.5px] font-bold text-bank-navy">
                    <ShieldCheck className="h-4 w-4 text-bank-red" /> Zero liability protection
                  </h3>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-gray-600">
                    You&apos;re never responsible for unauthorized transactions on your card. Report a lost
                    or stolen card immediately and we&apos;ll block it and issue a replacement.
                  </p>
                </div>

                <div className="border-l-4 border-bank-blue bg-gray-50 p-4">
                  <h3 className="flex items-center gap-2 text-[12.5px] font-bold text-bank-navy">
                    <Snowflake className="h-4 w-4 text-bank-blue" /> Instant card lock
                  </h3>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-gray-600">
                    Misplaced your card? Lock it in one click — recurring payments pause and new purchases
                    are declined until you unlock it.
                  </p>
                </div>
              </div>
            </div>
          ))}

          <Panel title="Recent card purchases" bodyClassName="px-2 pb-2">
            <TransactionList
              transactions={cardTransactions}
              emptyTitle="No card purchases yet"
              emptyBody="Card purchases will appear here."
              dense
            />
          </Panel>
        </div>
      )}
    </div>
  );
}
