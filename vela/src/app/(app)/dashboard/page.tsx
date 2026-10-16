import Link from "next/link";
import { ArrowDownToLine, ArrowRight, Camera, ChevronRight, CreditCard, HandCoins, Info, PiggyBank, ReceiptText, Search, Send, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getOverview } from "@/lib/queries";
import { formatCents, maskAccountNumber } from "@/lib/money";
import { categoryMeta } from "@/lib/categories";
import { AreaChart, DonutChart, Panel } from "@/components/ui";
import { SeeAllLink, Toast, TransactionList } from "@/components/transactions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account Summary — First Meridian Bank" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ toast?: string }>;
}) {
  const user = await requireUser();
  const { toast } = await searchParams;
  const data = await getOverview(user.id);

  const donutData = data.spendingByCategory.map((c) => {
    const meta = categoryMeta(c.category);
    return { category: c.category, label: meta.label, total: c.total, color: meta.color };
  });

  return (
    <div>
      <Toast kind={toast} />

      {!user.username && (
        <p data-testid="username-prompt" className="mb-4 border-l-4 border-bank-blue bg-blue-50/60 px-3 py-2 text-[12px] leading-relaxed text-gray-700">
          Choose a Username / User ID to sign in with. Your email keeps working in the meantime.{" "}
          <Link href="/settings" className="font-semibold text-bank-link underline underline-offset-2">Choose one in Settings &gt;</Link>
        </p>
      )}

      {/* Page title */}
      <div className="mb-4 flex items-end justify-between md:mb-5">
        <div>
          <p className="mb-0.5 text-[11px] font-medium text-gray-500 md:hidden">Welcome, {user.firstName}</p>
          <h1 className="text-[23px] font-bold text-bank-navy"><span className="md:hidden">Accounts</span><span className="hidden md:inline">Account Summary</span></h1>
        </div>
        <p className="hidden text-[11px] text-gray-500 md:block">
          As of {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Mobile account view: grouped balances and plain, bank-style activity rows. */}
      <div className="mb-5 space-y-4 md:hidden">
        <form action="/transactions" method="get" className="flex h-12 items-center gap-2 rounded-[24px] border border-gray-200 bg-white px-4 shadow-sm">
          <Search className="h-5 w-5 shrink-0 text-gray-500" />
          <input name="q" aria-label="Search activity" placeholder="How can we help?" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-gray-900 outline-none placeholder:text-gray-500 focus:ring-0" />
          <button type="submit" className="text-[11px] font-semibold text-bank-link">Search</button>
        </form>

        <div className="flex items-center justify-between px-1 text-[11px] text-gray-600">
          <span>Total across {data.accounts.length} accounts</span>
          <strong className="text-[13px] tabular-nums text-gray-900">{formatCents(data.totalBalance)}</strong>
        </div>

        <section className="overflow-hidden rounded-[14px] border border-gray-200 bg-white shadow-panel">
          <div className="h-[5px]" style={{ background: "linear-gradient(90deg, #D8232A 0 60%, #002855 60% 100%)" }} />
          <div className="flex items-center justify-between px-4 py-3.5">
            <h2 className="text-[18px] font-bold text-gray-900">Banking</h2>
            <ChevronRight className="h-5 w-5 rotate-90 text-gray-400" />
          </div>
          <div className="border-t border-gray-200">
            {data.accounts.map((account) => (
              <Link key={account.id} href={`/accounts/${account.id}`} className="flex items-center gap-2 border-b border-gray-200 px-4 py-3.5 last:border-0 hover:bg-gray-50">
                <span className="min-w-0 flex-1">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">First Meridian Bank</span>
                  <span className="block text-[14px] font-medium leading-tight text-gray-900">{account.name} · {account.accountNumber.slice(-4)}</span>
                  <span className="mt-1 block text-[10.5px] text-gray-500">{account.type === "SAVINGS" && account.apy ? `${account.apy}% APY · ` : ""}Available balance</span>
                </span>
                <span className="shrink-0 text-right text-[15px] font-medium tabular-nums text-gray-900">{formatCents(account.balance)}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
              </Link>
            ))}
          </div>
        </section>

        {data.card && (
          <section className="overflow-hidden rounded-[14px] border border-gray-200 bg-white shadow-panel">
            <div className="h-[5px]" style={{ background: "linear-gradient(90deg, #D8232A 0 60%, #002855 60% 100%)" }} />
            <div className="flex items-center justify-between px-4 py-3.5">
              <h2 className="text-[18px] font-bold text-gray-900">Cards</h2>
              <ChevronRight className="h-5 w-5 rotate-90 text-gray-400" />
            </div>
            <Link href="/cards" className="flex items-center gap-3 border-t border-gray-200 px-4 py-4 hover:bg-gray-50">
              <span className="min-w-0 flex-1">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">First Meridian Bank</span>
                <span className="block text-[14px] font-medium text-gray-900">{data.card.brand} debit card · {data.card.last4}</span>
                <span className="mt-1 block text-[10.5px] text-gray-500">{data.card.status === "FROZEN" ? "Temporarily locked" : "Manage card"}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Link>
          </section>
        )}

        <Panel title="Recent activity" action={<SeeAllLink href="/transactions" label="View all" />} bodyClassName="p-0">
          <TransactionList transactions={data.recentTransactions.slice(0, 6)} dense />
        </Panel>

        <Panel title="This month" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Money in</p>
              <p className="mt-1 text-[15px] font-bold tabular-nums text-emerald-700">{formatCents(data.monthIncome, { sign: true })}</p>
              <p className="mt-1 text-[10px] text-gray-500">{Math.abs(data.incomeDelta)}% vs last month</p>
            </div>
            <div className="border border-gray-200 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Money out</p>
              <p className="mt-1 text-[15px] font-bold tabular-nums text-gray-900">{formatCents(data.monthSpending)}</p>
              <p className="mt-1 text-[10px] text-gray-500">{Math.abs(data.spendingDelta)}% vs last month</p>
            </div>
            <div className="col-span-2 border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Savings rate</span>
                <span className="text-[15px] font-bold tabular-nums text-bank-navy">{data.monthIncome > 0 ? `${Math.max(0, Math.round(((data.monthIncome - data.monthSpending) / data.monthIncome) * 100))}%` : "—"}</span>
              </div>
              <p className="mt-1 text-[10px] text-gray-500">{data.savingsAccount ? `High-Yield Savings · ${data.savingsAccount.apy}% APY` : "Open a savings account"}</p>
            </div>
          </div>
        </Panel>

        <Panel title="Balance history · 8 weeks" action={<span className="text-[10px] text-gray-500">All accounts</span>}>
          <AreaChart points={data.balanceHistory} />
        </Panel>

        <Panel title="Spending by category" action={<span className="text-[10px] text-gray-500">Last 30 days</span>}>
          {donutData.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-gray-500">No spending to report yet.</p>
          ) : (
            <>
              <div className="flex justify-center"><DonutChart data={donutData} /></div>
              <div className="mt-2 space-y-1.5">
                {donutData.slice(0, 4).map((item) => (
                  <div key={item.category} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-gray-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}</span>
                    <span className="font-semibold tabular-nums text-gray-800">{formatCents(item.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel title="Quick links" bodyClassName="p-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: "/transfer?tab=transfer", label: "Transfer" },
              { href: "/transfer?tab=send", label: "Send money" },
              { href: "/receive", label: "Receive money" },
              { href: "/mobile-deposit", label: "Deposit a check" },
              { href: "/bill-pay", label: "Pay a bill" },
              { href: "/services", label: "All services" },
              { href: "/help", label: "Help & support" },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="flex min-h-11 items-center justify-center border border-gray-200 bg-white px-2 text-center text-[11px] font-semibold text-bank-link hover:bg-gray-50">{item.label}</Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="hidden gap-6 md:grid md:grid-cols-[1fr_290px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Banking accounts table */}
          <Panel
            title="Banking accounts"
            action={
              <Link href="/transfer" className="text-[11.5px] font-semibold text-bank-link underline underline-offset-2">
                Open a new account
              </Link>
            }
            bodyClassName="p-0"
          >
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[10.5px] uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-2.5 font-semibold">Account</th>
                  <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Details</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => {
                  const Icon = a.type === "SAVINGS" ? PiggyBank : Wallet;
                  return (
                    <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <Link href={`/accounts/${a.id}`} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded border border-bank-sand bg-bank-sand text-bank-navy">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span>
                            <span className="block font-bold text-bank-link underline underline-offset-2">{a.name}</span>
                            <span className="mt-0.5 block text-[11px] text-gray-500">
                              {maskAccountNumber(a.accountNumber)}
                              {a.type === "SAVINGS" && a.apy ? ` · ${a.apy}% APY` : ""}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="hidden px-3 py-4 sm:table-cell">
                        <div className="flex flex-col gap-0.5 text-[11px]">
                          <Link href={`/accounts/${a.id}`} className="font-semibold text-bank-link underline underline-offset-2">
                            Account details
                          </Link>
                          <Link href={`/transactions?account=${a.id}`} className="font-semibold text-bank-link underline underline-offset-2">
                            Recent activity
                          </Link>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="block text-[15px] font-bold tabular-nums text-gray-900">
                          {formatCents(a.balance)}
                        </span>
                        <span className="mt-0.5 block text-[10.5px] text-gray-500">Available balance</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-gray-200 bg-gray-50 px-5 py-2.5 text-right text-[12px]">
              <span className="text-gray-600">Total: </span>
              <span className="text-[14px] font-bold tabular-nums text-bank-navy">{formatCents(data.totalBalance)}</span>
            </div>
          </Panel>

          {/* Snapshot row */}
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="border border-gray-300 bg-white p-4 shadow-panel">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Money in this month</p>
              <p className="mt-1 text-[19px] font-bold tabular-nums text-emerald-700">
                {formatCents(data.monthIncome, { sign: true })}
              </p>
              <p className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${data.incomeDelta >= 0 ? "text-emerald-700" : "text-bank-red"}`}>
                {data.incomeDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(data.incomeDelta)}% vs last month
              </p>
            </div>
            <div className="border border-gray-300 bg-white p-4 shadow-panel">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Money out this month</p>
              <p className="mt-1 text-[19px] font-bold tabular-nums text-gray-900">{formatCents(data.monthSpending)}</p>
              <p className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${data.spendingDelta <= 0 ? "text-emerald-700" : "text-bank-red"}`}>
                {data.spendingDelta <= 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                {Math.abs(data.spendingDelta)}% vs last month
              </p>
            </div>
            <div className="border border-gray-300 bg-white p-4 shadow-panel">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Savings rate</p>
              <p className="mt-1 text-[19px] font-bold tabular-nums text-bank-navy">
                {data.monthIncome > 0
                  ? `${Math.max(0, Math.round(((data.monthIncome - data.monthSpending) / data.monthIncome) * 100))}%`
                  : "—"}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                {data.savingsAccount ? `High-Yield Savings at ${data.savingsAccount.apy}% APY` : "Open a savings account"}
              </p>
            </div>
          </div>

          {/* Charts */}
          <Panel title="Balance history — last 8 weeks" action={<span className="text-[11px] text-gray-500">All accounts</span>}>
            <AreaChart points={data.balanceHistory} />
          </Panel>

          {/* Recent activity */}
          <Panel
            title="Recent account activity"
            action={<SeeAllLink href="/transactions" label="View all activity" />}
            bodyClassName="px-2 pb-2"
          >
            <TransactionList transactions={data.recentTransactions} dense />
          </Panel>
        </div>

        {/* Right sidebar */}
        <aside className="space-y-5">
          <Panel title="I'd like to…" bodyClassName="p-0">
            <ul className="divide-y divide-gray-100">
              {[
                { href: "/transfer?tab=deposit", icon: ArrowRight, label: "Add funds from bank" },
                { href: "/mobile-deposit", icon: Camera, label: "Deposit a check" },
                { href: "/transfer?tab=transfer", icon: Send, label: "Transfer between accounts" },
                { href: "/transfer?tab=send", icon: Send, label: "Send money" },
                { href: "/receive", icon: HandCoins, label: "Request money" },
                { href: "/bill-pay", icon: ReceiptText, label: "Pay a bill" },
                { href: "/services", icon: Info, label: "All services" },
                { href: "/cards", icon: CreditCard, label: "Manage my card" },
                { href: "/statements", icon: Info, label: "View statements" },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-semibold text-bank-link hover:bg-gray-50 hover:underline"
                  >
                    <item.icon className="h-3.5 w-3.5 text-bank-navy" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Spending by category" action={<span className="text-[10.5px] text-gray-500">Last 30 days</span>}>
            {donutData.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-gray-500">No spending to report yet.</p>
            ) : (
              <>
                <div className="flex justify-center">
                  <DonutChart data={donutData} />
                </div>
                <div className="mt-3 space-y-1.5">
                  {donutData.slice(0, 5).map((d) => (
                    <div key={d.category} className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-gray-600">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
                        {d.label}
                      </span>
                      <span className="font-semibold tabular-nums text-gray-800">{formatCents(d.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <div className="border border-gray-300 bg-bank-sand p-4 text-[11px] leading-relaxed text-gray-700">
            <strong className="block text-bank-navy">Need help?</strong>
            Browse answers about sign-in, transfers and deposits. No live support desk is available.
            <Link href="/help" className="mt-2 inline-block font-semibold text-bank-link underline underline-offset-2">Help & support &gt;</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
