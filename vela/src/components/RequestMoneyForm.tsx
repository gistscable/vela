"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, CheckCircle2, HandCoins, Send } from "lucide-react";
import { requestMoneyAction, type ActionState } from "@/lib/actions";
import { formatCents, parseCents } from "@/lib/money";
import { Alert, Button, Input, Select } from "@/components/ui";

type AccountOption = { id: string; name: string; balance: number };
type RequestReview = { accountId: string; recipientEmail: string; amount: string; memo: string };

export function RequestMoneyForm({ accounts }: { accounts: AccountOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(requestMoneyAction, null);
  const [review, setReview] = useState<RequestReview | null>(null);
  const selectedAccount = accounts.find((account) => account.id === review?.accountId);

  return (
    <form
      action={review ? formAction : undefined}
      className="space-y-4"
      onSubmit={(event) => {
        if (review) return;
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        setReview({
          accountId: String(data.get("accountId") ?? ""),
          recipientEmail: String(data.get("recipientEmail") ?? "").trim().toLowerCase(),
          amount: String(data.get("amount") ?? ""),
          memo: String(data.get("memo") ?? "").trim() || "Money request",
        });
      }}
    >
      {state?.error && <Alert tone="error" title="Request not sent">{state.error}</Alert>}
      {!review ? (
        <>
          <Select name="accountId" label="Deposit into" defaultValue={accounts[0]?.id} required>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {formatCents(account.balance)}</option>)}
          </Select>
          <Input name="recipientEmail" label="Request from member" type="email" autoComplete="email" placeholder="member@example.com" hint="The person must have a First Meridian account." required />
          <Input name="amount" label="Amount" inputMode="decimal" placeholder="$0.00" required />
          <Input name="memo" label="Reason (optional)" placeholder="e.g. Dinner split" maxLength={120} />
          <Button type="submit" variant="navy" size="lg" className="w-full"><HandCoins className="h-4 w-4" /> Review request</Button>
        </>
      ) : (
        <>
          <div className="border border-gray-300 bg-white">
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-bank-red" />
              <h2 className="text-[13px] font-bold text-bank-navy">Review your request</h2>
            </div>
            <div className="space-y-3 px-4 py-4 text-[12px]">
              <ReviewRow label="Request from" value={review.recipientEmail} />
              <ReviewRow label="Deposit into" value={selectedAccount?.name ?? "Account"} />
              <ReviewRow label="Amount" value={formatCents(parseCents(review.amount) ?? 0)} strong />
              <ReviewRow label="Reason" value={review.memo} />
              <p className="border-t border-gray-200 pt-3 text-[10.5px] leading-relaxed text-gray-600">If the recipient chooses to pay, the transfer still requires approval.</p>
            </div>
          </div>
          <input type="hidden" name="accountId" value={review.accountId} />
          <input type="hidden" name="recipientEmail" value={review.recipientEmail} />
          <input type="hidden" name="amount" value={review.amount} />
          <input type="hidden" name="memo" value={review.memo} />
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" onClick={() => setReview(null)}><ArrowLeft className="h-4 w-4" /> Edit</Button>
            <Button type="submit" loading={pending} variant="navy"><Send className="h-4 w-4" /> Send request</Button>
          </div>
        </>
      )}
    </form>
  );
}

function ReviewRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className={`max-w-[70%] text-right ${strong ? "font-bold tabular-nums text-bank-navy" : "font-semibold text-gray-900"}`}>{value}</span>
    </div>
  );
}
