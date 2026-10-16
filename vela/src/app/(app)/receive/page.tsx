import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAccounts } from "@/lib/queries";
import { formatCents, formatDate } from "@/lib/money";
import { closeMoneyRequestAction, payMoneyRequestAction } from "@/lib/actions";
import { Alert, Button, Panel, Select } from "@/components/ui";
import { PageHeader } from "@/components/transactions";
import { RequestMoneyForm } from "@/components/RequestMoneyForm";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Receive Money — First Meridian" };

const notices: Record<string, { title: string; body: string; tone: "success" | "info" | "error" }> = {
  requested: { title: "Request sent", body: "The member can review your request; any payment remains subject to admin approval.", tone: "success" },
  paid: { title: "Payment approved", body: "The internal transfer was posted to both accounts.", tone: "success" },
  declined: { title: "Request declined", body: "The request was declined. No funds were moved.", tone: "info" },
  canceled: { title: "Request canceled", body: "Your open request was canceled.", tone: "info" },
  insufficient: { title: "Payment not sent", body: "The selected account does not have enough available funds.", tone: "error" },
  destination: { title: "Payment not sent", body: "The receiving account is no longer active.", tone: "error" },
  account: { title: "Choose an account", body: "Select an active account that belongs to you.", tone: "error" },
  unavailable: { title: "Request unavailable", body: "It may already have been paid, canceled or declined.", tone: "error" },
  confirm: { title: "Confirm payment", body: "Select the confirmation box before paying a request.", tone: "error" },
  error: { title: "Payment not sent", body: "We could not complete that request. Please try again.", tone: "error" },
};

function requestStatusLabel(status: string) {
  return status === "PENDING_APPROVAL" ? "Awaiting approval" : status.toLowerCase().replaceAll("_", " ");
}

export default async function ReceivePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const [allAccounts, incoming, outgoing] = await Promise.all([
    getAccounts(user.id),
    db.moneyRequest.findMany({
      where: { recipientId: user.id },
      include: { requester: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    db.moneyRequest.findMany({
      where: { requesterId: user.id },
      include: { recipient: { select: { firstName: true, lastName: true, email: true } }, account: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);
  const accounts = allAccounts.filter((account) => account.status === "ACTIVE");
  const notice = params.notice ? notices[params.notice] : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Receive money"
        subtitle="Request funds from another First Meridian member. External incoming transfers are not enabled."
        actions={<Link href="/transfer?tab=send" className="text-[11.5px] font-semibold text-bank-link underline underline-offset-2">Send money instead</Link>}
      />
      {notice && <Alert tone={notice.tone} title={notice.title}>{notice.body}</Alert>}
      <Alert tone="info" title="First Meridian member transfers">
        A payment request stays unposted until an admin approves it. Both account balances remain unchanged beforehand; no outside bank or payment network is contacted.
      </Alert>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel title="Request money" bodyClassName="p-4 sm:p-5">
          {accounts.length ? <RequestMoneyForm accounts={accounts.map(({ id, name, balance }) => ({ id, name, balance }))} /> : <p className="text-[12px] text-gray-600">No active account is available to receive a request.</p>}
        </Panel>

        <Panel title="Requests sent to you" bodyClassName="p-0">
          {incoming.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] text-gray-500">No one has requested money from you.</p>
          ) : (
            <div className="divide-y divide-gray-200">
              {incoming.map((request) => (
                <div key={request.id} className="space-y-3 px-4 py-4 sm:px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-gray-900">{request.requester.firstName} {request.requester.lastName}</p>
                      <p className="mt-0.5 text-[10.5px] text-gray-500">{request.requester.email} · {formatDate(request.createdAt)}</p>
                      {request.memo && <p className="mt-1 text-[11px] text-gray-600">{request.memo}</p>}
                      <p className="mt-1 text-[10px] text-gray-500">Ref. {request.reference}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-bold tabular-nums text-gray-900">{formatCents(request.amount)}</p>
                      <p className={`mt-1 text-[10px] font-semibold ${request.status === "OPEN" ? "text-bank-link" : "text-gray-500"}`}>{requestStatusLabel(request.status)}</p>
                    </div>
                  </div>
                  {request.status === "OPEN" && (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      {accounts.length ? (
                        <form action={payMoneyRequestAction} className="space-y-2">
                          <input type="hidden" name="requestId" value={request.id} />
                          <Select name="accountId" label="Pay from" defaultValue={accounts[0]?.id} required>
                            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {formatCents(account.balance)}</option>)}
                          </Select>
                          <label className="flex items-start gap-2 text-[10.5px] leading-relaxed text-gray-600">
                            <input type="checkbox" name="confirm" value="yes" required className="mt-0.5" />
                            Submit this payment for admin approval. My balance changes only after approval.
                          </label>
                          <Button type="submit" variant="navy" size="sm" className="w-full">Submit for approval</Button>
                        </form>
                      ) : <p className="text-[11px] text-gray-500">No active account is available to make this payment.</p>}
                      <form action={closeMoneyRequestAction} className="self-end">
                        <input type="hidden" name="requestId" value={request.id} />
                        <input type="hidden" name="side" value="recipient" />
                        <Button type="submit" variant="outline" size="sm" className="w-full">Decline</Button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Requests you sent" bodyClassName="p-0">
        {outgoing.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12px] text-gray-500">Requests you send will appear here.</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {outgoing.map((request) => (
              <div key={request.id} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-gray-900">{request.recipient.firstName} {request.recipient.lastName} · {formatCents(request.amount)}</p>
                  <p className="mt-0.5 truncate text-[10.5px] text-gray-500">{request.recipientEmail} · Into {request.account.name} · {formatDate(request.createdAt)}{request.memo ? ` · ${request.memo}` : ""}</p>
                  <p className="mt-0.5 text-[10px] text-gray-500">Ref. {request.reference}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`text-[10px] font-semibold ${request.status === "OPEN" ? "text-bank-link" : "text-gray-500"}`}>{requestStatusLabel(request.status)}</span>
                  {request.status === "OPEN" && (
                    <form action={closeMoneyRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="side" value="requester" />
                      <button type="submit" className="text-[10px] font-semibold text-bank-link underline underline-offset-2">Cancel</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
