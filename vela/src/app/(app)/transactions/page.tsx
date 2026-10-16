import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getTransactions, getAccounts } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import { Button, Input, Panel, Select } from "@/components/ui";
import { PageHeader, TransactionList } from "@/components/transactions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account Activity — First Meridian Bank" };

const CATEGORY_LIST: Record<string, string> = {
  INCOME: "Income",
  HOUSING: "Housing",
  FOOD: "Food & dining",
  TRANSPORT: "Transportation",
  SHOPPING: "Shopping",
  ENTERTAINMENT: "Entertainment",
  UTILITIES: "Utilities",
  HEALTH: "Health",
  TRANSFER: "Transfers",
  SAVINGS: "Savings",
  OTHER: "Other",
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; type?: string; account?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [transactions, accounts] = await Promise.all([
    getTransactions(user.id, {
      search: params.q,
      category: params.category,
      type: params.type === "CREDIT" || params.type === "DEBIT" ? params.type : undefined,
      accountId: params.account,
    }),
    getAccounts(user.id),
  ]);

  const postedTransactions = transactions.filter((t) => t.status === "COMPLETED");
  const totalIn = postedTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = postedTransactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div>
      <PageHeader
        title="Account Activity"
        subtitle={`${transactions.length} transaction${transactions.length === 1 ? "" : "s"} · ${formatCents(totalIn, { sign: true })} posted credits · -${formatCents(totalOut)} posted debits`}
      />

      <Panel className="mb-5" bodyClassName="p-4">
        <form method="GET" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            name="q"
            label="Search"
            defaultValue={params.q ?? ""}
            placeholder="Description or name"
            icon={<Search className="h-3.5 w-3.5" />}
          />
          <Select name="category" label="Category" defaultValue={params.category ?? "ALL"}>
            <option value="ALL">All categories</option>
            {Object.entries(CATEGORY_LIST).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select name="type" label="Type" defaultValue={params.type ?? "ALL"}>
            <option value="ALL">All types</option>
            <option value="CREDIT">Credits (money in)</option>
            <option value="DEBIT">Debits (money out)</option>
          </Select>
          <Select name="account" label="Account" defaultValue={params.account ?? "ALL"}>
            <option value="ALL">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <div>
            <Button type="submit" variant="navy" className="w-full">
              Search
            </Button>
          </div>
        </form>
      </Panel>

      <Panel bodyClassName="p-0">
        <TransactionList
          transactions={transactions}
          emptyTitle="No matching transactions"
          emptyBody="Try adjusting your search criteria."
        />
      </Panel>
    </div>
  );
}
