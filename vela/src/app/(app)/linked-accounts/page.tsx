import Link from "next/link";
import { isSharedPreviewDemoMode, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { lastFourDigits, safeExternalNickname, safeInstitutionName } from "@/lib/external-account-display";
import { plaidCredentials } from "@/lib/plaid";
import { PageHeader } from "@/components/transactions";
import { LinkedAccountsClient } from "@/components/LinkedAccountsClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Linked Accounts — First Meridian" };

type LinkedAccountSummary = { name: string; officialName?: string | null; mask: string; type: string; subtype?: string | null };

function safeAccounts(value: string): LinkedAccountSummary[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is LinkedAccountSummary => {
        return Boolean(item && typeof item === "object" && "name" in item && typeof item.name === "string" && "type" in item && typeof item.type === "string");
      })
      .map((item) => ({ ...item, mask: lastFourDigits(item.mask) }));
  } catch {
    return [];
  }
}

export default async function LinkedAccountsPage() {
  const user = await requireUser();
  const [banks, externalAccounts, plaid, sharedPreview] = await Promise.all([
    db.linkedBank.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.externalAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    Promise.resolve(plaidCredentials()),
    isSharedPreviewDemoMode(),
  ]);

  return (
    <div>
      <PageHeader
        title="Linked Accounts"
        subtitle="Add an external destination for review. It can be used for a transfer request only after admin review and verification."
        actions={<Link href="/transfer?tab=deposit" className="inline-flex h-9 items-center border border-gray-400 bg-white px-3 text-[11.5px] font-bold text-bank-navy hover:bg-gray-50">Back to transfers</Link>}
      />
      <LinkedAccountsClient
        configured={plaid.ready}
        sharedPreview={sharedPreview}
        externalAccounts={externalAccounts.map((account) => ({
          id: account.id,
          institutionName: safeInstitutionName(account.institutionName),
          nickname: safeExternalNickname(account.nickname, account.accountType),
          accountType: account.accountType,
          accountMask: lastFourDigits(account.accountMask),
          status: account.status,
          microdepositExpiresAt: account.microdepositExpiresAt?.toISOString() ?? null,
          createdAt: account.createdAt.toISOString(),
        }))}
        banks={banks.map((bank) => ({
          id: bank.id,
          institutionName: bank.institutionName,
          createdAt: bank.createdAt.toISOString(),
          accounts: safeAccounts(bank.accountsJson),
        }))}
      />
    </div>
  );
}
