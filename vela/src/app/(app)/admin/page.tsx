import type { Metadata } from "next";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, formatDateTime } from "@/lib/money";
import { paymentMethodLabel, safeCounterparty, safeTransactionDescription } from "@/lib/external-account-display";
import { adminEnrollCustomerAction, approveTransactionGroupAction, adminCreditAction, adminDeleteActivityAction, adminLockUserAction, adminPauseHistoryAction, adminResetAuthenticatorAction, adminUnlockUserAction, rejectTransactionGroupAction, reviewEnrollmentAction, reviewExternalAccountAction, reviewProductApplicationAction } from "@/lib/admin-actions";
import { accountTypeLabel, productByCode, productKindLabel } from "@/lib/products";
import { PageHeader } from "@/components/transactions";
import { Alert, Button, Input, Panel, Select, Textarea } from "@/components/ui";

export const metadata: Metadata = { title: "Admin approvals — FMB" };

const NOTICES: Record<string, { tone: "success" | "error" | "info" | "warn"; title: string; body: string }> = {
  approved: { tone: "success", title: "Transaction approved", body: "The entry was posted to the selected account balances." },
  rejected: { tone: "info", title: "Transaction rejected", body: "The entry was not posted. Account balances did not change." },
  unavailable: { tone: "info", title: "Already reviewed", body: "That transaction is no longer waiting for a decision." },
  insufficient: { tone: "error", title: "Approval not posted", body: "The sending account no longer has enough available funds." },
  account: { tone: "error", title: "Account unavailable", body: "One of the accounts is closed or inactive. The entry remains unposted." },
  error: { tone: "error", title: "Could not approve transaction", body: "No balance change was made. Please review the item and try again." },
  "credit-error": { tone: "error", title: "Payment not recorded", body: "Check the recipient, sender, method, amount, activity date and optional source details." },
  "credit-confirm": { tone: "error", title: "Confirmation required", body: "Confirm the sender, destination and amount before submitting this payment." },
  "credit-submitted": { tone: "success", title: "Payment submitted for approval", body: "The selected recipient account or accounts will be updated only after approval." },
  "challenge-issued": { tone: "success", title: "Verification challenge started", body: "Share the displayed amounts with the customer through a separate trusted channel." },
  "external-rejected": { tone: "info", title: "External account rejected", body: "The destination cannot be used. No funds were moved." },
  "external-unavailable": { tone: "info", title: "External account already reviewed", body: "That destination is no longer waiting for review." },
  "enrollment-approved": { tone: "success", title: "Enrollment approved", body: "The applicant can now sign in without the generated history; their accounts keep their current balances." },
  "enrollment-approved-history": { tone: "success", title: "Enrollment approved with history", body: "The applicant can now sign in. Generated Jan 2023–Oct 2026 activity has been provisioned, and the same debit and credit pattern will keep posting after that." },
  "enrollment-history-error": { tone: "error", title: "History could not be added", body: "Enrollment was approved, but the generated activity could not be provisioned. Review the new account before proceeding." },
  "enrollment-history-choice": { tone: "warn", title: "Choose an account history option", body: "Select whether to include the generated Jan 2023–Oct 2026 history before approving this enrollment." },
  "enrollment-rejected": { tone: "info", title: "Enrollment rejected", body: "The applicant cannot sign in. Any opening-funds request was also rejected without changing balances." },
  "enrollment-unavailable": { tone: "info", title: "Enrollment already reviewed", body: "That application is no longer awaiting a decision." },
  "enrollment-pending": { tone: "warn", title: "Approve enrollment first", body: "The customer cannot use the account until their enrollment is approved." },
  "authenticator-reset": { tone: "success", title: "Authenticator reset", body: "The user must set up Google Authenticator again the next time they sign in." },
  "authenticator-reset-confirm": { tone: "error", title: "Confirmation required", body: "Confirm the user reset before changing authenticator access." },
  "authenticator-unavailable": { tone: "info", title: "Authenticator not reset", body: "That user may already have an active reset or no authenticator to reset." },
  "product-approved": { tone: "success", title: "Product application approved", body: "The new account or card is now on the customer's Account Summary." },
  "product-approved-history": { tone: "success", title: "Product approved with history", body: "The account is open and generated activity from 2023 through today has been added, following the same debit and credit pattern." },
  "product-history-error": { tone: "error", title: "History could not be added", body: "The product was approved, but generated activity could not be provisioned. Review the new account before proceeding." },
  "product-history-choice": { tone: "warn", title: "Choose an account history option", body: "Select whether to include generated activity before approving this account or card." },
  "product-rejected": { tone: "info", title: "Product application rejected", body: "No account or card was issued." },
  "product-unavailable": { tone: "info", title: "Application already reviewed", body: "That product application is no longer awaiting a decision." },
  "product-card-exists": { tone: "error", title: "Card already issued", body: "That checking account already has a debit card. The application was not changed." },
  "history-paused": { tone: "success", title: "Generated history paused", body: "New pattern debits and credits will not post to this customer's accounts until you resume them." },
  "history-resumed": { tone: "success", title: "Generated history resumed", body: "The same debit and credit pattern will keep posting on this customer's accounts." },
  "locked": { tone: "success", title: "Account locked", body: "The customer cannot sign in. They will see the reason you entered." },
  "unlocked": { tone: "success", title: "Account unlocked", body: "The customer can sign in again." },
  "lock-reason": { tone: "error", title: "Lock reason required", body: "Enter a reason between 8 and 280 characters so the customer knows why access was locked." },
  "lock-confirm": { tone: "error", title: "Confirmation required", body: "Confirm the lockout before restricting this customer's access." },
  "lock-self": { tone: "error", title: "Cannot lock this user", body: "Administrators cannot lock their own access." },
  "customer-unavailable": { tone: "info", title: "Customer not updated", body: "That customer is no longer available for this action." },
  "enroll-email-exists": { tone: "error", title: "Email already in use", body: "An account with that email already exists." },
  "enroll-username-exists": { tone: "error", title: "Username unavailable", body: "That Username / User ID is already taken." },
  "enroll-invalid-username": { tone: "error", title: "Username invalid", body: "Use 3–32 letters, numbers, periods, underscores or hyphens (no @). Case-insensitive." },
  "enroll-error": { tone: "error", title: "Could not enroll customer", body: "Check the name, email, username and passcode (8+ characters) and try again." },
  "activity-deleted": { tone: "success", title: "Activity deleted", body: "The selected entry was removed and the account balance was rebuilt from remaining posted activity." },
  "activity-confirm": { tone: "error", title: "Confirmation required", body: "Confirm deletion before removing activity. This cannot be undone." },
  "activity-unavailable": { tone: "info", title: "Activity not deleted", body: "That entry is no longer on the account." },
};

const SECTIONS = [
  { id: "approvals", label: "Approvals" },
  { id: "payments", label: "Payments" },
  { id: "customers", label: "Customers & security" },
  { id: "activity", label: "Account activity" },
];

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-gray-300 pb-2 pt-3">
      <h2 className="text-[18px] font-bold text-bank-navy">{title}</h2>
      <p className="mt-0.5 text-[11.5px] text-gray-500">{description}</p>
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string; account?: string }> }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const selectedAccountId = String(params.account ?? "").trim();
  const [pendingRows, accounts, allCustomerAccounts, externalAccounts, enrollmentApplications, productApplications, authenticatorUsers, customers, activityRows] = await Promise.all([
    db.transaction.findMany({
      where: { status: "PENDING_APPROVAL" },
      include: { account: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.account.findMany({
      where: { status: "ACTIVE", user: { role: "CUSTOMER", enrollmentStatus: "APPROVED" } },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: [{ user: { lastName: "asc" } }, { name: "asc" }],
    }),
    db.account.findMany({
      where: { user: { role: "CUSTOMER" } },
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
    db.productApplication.findMany({
      where: { status: "PENDING_APPROVAL" },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    db.user.findMany({
      where: { enrollmentStatus: "APPROVED", mfaEnabled: true },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
      orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      take: 100,
    }),
    db.user.findMany({
      where: { role: "CUSTOMER", enrollmentStatus: "APPROVED" },
      select: { id: true, email: true, firstName: true, lastName: true, historyPaused: true, historyPausedAt: true, accessLocked: true, lockReason: true, lockedAt: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 100,
    }),
    selectedAccountId
      ? db.transaction.findMany({
          where: { accountId: selectedAccountId },
          include: { account: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
          orderBy: { createdAt: "desc" },
          take: 75,
        })
      : Promise.resolve([]),
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
  const pendingTotal = queue.length + enrollmentApplications.length + productApplications.length + externalAccounts.length;
  const summary = [
    { label: "Transactions", count: queue.length, href: "#approvals" },
    { label: "Enrollments", count: enrollmentApplications.length, href: "#approvals" },
    { label: "Account & card applications", count: productApplications.length, href: "#approvals" },
    { label: "External accounts", count: externalAccounts.length, href: "#approvals" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin approvals"
        subtitle={`Signed in as ${admin.email} · ${pendingTotal} item${pendingTotal === 1 ? "" : "s"} awaiting review`}
      />
      {notice && <Alert tone={notice.tone} title={notice.title}>{notice.body}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="admin-summary">
        {summary.map((item) => (
          <a key={item.label} href={item.href} className="block border border-gray-300 bg-white px-4 py-3 shadow-panel hover:border-bank-navy">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{item.label}</p>
            <p className={`mt-1 text-[26px] font-bold leading-none tabular-nums ${item.count > 0 ? "text-bank-navy" : "text-gray-400"}`}>{item.count}</p>
            <p className="mt-1.5 text-[10.5px] text-gray-500">{item.count > 0 ? "Needs review" : "All clear"}</p>
          </a>
        ))}
      </div>

      <nav aria-label="Admin sections" className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 border border-gray-300 bg-white px-2 py-1.5 shadow-panel">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="rounded px-3 py-1.5 text-[11.5px] font-semibold text-bank-navy hover:bg-bank-sand">{section.label}</a>
        ))}
      </nav>

      <section id="approvals" className="scroll-mt-20 space-y-4">
        <SectionHeading title="Approvals" description="Everything waiting on an administrator decision." />
        <Panel title="Enroll new customer" bodyClassName="p-5">
          <p className="mb-4 text-[11px] leading-relaxed text-gray-600">Create a customer account directly. This is the only way to enroll now that public self-enrollment is disabled. The customer can sign in immediately with the Username / User ID and passcode you set.</p>
          <form action={adminEnrollCustomerAction} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="First name" name="firstName" placeholder="First name" autoComplete="given-name" required />
              <Input label="Last name" name="lastName" placeholder="Last name" autoComplete="family-name" required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="customer@example.com" required />
              <Input label="Username / User ID" name="username" type="text" placeholder="e.g. sam.lee" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Phone (optional)" name="phone" type="tel" autoComplete="tel" placeholder="(555) 555-0100" />
              <Input label="Temporary passcode" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" required />
            </div>
            <Select name="historyChoice" label="Starting account history" defaultValue="" required>
              <option value="" disabled>Choose an option</option>
              <option value="include">Include generated history · Jan 2023–Oct 2026</option>
              <option value="none">No generated history · keep at $0</option>
            </Select>
            <Button type="submit" variant="navy" className="w-full">Enroll customer</Button>
          </form>
        </Panel>
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
              const isAdminPayment = primary.reference?.startsWith("adminach_") || primary.reference?.startsWith("adminwire_");
              const dateLabel = isAdminPayment ? "Activity date" : "Submitted";
              return (
                <article key={group.key} data-testid="approval-group" data-group-key={group.key} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-gray-900">
                        <Clock3 className="h-4 w-4 text-amber-700" />
                        {safeTransactionDescription(primary.description)}
                        {method && <span className="rounded-sm border border-gray-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">{method}</span>}
                      </p>
                      <p className="mt-1 text-[10.5px] text-gray-500">{dateLabel} {formatDateTime(group.createdAt)} · {group.rows.length === 1 ? "1 account entry" : `${group.rows.length} linked account entries`}</p>
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
                <p className="mt-2 text-[10.5px] leading-relaxed text-gray-600">Choose whether to add generated account activity from Jan 2023 through Oct 2026. After that, the same debit and credit pattern keeps posting so the ledger stays current. If you omit it, a new signup keeps its current balance ($0 before any separately approved funding). Any opening-funds request still needs separate approval.</p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <form action={reviewEnrollmentAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="userId" value={applicant.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <div className="min-w-[260px]">
                      <Select name="historyChoice" label="Starting account history" defaultValue="" required>
                        <option value="" disabled>Choose an option</option>
                        <option value="include">Include generated history · Jan 2023–Oct 2026</option>
                        <option value="none">No generated history · keep current balance</option>
                      </Select>
                    </div>
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

      <Panel title={`Account and card applications · ${productApplications.length}`} bodyClassName="p-0">
        {productApplications.length === 0 ? (
          <div className="px-5 py-7 text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-700" />
            <p className="mt-2 text-[12px] font-semibold text-gray-700">No product applications awaiting review</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {productApplications.map((application) => {
              const product = productByCode(application.productCode);
              const needsHistory = application.kind === "ACCOUNT" || application.kind === "CREDIT_CARD";
              return (
                <article key={application.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[12.5px] font-bold text-gray-900">{application.user.firstName} {application.user.lastName}</p>
                      <p className="mt-1 text-[11px] text-gray-600">{application.user.email} · {product?.name ?? application.productCode} · {productKindLabel(application.kind)}</p>
                      {application.nickname ? <p className="mt-1 text-[10px] text-gray-500">Nickname {application.nickname}</p> : null}
                      <p className="mt-1 text-[10px] text-gray-500">Submitted {formatDateTime(application.createdAt)}</p>
                    </div>
                    <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-bold uppercase text-amber-900">Awaiting product approval</span>
                  </div>
                  {needsHistory ? (
                    <p className="mt-2 text-[10.5px] leading-relaxed text-gray-600">Choose whether to add generated activity from Jan 2023 through today, following the same debit and credit pattern as the enrollment history. If you omit it, the product opens at $0.</p>
                  ) : (
                    <p className="mt-2 text-[10.5px] leading-relaxed text-gray-600">Approving issues the debit card on the selected checking account. It appears in the Cards section under the customer&apos;s accounts.</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <form action={reviewProductApplicationAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="applicationId" value={application.id} />
                      <input type="hidden" name="decision" value="approve" />
                      {needsHistory ? (
                        <div className="min-w-[260px]">
                          <Select name="historyChoice" label="Starting account history" defaultValue="" required>
                            <option value="" disabled>Choose an option</option>
                            <option value="include">Include generated history · Jan 2023 through today</option>
                            <option value="none">No generated history · open at $0</option>
                          </Select>
                        </div>
                      ) : null}
                      <Button type="submit" variant="navy" size="sm">Approve product</Button>
                    </form>
                    <form action={reviewProductApplicationAction}>
                      <input type="hidden" name="applicationId" value={application.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <Button type="submit" variant="outline" size="sm">Reject</Button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

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
      </section>

      <section id="payments" className="scroll-mt-20 space-y-4">
        <SectionHeading title="Payments" description="Record a confirmed payment to one or all customers. It still needs approval before it posts." />
      <Panel title="Send a payment to customer(s)" bodyClassName="p-5">
        <div className="mb-4 border-l-4 border-bank-red bg-gray-50 px-3 py-2.5 text-[11px] leading-relaxed text-gray-600">
          Record a confirmed payment from an individual or organization. Choose one customer deposit account or credit card, or all approved customers’ active checking accounts; the amount applies to each recipient. Balance changes still require approval.
        </div>
        {accounts.length === 0 ? (
          <p className="text-[12px] text-gray-500">There are no active customer accounts to credit.</p>
        ) : (
          <form action={adminCreditAction} className="space-y-3">
            <Select name="recipient" label="Recipient" defaultValue="" required>
              <option value="" disabled>Select a customer account</option>
              <option value="ALL_CUSTOMERS">All approved customers · checking accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.user.firstName} {account.user.lastName} — {account.name} · {accountTypeLabel(account.type)} · {account.accountNumber.slice(-4)}
                </option>
              ))}
            </Select>
            <Select name="paymentMethod" label="Payment method" defaultValue="ACH" required>
              <option value="ACH">ACH</option>
              <option value="WIRE">Wire</option>
            </Select>
            <Input name="senderName" label="Payment from · individual or organization" placeholder="Jordan Lee or Acme Foundation" autoComplete="off" required maxLength={65} />
            <Input name="sourceName" label="Source bank or institution (optional)" placeholder="Example Credit Union" autoComplete="off" maxLength={80} />
            <Input name="sourceLast4" label="Source account last four digits (optional)" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="4321" autoComplete="off" />
            <Input name="amount" label="Amount per recipient" inputMode="decimal" placeholder="$0.00" required />
            <Input name="activityDate" label="Date shown in account activity" type="date" defaultValue={today} hint="This calendar date is used in the customer's transaction history." required />
            <label className="flex items-start gap-2 text-[10.5px] leading-relaxed text-gray-600">
              <input type="checkbox" name="confirm" value="yes" required className="mt-0.5" />
              I independently confirmed these funds and details. This request still needs approval.
            </label>
            <Button type="submit" variant="navy" className="w-full">Submit payment for approval</Button>
          </form>
        )}
      </Panel>
      </section>

      <section id="customers" className="scroll-mt-20 space-y-4">
        <SectionHeading title="Customers &amp; security" description="Lock access, pause generated history and reset authenticators." />
      <Panel title={`Customer access & generated history · ${customers.length}`} bodyClassName="p-0">
        {customers.length === 0 ? (
          <div className="px-5 py-6 text-center text-[11px] text-gray-500">No approved customers to manage.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {customers.map((customer) => (
              <article key={customer.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12.5px] font-bold text-gray-900">{customer.firstName} {customer.lastName} · {customer.email}</p>
                    <p className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                      <span className={`border px-1.5 py-0.5 font-bold uppercase ${customer.historyPaused ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                        History {customer.historyPaused ? "paused" : "running"}
                      </span>
                      <span className={`border px-1.5 py-0.5 font-bold uppercase ${customer.accessLocked ? "border-red-300 bg-red-50 text-red-900" : "border-gray-200 bg-gray-50 text-gray-700"}`}>
                        {customer.accessLocked ? "Locked" : "Access open"}
                      </span>
                    </p>
                    {customer.accessLocked && customer.lockReason ? (
                      <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-gray-700">Lock reason: {customer.lockReason}</p>
                    ) : null}
                  </div>
                  <form action={adminPauseHistoryAction}>
                    <input type="hidden" name="userId" value={customer.id} />
                    <input type="hidden" name="paused" value={customer.historyPaused ? "no" : "yes"} />
                    <Button type="submit" variant="outline" size="sm">{customer.historyPaused ? "Resume history" : "Pause history"}</Button>
                  </form>
                </div>
                {customer.accessLocked ? (
                  <form action={adminUnlockUserAction} className="mt-3">
                    <input type="hidden" name="userId" value={customer.id} />
                    <Button type="submit" variant="navy" size="sm">Unlock account</Button>
                  </form>
                ) : (
                  <form action={adminLockUserAction} className="mt-3 space-y-2">
                    <input type="hidden" name="userId" value={customer.id} />
                    <Textarea name="lockReason" label="Lockout reason" placeholder="Suspicious login attempts from an unrecognized device." required minLength={8} maxLength={280} />
                    <label className="flex items-start gap-2 text-[10.5px] leading-relaxed text-gray-600">
                      <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-3.5 w-3.5 accent-[#b3202e]" />
                      Lock this customer out of online banking. They will see this reason at sign-in.
                    </label>
                    <Button type="submit" variant="outline" size="sm">Lock account</Button>
                  </form>
                )}
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
      </section>

      <section id="activity" className="scroll-mt-20 space-y-4">
        <SectionHeading title="Account activity" description="Review and remove entries from a customer account." />
      <Panel title="Delete account activity" bodyClassName="p-0">
        <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
          <p className="text-[11px] leading-relaxed text-gray-600">Remove a posted or pending entry from any customer account. Posted balances are rebuilt from what remains. Linked internal transfers and Quick Pay pairs are removed together.</p>
          <form method="get" action="/admin" className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <Select name="account" label="Customer account" defaultValue={selectedAccountId} required>
                <option value="" disabled>Select an account</option>
                {allCustomerAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.user.firstName} {account.user.lastName} — {account.name} · {accountTypeLabel(account.type)} · {account.accountNumber.slice(-4)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="navy" size="sm">View activity</Button>
          </form>
        </div>
        {!selectedAccountId ? (
          <p className="px-5 py-6 text-center text-[11px] text-gray-500">Choose an account to review and delete activity.</p>
        ) : activityRows.length === 0 ? (
          <p className="px-5 py-6 text-center text-[11px] text-gray-500">No activity on this account.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activityRows.map((row) => (
              <article key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-gray-900">{safeTransactionDescription(row.description)}</p>
                  <p className="mt-0.5 text-[10.5px] text-gray-500">
                    {formatDateTime(row.createdAt)} · {row.status.replaceAll("_", " ")} · {formatCents(row.amount, { sign: true })}
                    {row.counterparty ? ` · ${safeCounterparty(row.counterparty)}` : ""}
                  </p>
                </div>
                <form action={adminDeleteActivityAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="transactionId" value={row.id} />
                  <input type="hidden" name="accountId" value={selectedAccountId} />
                  <label className="flex items-center gap-1.5 text-[9.5px] text-gray-600">
                    <input type="checkbox" name="confirm" value="yes" required className="h-3.5 w-3.5 accent-[#b3202e]" />
                    Delete this entry
                  </label>
                  <Button type="submit" variant="outline" size="sm">Delete</Button>
                </form>
              </article>
            ))}
          </div>
        )}
      </Panel>
      </section>

      <div className="border border-gray-200 bg-white px-4 py-3 text-[10.5px] leading-relaxed text-gray-500">
        All balance-changing requests, including admin-entered customer payments, remain unposted until approved. Payments to multiple customers are grouped so the batch is approved or rejected together. The shared customer account cannot access this page.
      </div>
    </div>
  );
}
