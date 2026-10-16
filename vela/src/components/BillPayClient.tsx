"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, FilePlus2, Repeat2, Send } from "lucide-react";
import { addBillPayeeAction, billPayAction, type ActionState } from "@/lib/actions";
import { formatCents, formatDate, parseCents } from "@/lib/money";
import { Alert, Button, Input, Select } from "./ui";

type AccountOption = { id: string; name: string; balance: number };
type PayeeOption = { id: string; name: string; category: string; accountMask: string | null };
type PaymentOption = {
  id: string;
  amount: number;
  scheduledFor: string;
  frequency: string;
  memo: string | null;
  status: string;
  confirmationNumber: string;
  payee: { name: string; accountMask: string | null };
  account: { name: string };
};

type PaymentReview = {
  payeeId: string;
  accountId: string;
  amount: string;
  scheduledFor: string;
  frequency: "ONCE" | "MONTHLY";
  memo: string;
};

function billPaymentStatusLabel(status: string) {
  if (status === "PENDING_APPROVAL" || status === "PROCESSING_APPROVAL") return "Processing";
  if (status === "SCHEDULED") return "Scheduled";
  if (status === "CANCELED" || status === "CANCELLED") return "Canceled";
  if (status === "FAILED") return "Failed";
  return status.toLowerCase().replaceAll("_", " ");
}

export function BillPayClient({
  accounts,
  payees,
  payments,
  minDate,
}: {
  accounts: AccountOption[];
  payees: PayeeOption[];
  payments: PaymentOption[];
  minDate: string;
}) {
  const router = useRouter();
  const [payeeState, addPayeeAction, addingPayee] = useActionState<ActionState, FormData>(addBillPayeeAction, null);
  const [paymentState, submitPayment, paying] = useActionState<ActionState, FormData>(billPayAction, null);
  const [showAdd, setShowAdd] = useState(payees.length === 0);
  const [review, setReview] = useState<PaymentReview | null>(null);
  const [selectedPayeeId, setSelectedPayeeId] = useState(payees[0]?.id ?? "");
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [scheduledFor, setScheduledFor] = useState(minDate);
  const [frequency, setFrequency] = useState<"ONCE" | "MONTHLY">("ONCE");

  useEffect(() => {
    if (payeeState?.success) router.refresh();
  }, [payeeState, router]);

  const selectedPayee = payees.find((payee) => payee.id === (review?.payeeId ?? selectedPayeeId));
  const selectedAccount = accounts.find((account) => account.id === (review?.accountId ?? selectedAccountId));

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-gray-300 bg-white shadow-panel">
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
            <h2 className="text-[15px] font-bold text-bank-navy">Pay a bill</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">Choose a saved company, payment account and date.</p>
          </div>
          <div className="p-5">
            {paymentState?.error && <div className="mb-4"><Alert tone="error" title="Payment not scheduled">{paymentState.error}</Alert></div>}
            {payees.length === 0 ? (
              <Alert tone="info" title="Add a biller to get started">Save a company and its biller reference below before scheduling a payment.</Alert>
            ) : !review ? (
              <form
                action={undefined}
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  if (!form.reportValidity()) return;
                  const data = new FormData(form);
                  setReview({
                    payeeId: String(data.get("payeeId") ?? ""),
                    accountId: String(data.get("accountId") ?? ""),
                    amount: String(data.get("amount") ?? ""),
                    scheduledFor: String(data.get("scheduledFor") ?? ""),
                    frequency: String(data.get("frequency") ?? "ONCE") === "MONTHLY" ? "MONTHLY" : "ONCE",
                    memo: String(data.get("memo") ?? "").trim(),
                  });
                }}
              >
                <Select
                  label="Company"
                  name="payeeId"
                  value={selectedPayeeId}
                  onChange={(event) => setSelectedPayeeId(event.target.value)}
                  required
                >
                  {payees.map((payee) => (
                    <option key={payee.id} value={payee.id}>
                      {payee.name}{payee.accountMask ? ` · ${payee.accountMask}` : ""}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Pay from"
                  name="accountId"
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  required
                >
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {formatCents(account.balance)}</option>)}
                </Select>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="amount" label="Amount" inputMode="decimal" placeholder="$0.00" required />
                  <Input
                    name="scheduledFor"
                    label="Payment date"
                    type="date"
                    min={minDate}
                    value={scheduledFor}
                    onChange={(event) => setScheduledFor(event.target.value)}
                    required
                  />
                </div>
                <Select name="frequency" label="Repeat" value={frequency} onChange={(event) => setFrequency(event.target.value as "ONCE" | "MONTHLY")}>
                  <option value="ONCE">One time</option>
                  <option value="MONTHLY">Monthly instruction</option>
                </Select>
                <Input name="memo" label="Memo (optional)" placeholder="e.g. October electric bill" maxLength={120} />
                <Button type="submit" variant="navy" size="lg" className="w-full">Review payment</Button>
              </form>
            ) : (
              <form action={submitPayment} className="space-y-4">
                <ReviewBox title="Review your bill payment">
                  <ReviewItem label="Payee" value={`${selectedPayee?.name ?? "Company"}${selectedPayee?.accountMask ? ` · ${selectedPayee.accountMask}` : ""}`} />
                  <ReviewItem label="Pay from" value={`${selectedAccount?.name ?? "Account"} · Available ${formatCents(selectedAccount?.balance ?? 0)}`} />
                  <ReviewItem label="Amount" value={formatCents(parseCents(review.amount) ?? 0)} emphasis />
                  <ReviewItem label="Payment date" value={formatDate(new Date(`${review.scheduledFor}T12:00:00`))} />
                  <ReviewItem label="Repeat" value={review.frequency === "MONTHLY" ? "Monthly instruction" : "One time"} />
                  {review.memo && <ReviewItem label="Memo" value={review.memo} />}
                  <div className="mt-2 border-t border-gray-200 pt-3 text-[10.5px] leading-relaxed text-gray-600">
                    The payment will appear in account activity as it is processed. Your balance updates when processing is complete.
                  </div>
                </ReviewBox>
                <input type="hidden" name="payeeId" value={review.payeeId} />
                <input type="hidden" name="accountId" value={review.accountId} />
                <input type="hidden" name="amount" value={review.amount} />
                <input type="hidden" name="scheduledFor" value={review.scheduledFor} />
                <input type="hidden" name="frequency" value={review.frequency} />
                <input type="hidden" name="memo" value={review.memo} />
                <div className="grid grid-cols-2 gap-3">
                  <Button type="button" variant="outline" onClick={() => setReview(null)}><ArrowLeft className="h-4 w-4" /> Edit</Button>
                  <Button type="submit" loading={paying} variant="navy"><Send className="h-4 w-4" /> Submit payment</Button>
                </div>
              </form>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="border-l-4 border-bank-red bg-gray-50 p-4">
            <h3 className="flex items-center gap-2 text-[12.5px] font-bold text-bank-navy"><CalendarDays className="h-4 w-4 text-bank-red" /> Scheduled payments</h3>
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-600">Select a payment date and review the details before submitting. Payments appear in account activity as they are processed.</p>
          </div>
        </aside>
      </section>

      <section className="border border-gray-300 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3">
          <div>
            <h2 className="text-[15px] font-bold text-bank-navy">Saved companies</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">Biller references are stored encrypted at rest.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd((show) => !show)}>
            <FilePlus2 className="h-3.5 w-3.5" /> {showAdd ? "Close" : "Add company"}
          </Button>
        </div>
        {payees.length > 0 && (
          <div className="divide-y divide-gray-100">
            {payees.map((payee) => (
              <div key={payee.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="text-[12.5px] font-bold text-gray-900">{payee.name}</p>
                  <p className="text-[10.5px] text-gray-500">{payee.category.toLowerCase()} · {payee.accountMask ?? "Biller reference saved"}</p>
                </div>
                <span className="text-[11px] font-semibold text-bank-link">Ready to pay</span>
              </div>
            ))}
          </div>
        )}
        {showAdd && (
          <div className="border-t border-gray-200 p-5">
            {payeeState?.error && <div className="mb-4"><Alert tone="error" title="Company not saved">{payeeState.error}</Alert></div>}
            {payeeState?.success && <div className="mb-4"><Alert tone="success">{payeeState.message ?? "Company saved."}</Alert></div>}
            <form action={addPayeeAction} className="grid gap-4 sm:grid-cols-2">
              <Input name="name" label="Company name" placeholder="e.g. City Electric" required maxLength={80} />
              <Select name="category" label="Category" defaultValue="UTILITIES" required>
                <option value="UTILITIES">Utilities</option>
                <option value="HOUSING">Housing</option>
                <option value="HEALTH">Health</option>
                <option value="OTHER">Other</option>
              </Select>
              <Input name="accountNumber" label="Biller reference / account number" placeholder="Enter biller reference" required maxLength={80} hint="Encrypted before it is stored; only the last four digits are displayed." />
              <div className="flex items-end">
                <Button type="submit" loading={addingPayee} variant="navy" className="w-full"><FilePlus2 className="h-4 w-4" /> Save company</Button>
              </div>
            </form>
          </div>
        )}
      </section>

      <section className="border border-gray-300 bg-white shadow-panel">
        <div className="border-b border-gray-200 bg-gray-50 px-5 py-3">
          <h2 className="text-[15px] font-bold text-bank-navy">Payment activity</h2>
        </div>
        {payments.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12px] text-gray-500">Your scheduled bill payments will appear here.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {payments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center border border-gray-200 bg-gray-50 text-bank-navy"><Repeat2 className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-gray-900">{payment.payee.name}</p>
                  <p className="text-[10.5px] text-gray-500">{formatDate(new Date(payment.scheduledFor))} · {payment.account.name} · {payment.frequency === "MONTHLY" ? "Monthly instruction" : "One time"}</p>
                  {payment.memo && <p className="truncate text-[10px] text-gray-500">Memo: {payment.memo}</p>}
                  <p className="text-[10px] text-gray-500">Confirmation {payment.confirmationNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold tabular-nums text-gray-900">-{formatCents(payment.amount)}</p>
                  <span className="text-[10px] font-bold uppercase text-amber-700">{billPaymentStatusLabel(payment.status)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-300 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 text-[13px] font-bold text-bank-navy">
        <CheckCircle2 className="h-4 w-4 text-bank-red" /> {title}
      </div>
      <div className="space-y-3 px-4 py-4">{children}</div>
    </div>
  );
}

function ReviewItem({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[12px]">
      <span className="text-gray-500">{label}</span>
      <span className={`max-w-[68%] text-right ${emphasis ? "text-[15px] font-bold tabular-nums text-bank-navy" : "font-semibold text-gray-900"}`}>{value}</span>
    </div>
  );
}
