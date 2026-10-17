import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAccounts } from "@/lib/queries";
import { Panel } from "@/components/ui";
import { PageHeader } from "@/components/transactions";
import { MobileDepositForm } from "@/components/MobileDepositForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mobile Deposit — FMB" };

export default async function MobileDepositPage() {
  const user = await requireUser();
  const accounts = await getAccounts(user.id);
  const activeAccounts = accounts
    .filter((account) => account.status === "ACTIVE")
    .map((account) => ({ id: account.id, name: account.name, balance: account.balance }));

  return (
    <div>
      <PageHeader
        title="Mobile deposit"
        subtitle="Review the details and submit a mobile check deposit."
        actions={<Link href="/transfer?tab=deposit" className="text-[11.5px] font-semibold text-bank-link underline underline-offset-2">Add funds from bank</Link>}
      />
      <div className="mx-auto max-w-[760px]">
        <Panel title="Deposit a check" bodyClassName="p-4 sm:p-6">
          {activeAccounts.length ? (
            <MobileDepositForm accounts={activeAccounts} />
          ) : (
            <p className="py-5 text-center text-[12px] text-gray-600">No active accounts are available for deposit.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
