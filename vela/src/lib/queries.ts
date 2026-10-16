import "server-only";
import { db, type Account, type Transaction } from "@/lib/db";

/** Read-side queries shared by account/dashboard/statement pages. */

export async function getAccounts(userId: string): Promise<Account[]> {
  return db.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function getAccountForUser(userId: string, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return null;
  const cards = await db.card.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "asc" } });
  return { ...account, cards };
}

export type TransactionWithAccount = Transaction & { account: Account };
export async function getTransactions(
  userId: string,
  opts: { accountId?: string; search?: string; category?: string; type?: "CREDIT" | "DEBIT"; take?: number } = {},
): Promise<TransactionWithAccount[]> {
  const accounts = await getAccounts(userId);
  const accountIds = accounts.map((a: any) => a.id);
  if (accountIds.length === 0) return [];
  const where: any = { accountId: opts.accountId && opts.accountId !== "ALL" ? opts.accountId : { in: accountIds } };
  if (opts.category && opts.category !== "ALL") where.category = opts.category;
  if (opts.type === "CREDIT") where.amount = { gt: 0 };
  if (opts.type === "DEBIT") where.amount = { lt: 0 };
  let rows = await db.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.search ? 2000 : (opts.take ?? 500),
  });
  if (opts.search) {
    const q = opts.search.toLowerCase();
    rows = rows.filter(
      (t: any) =>
        t.description.toLowerCase().includes(q) || (t.counterparty ?? "").toLowerCase().includes(q),
    );
  }
  const byId = new Map(accounts.map((a: any) => [a.id, a]));
  return rows.map((t: any) => ({ ...t, account: byId.get(t.accountId) }));
}

export async function getOverview(userId: string) {
  const accounts = await getAccounts(userId);
  const totalBalance = accounts.reduce((s: number, a: any) => s + a.balance, 0);
  const savingsAccount = accounts.find((a: any) => a.type === "SAVINGS") ?? null;
  const checking = accounts.find((a: any) => a.type === "CHECKING");
  const card = checking
    ? await db.card.findFirst({ where: { accountId: checking.id }, orderBy: { createdAt: "asc" } })
    : null;
  const recentTransactions = await getTransactions(userId, { take: 12 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const all = await getTransactions(userId, { take: 4000 });
  const posted = all.filter((t: any) => t.status === "COMPLETED");
  const sumRange = (from: Date, to: Date, sign: 1 | -1) =>
    posted
      .filter((t: any) => t.createdAt >= from && t.createdAt < to && (sign === 1 ? t.amount > 0 : t.amount < 0))
      .reduce((s: number, t: any) => s + Math.abs(t.amount), 0);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthIncome = sumRange(monthStart, nextMonth, 1);
  const monthSpending = sumRange(monthStart, nextMonth, -1);
  const lastIncome = sumRange(lastMonthStart, monthStart, 1);
  const lastSpending = sumRange(lastMonthStart, monthStart, -1);
  const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0);

  const spendingByCategory = new Map<string, number>();
  for (const t of posted) {
    if (t.amount >= 0 || t.createdAt < thirtyDaysAgo) continue;
    spendingByCategory.set(t.category, (spendingByCategory.get(t.category) ?? 0) + Math.abs(t.amount));
  }

  // Balance history: weekly points over the last 8 weeks (all accounts).
  const balanceHistory: { label: string; balance: number }[] = [];
  const sortedAsc = [...posted].sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime());
  for (let w = 7; w >= 0; w--) {
    const point = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
    const balance = sortedAsc
      .filter((t: any) => t.createdAt <= point)
      .reduce((s: number, t: any) => s + t.amount, 0);
    balanceHistory.push({
      label: point.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      balance,
    });
  }

  return {
    accounts,
    totalBalance,
    savingsAccount,
    card,
    recentTransactions,
    monthIncome,
    monthSpending,
    incomeDelta: pct(monthIncome, lastIncome),
    spendingDelta: pct(monthSpending, lastSpending),
    spendingByCategory: [...spendingByCategory.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total),
    balanceHistory,
  };
}

export async function getStatementsData(userId: string) {
  const accounts = await getAccounts(userId);
  const all = await getTransactions(userId, { take: 5000 });
  const posted = all.filter((t: any) => t.status === "COMPLETED");
  const byMonth = new Map<string, any[]>();
  for (const t of posted) {
    const key = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const list = byMonth.get(key) ?? [];
    list.push(t);
    byMonth.set(key, list);
  }
  const statements = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, transactions]) => {
      const [y, m] = key.split("-").map(Number);
      return {
        key,
        label: new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        inflow: transactions.filter((t: any) => t.amount > 0).reduce((s: number, t: any) => s + t.amount, 0),
        outflow: transactions.filter((t: any) => t.amount < 0).reduce((s: number, t: any) => s + Math.abs(t.amount), 0),
        transactions: [...transactions].sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime()),
      };
    });
  return { accounts, statements };
}
