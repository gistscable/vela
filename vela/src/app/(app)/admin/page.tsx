import type { Metadata } from "next";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, formatDateTime } from "@/lib/money";
import { paymentMethodLabel, safeCounterparty, safeTransactionDescription } from "@/lib/external-account-display";
import { approveTransactionGroupAction, adminCreditAction, adminResetAuthenticatorAction, rejectTransactionGroupAction, reviewEnrollmentAction, reviewExternalAccountAction } from "@/lib/admin-actions";
import { PageHeader } from "@/components/transactions";
import { Alert, Button, Input, Panel, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Admin approvals — First Meridian" };

const NOTICES: Record<string, { tone: "success" | "error" | "info" | "warn"; title: string; body: string }> = {
  approved: { tone: "success", title: "Transaction approved", body: "The entry was posted to the selected account balances." },
  rejected: { tone: "info", title: "Transaction rejected", body: "The entry was not posted. Account balances did not change." },
  unavailable: { tone: "info", title: "Already reviewed", body: "That transaction is no longer waiting for a decision." },
  insufficient: { tone: "error", title: "Approval not posted", body: "The sending account no longer has enough available funds." },
  account: { tone: "error", title: "Account unavailable", body: "One of the accounts is closed or inactive. The entry remains unposted." },
  error: { tone: "error", title: "Could not approve transaction", body: "No balance change was made. Please review the item and try again." },
  "credit-error": { tone: "error", title: "Credit not recorded", body: "Check the selected account, method, amount, source and last four digits." },
  "credit-confirm": { tone: "error", title: "Confirmation required", body: "Confirm the destination and amount before recording a credit." },
  "credit-submitted": { tone: "success", title: "Credit submitted for approval", body: "The selected account will be updated only after this item is approved." },
  "challenge-issued": { tone: "success", title: "Verification challenge started", body: "Share the displayed amounts with the customer through a separate trusted channel." },
  "external-rejected": { tone: "info", title: "External account rejected", body: "The destination cannot be used. No funds were moved." },
  "external-unavailable": { tone: "info", title: "External account already reviewed", body: "That destination is no longer waiting for review." },
  "enrollment-approved": { tone: "success", title: "Enrollment approved", body: "The applicant can now sign in with their email and passcode." },
  "enrollment-rejected": { tone: "info", title: "Enrollment rejected", body: "The applicant cannot sign in. Any opening-funds request was also rejected without changing balances." },
  "enrollment-unavailable": { tone: "info", title: "Enrollment already reviewed", body: "That application is no longer awaiting a decision." },
  "enrollment-pending": { tone: "warn", title: "Approve enrollment first", body: "The customer cannot use the account until their enrollment is approved." },
  "authenticator-reset": { tone: "success", title: "Authenticator reset", body: "The user must set up Google Authenticator again the next time they sign in." },
  "authenticator-reset-confirm": { tone: "error", title: "Confirmation required", body: "Confirm the user reset before changing authenticator access." },
  "authenticator-unavailable": { tone: "info", title: "Authenticator not reset", body: "That user may already have an active reset or no authenticator to reset." },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const [pendingRows, accounts, externalAccounts, enrollmentApplications, authenticatorUsers] = await Promise.all([
    db.transaction.findMany({
      where: { status: "PENDING_APPROVAL" },
      include: { account: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    db.account.findMany({
      where: { status: "ACTIVE", user: { enrollmentStatus: "APPROVED" } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: [{ user: { lastName: "asc" } }, { name: "asc" }],
    }),
    db.externalAccount.findMany({
      where: { status: { in: ["PENDING_APPROVAL", "CHALLENGE_ACTIVE"] } },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    db.user.findMany({
      where: { role: "CUSTOMER", enrollmentStatus: "PENDING_APPROVAL" },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    db.user.findMany({
      where: { enrollmentStatus: "APPROVED", mfaEnabled: true },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
      orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      take: 100,
    }),
  ]);
  type PendingRow = (typeof pendingRows)[number];
  type PendingGroup = { key: string; rows: PendingRow[]; createdAt: Date };

  const grouped = new Map<string, PendingGroup>();
  for (const row of pendingRows) {
    const key = row.reference ? `ref:${row.reference}` : `id:${row.id}`;
    const existing = grouped.get(key);
    if (existing) existing.rows.push(row);
    else grouped.set(key, { key, rows: [row], createdAt: row.createdAt });
  }
  const queue = [...grouped.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const notice = params.notice ? NOTICES[params.notice] : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin approvals"
        subtitle={`Signed in as ${admin.email} · ${queue.length} item${queue.length === 1 ? "" : "s"} awaiting review`}
      />
      {notice && <Alert tone={notice.tone} title={notice.title}>{notice.body}</Alert>}

      <Panel title={`Enrollment applications · ${enrollmentApplications.length}`} bodyClassName="p-0">
        {enrollmentApplications.length === 0 ? (
          <div className="px-5 py-7 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-700" />
            <p className="mt-2 text-[12px] font-semibold text-gray-700">No enrollments awaiting review</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {enrollmentApplications.map((applicant) => (
              <article key={applicant.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12.5px] font-bold text-gray-900">{applicant.firstName} {applicant.lastName}</p>
                    <p className="mt-1 text-[11px] text-gray-600">{applicant.email}{applicant.phone ? ` · ${applicant.phone}` : ""}</p>
                    <p className="mt-1 text-[10px] text-gray-500">Submitted {formatDateTime(applicant.createdAt)}</p>
                  </div>
                  <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-bold uppercase text-amber-900">Awaiting enrollment approval</span>
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-gray-600">Approving allows the applicant to sign in. Any opening-funds request still needs separate approval.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={reviewEnrollmentAction}>
                    <input type="hidden" name="userId" value={applicant.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <Button type="submit" variant="navy" size="sm">Approve enrollment</Button>
                  </form>
                  <form action={reviewEnrollmentAction}>
                    <input type="hidden" name="userId" value={applicant.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <Button type="submit" variant="outline" size="sm">Reject enrollment</Button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Authenticator management · ${authenticatorUsers.length}`} bodyClassName="p-0">
        {authenticatorUsers.length === 0 ? (
          <div className="px-5 py-6 text-center text-[11px] text-gray-500">No enrolled authenticators need management.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {authenticatorUsers.map((account) => (
              <article key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div>
                  <p className="text-[12px] font-bold text-gray-900">{account.firstName} {account.lastName} · {account.email}</p>
                  <p className="mt-0.5 text-[10px] text-gray-500">{account.role === "ADMIN" ? "Administrator" : "Customer"} · one authenticator enrolled</p>
                </div>
                <form action={adminResetAuthenticatorAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="userId" value={account.id} />
                  <label className="flex items-center gap-1.5 text-[9.5px] text-gray-600">
                    <input type="checkbox" name="confirm" value="yes" required className="h-3.5 w-3.5 accent-[#b3202e]" />
                    Reset after verifying request
                  </label>
                  <Button type="submit" variant="outline" size="sm">Reset authenticator</Button>
                </form>
              </article>
            ))}
          </div>
        )}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-[10px] leading-relaxed text-gray-600">
          There is no email or SMS recovery code. After a reset, the user must enroll a new authenticator at next sign-in.
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <Panel title="Transactions awaiting approval" bodyClassName="p-0">
          {queue.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-700" />
              <p className="mt-2 text-[13px] font-bold text-gray-800">No transactions to review</p>
              <p className="mt-1 text-[11px] text-gray-500">New balance-changing requests will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {queue.map((group) => {
                const primary = group.rows[0];
                const method = paymentMethodLabel(primary.paymentMethod);
                return (
                  <article key={group.key} data-testid="approval-group" data-group-key={group.key} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-gray-900">
                          <Clock3 className="h-4 w-4 text-amber-700" />
                          {safeTransactionDescription(primary.description)}
                          {method && <span className="rounded-sm border border-gray-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">{method}</span>}
                        </p>
                        <p className="mt-1 text-[10.5px] text-gray-500">Submitted {formatDateTime(group.createdAt)} · {group.rows.length === 1 ? "1 account entry" : `${group.rows.length} linked account entries`}</p>
                      </div>
                      <span className="shrink-0 border border-amber-300 bg-amber-50 px-2 py-1 text-[9.5px] font-bold uppercase text-amber-900">Awaiting approval</span>
                    </div>

                    <div className="mt-3 divide-y divide-gray-100 border border-gray-200 bg-gray-50">
                      {group.rows.map((row) => (
                        <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-[11px]">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800">{row.account.user.firstName} {row.account.user.lastName} · {row.account.name}</p>
                            <p className="mt-0.5 truncate text-gray-500">{safeCounterparty(row.counterparty) || row.account.user.email}</p>
                          </div>
                          <p className={`shrink-0 font-bold tabular-nums ${row.amount > 0 ? "text-emerald-800" : "text-gray-900"}`}>{formatCents(row.amount, { sign: true })}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={approveTransactionGroupAction}>
                        <input type="hidden" name="groupKey" value={group.key} />
                        <Button type="submit" variant="navy" size="sm">Approve and post</Button>
                      </form>
                      <form action={rejectTransactionGroupAction}>
                        <input type="hidden" name="groupKey" value={group.key} />
                        <Button type="submit" variant="outline" size="sm">Reject</Button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Record incoming funds" bodyClassName="p-5">
          <div className="mb-4 border-l-4 border-bank-red bg-gray-50 px-3 py-2.5 text-[11px] leading-relaxed text-gray-600">
            This submits a manual credit for approval. The balance changes only after approval. Record only funds that have been independently confirmed.
          </div>
          {accounts.length === 0 ? (
            <p className="text-[12px] text-gray-500">There are no active customer accounts to credit.</p>
          ) : (
            <form action={adminCreditAction} className="space-y-3">
              <Select name="accountId" label="Credit account" defaultValue="" required>
                <option value="" disabled>Select a customer account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.user.firstName} {account.user.lastName} — {account.name}
                  </option>
                ))}
              </Select>
              <Select name="paymentMethod" label="Incoming method" defaultValue="ACH" required>
                <option value="ACH">ACH</option>
                <option value="WIRE">Wire</option>
              </Select>
              <Input name="sourceName" label="Source bank or institution" placeholder="Example Credit Union" autoComplete="off" required maxLength={80} />
              <Input name="sourceLast4" label="Source account last four digits" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="4321" autoComplete="off" required />
              <Input name="amount" label="Credit amount" inputMode="decimal" placeholder="$0.00" required />
              <label className="flex items-start gap-2 text-[10.5px] leading-relaxed text-gray-600">
                <input type="checkbox" name="confirm" value="yes" required className="mt-0.5" />
                I independently confirmed these funds and details. This request still needs approval.
              </label>
              <Button type="submit" variant="navy" className="w-full">Submit credit for approval</Button>
            </form>
          )}
        </Panel>
      </div>

      <Panel title="External-account review and verification" bodyClassName="p-0">
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-950">
          Verification amounts are shown to admins so they can share them with the customer through a separate trusted channel.
        </div>
        {externalAccounts.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-700" />
            <p className="mt-2 text-[12px] font-semibold text-gray-700">No external accounts need review</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {externalAccounts.map((account) => (
              <article key={account.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12.5px] font-bold text-gray-900">{account.user.firstName} {account.user.lastName} · {account.user.email}</p>
                    <p className="mt-1 text-[11px] text-gray-600">{account.nickname} · {account.institutionName} · {account.accountType === "SAVINGS" ? "Savings" : "Checking"} · •••• {account.accountMask}</p>
                    <p className="mt-1 text-[10px] text-gray-500">Submitted {formatDateTime(account.createdAt)}</p>
                  </div>
                  <span className={`border px-2 py-1 text-[9px] font-bold uppercase ${account.status === "CHALLENGE_ACTIVE" ? "border-blue-200 bg-blue-50 text-blue-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                    {account.status === "CHALLENGE_ACTIVE" ? "Challenge active" : "Awaiting review"}
                  </span>
                </div>
                {account.status === "PENDING_APPROVAL" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={reviewExternalAccountAction}>
                      <input type="hidden" name="externalAccountId" value={account.id} />
                      <input type="hidden" name="decision" value="issue" />
                      <Button type="submit" variant="navy" size="sm">Start verification challenge</Button>
                    </form>
                    <form action={reviewExternalAccountAction}>
                      <input type="hidden" name="externalAccountId" value={account.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <Button type="submit" variant="outline" size="sm">Reject destination</Button>
                    </form>
                  </div>
                ) : (
                  <div className="mt-3 border border-blue-200 bg-blue-50 px-3 py-3 text-[11px] text-blue-950">
                    <p className="font-bold">Verification amounts: {formatCents(account.microdepositAmount1 ?? 0)} and {formatCents(account.microdepositAmount2 ?? 0)}</p>
                    <p className="mt-1 leading-relaxed">Share these amounts separately; the customer must enter them on Linked Accounts. {account.microdepositExpiresAt ? `Expires ${formatDateTime(account.microdepositExpiresAt)}.` : ""} Attempts: {account.microdepositAttempts}/5.
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>

      <div className="border border-gray-200 bg-white px-4 py-3 text-[10.5px] leading-relaxed text-gray-500">
        All balance-changing requests, including admin-entered credits, remain unposted until approved. Linked entries are approved or rejected together so account balances stay in step. The shared customer account cannot access this page.
      </div>
    </div>
  );
}
