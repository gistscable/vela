import { isSharedPreviewDemoMode, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccounts } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import { lastFourDigits, safeExternalNickname, safeInstitutionName } from "@/lib/external-account-display";
import { Panel } from "@/components/ui";
import { PageHeader } from "@/components/transactions";
import { MoneyMovement } from "@/components/MoneyForms";
import { stripeKeyStatus } from "@/lib/stripe";
import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Transfers — First Meridian Bank" };

export default async function TransferPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; checkout?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [accounts, externalAccounts, stripeStatus, sharedPreview] = await Promise.all([
    getAccounts(user.id),
    db.externalAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    Promise.resolve(stripeKeyStatus()),
    isSharedPreviewDemoMode(),
  ]);
  const options = accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance, status: a.status }));
  const externalDestinationOptions = externalAccounts.filter((account) => account.status === "VERIFIED").map((account) => ({
    id: account.id,
    institutionName: safeInstitutionName(account.institutionName),
    nickname: safeExternalNickname(account.nickname, account.accountType),
    accountType: account.accountType,
    accountMask: lastFourDigits(account.accountMask),
  }));
  const unverifiedDestinationCount = externalAccounts.filter((account) => account.status === "PENDING_APPROVAL" || account.status === "CHALLENGE_ACTIVE").length;

  return (
    <div>
      <PageHeader
        title="Transfers"
        subtitle="Submit a deposit, withdrawal, internal transfer or Quick Pay request for approval."
      />

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Make a transfer" className="min-w-0" bodyClassName="p-6">
          <MoneyMovement
            accounts={options}
            externalDestinations={externalDestinationOptions}
            unverifiedDestinationCount={unverifiedDestinationCount}
            savedDestinationCount={externalAccounts.length}
            sharedPreview={sharedPreview}
            initialTab={params.tab}
            initialFromId={params.from}
            stripeReady={stripeStatus.configured}
            stripeProblem={stripeStatus.problem}
            checkoutNotice={params.checkout === "returned" || params.checkout === "cancelled" ? params.checkout : undefined}
          />
        </Panel>

        <aside className="min-w-0 space-y-5">
          <Panel title="Account balances" bodyClassName="p-0">
            <table className="w-full text-left text-[12.5px]">
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{a.name}</p>
                      <p className="text-[10.5px] text-gray-500">Available now</p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">
                      {formatCents(a.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <div className="border-l-4 border-bank-red bg-gray-50 p-4">
            <h3 className="flex items-center gap-2 text-[12.5px] font-bold text-bank-navy">
              <ShieldCheck className="h-4 w-4 text-bank-red" /> Transfers are protected
            </h3>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-gray-600">
              Internal transfers and Quick Pay are checked against your current balance and await approval before posting. Quick Pay is limited to First Meridian member accounts.
            </p>
          </div>

          <div className="border border-gray-200 bg-gray-50 p-4 text-[11px] leading-relaxed text-gray-600">
            <strong className="block text-gray-700">External payment rails</strong>
            ACH and wire transfers can be submitted for review. Stripe ACH Checkout is also available when configured.
          </div>
        </aside>
      </div>
    </div>
  );
}
