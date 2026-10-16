"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpFromLine,
  CheckCircle2,
  LockKeyhole,
  Send,
} from "lucide-react";
import {
  createStripeCheckoutAction,
  depositAction,
  sendMoneyAction,
  transferAction,
  withdrawAction,
  type ActionState,
} from "@/lib/actions";
import { formatCents, parseCents } from "@/lib/money";
import { lastFourDigits, safeExternalNickname, safeInstitutionName } from "@/lib/external-account-display";
import { Alert, Button, Input, Select } from "./ui";

type AccountOption = { id: string; name: string; balance: number; status?: string };
type ExternalDestinationOption = {
  id: string;
  institutionName: string;
  nickname: string;
  accountType: string;
  accountMask: string;
};

type TabId = "deposit" | "withdraw" | "transfer" | "send";

const TABS: { id: TabId; label: string; icon: typeof ArrowDownToLine }[] = [
  { id: "deposit", label: "Deposits & withdrawals", icon: ArrowDownToLine },
  { id: "withdraw", label: "Withdraw funds", icon: ArrowUpFromLine },
  { id: "transfer", label: "Between my accounts", icon: ArrowLeftRight },
  { id: "send", label: "Quick Pay", icon: Send },
];

function AccountSelect({
  name,
  label,
  accounts,
  defaultValue,
  showBalance = true,
  onChange,
}: {
  name: string;
  label: string;
  accounts: AccountOption[];
  defaultValue?: string;
  showBalance?: boolean;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
}) {
  return (
    <Select name={name} label={label} defaultValue={defaultValue ?? accounts[0]?.id} onChange={onChange} required>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
          {showBalance ? ` — ${formatCents(account.balance)}` : ""}
        </option>
      ))}
    </Select>
  );
}

export function MoneyMovement({
  accounts,
  externalDestinations,
  unverifiedDestinationCount = 0,
  savedDestinationCount = externalDestinations.length,
  sharedPreview,
  initialTab = "deposit",
  initialFromId,
  stripeReady = false,
  checkoutNotice,
}: {
  accounts: AccountOption[];
  externalDestinations: ExternalDestinationOption[];
  unverifiedDestinationCount?: number;
  savedDestinationCount?: number;
  sharedPreview: boolean;
  initialTab?: string;
  initialFromId?: string;
  stripeReady?: boolean;
  checkoutNotice?: "returned" | "cancelled";
}) {
  const [tab, setTab] = useState<TabId>((TABS.find((item) => item.id === initialTab)?.id ?? "deposit") as TabId);
  const activeAccounts = accounts.filter((account) => account.status !== "CLOSED");

  return (
    <div>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-300 pb-px">
        {TABS.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-1.5 border-b-[3px] px-3.5 py-2.5 text-[12px] font-semibold transition-colors ${
                active
                  ? "border-bank-red text-bank-navy"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-bank-navy"
              }`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "deposit" && (
        <DepositForm
          accounts={activeAccounts}
          stripeReady={stripeReady}
          checkoutNotice={checkoutNotice}
        />
      )}
      {tab === "withdraw" && (
        <WithdrawForm
          accounts={activeAccounts}
          externalDestinations={externalDestinations}
          unverifiedDestinationCount={unverifiedDestinationCount}
          savedDestinationCount={savedDestinationCount}
          sharedPreview={sharedPreview}
        />
      )}
      {tab === "transfer" && <TransferForm accounts={activeAccounts} initialFromId={initialFromId} />}
      {tab === "send" && <SendForm accounts={activeAccounts} initialFromId={initialFromId} />}
    </div>
  );
}

function DepositForm({
  accounts,
  stripeReady,
  checkoutNotice,
}: {
  accounts: AccountOption[];
  stripeReady: boolean;
  checkoutNotice?: "returned" | "cancelled";
}) {
  const [depositState, depositFormAction, depositPending] = useActionState<ActionState, FormData>(depositAction, null);
  const [stripeState, stripeAction, stripePending] = useActionState<ActionState, FormData>(createStripeCheckoutAction, null);

  return (
    <div className="space-y-4">
      {checkoutNotice === "returned" && (
        <Alert tone="info" title="Deposit submitted">
          Your deposit is processing. Your balance will update when processing is complete.
        </Alert>
      )}
      {checkoutNotice === "cancelled" && <Alert tone="info">Checkout was cancelled. No deposit was posted.</Alert>}

      {stripeReady ? (
        <>
          <form action={stripeAction} className="space-y-4">
            {stripeState?.error && <Alert tone="error" title="Online deposit">{stripeState.error}</Alert>}
            <div className="border border-blue-200 bg-blue-50 px-3.5 py-3 text-[12px] leading-relaxed text-bank-navy">
              <p className="flex items-center gap-2 font-bold"><LockKeyhole className="h-4 w-4" /> Secure online deposit</p>
              <p className="mt-1">Bank details are collected securely.</p>
            </div>
            <AccountSelect name="accountId" label="Deposit into" accounts={accounts} />
            <Input name="amount" label="Deposit amount" inputMode="decimal" placeholder="$0.00" min="1" max="5000" required />
            <Button type="submit" loading={stripePending} variant="navy" size="lg" className="w-full">
              Continue to secure checkout
            </Button>
            <p className="text-[10.5px] text-gray-500">Your balance updates when the deposit has been processed.</p>
          </form>
          <details className="border-t border-gray-200 pt-3">
            <summary className="cursor-pointer text-[11.5px] font-semibold text-bank-link underline underline-offset-2">Use another deposit method</summary>
            <div className="pt-3">
              <DepositRequestForm accounts={accounts} state={depositState} formAction={depositFormAction} pending={depositPending} />
            </div>
          </details>
        </>
      ) : (
        <DepositRequestForm accounts={accounts} state={depositState} formAction={depositFormAction} pending={depositPending} />
      )}
    </div>
  );
}

function DepositRequestForm({
  accounts,
  state,
  formAction,
  pending,
}: {
  accounts: AccountOption[];
  state: ActionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert tone="error" title="Deposit error">{state.error}</Alert>}
      <AccountSelect name="accountId" label="Deposit into" accounts={accounts} />
      <Input name="amount" label="Amount" inputMode="decimal" placeholder="$0.00" required />
      <Select name="source" label="Source">
        <option>External bank ••1234</option>
        <option>External bank ••5678</option>
        <option>Payroll / Direct deposit</option>
      </Select>
      <div className="border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-gray-600">
        Your balance updates when the deposit has been processed.
      </div>
      <Button type="submit" loading={pending} variant="navy" size="lg" className="w-full">
        Submit deposit request
      </Button>
    </form>
  );
}

type WithdrawalReview = { accountId: string; externalAccountId: string; amount: string; paymentMethod: "ACH" | "WIRE" };

function WithdrawForm({
  accounts,
  externalDestinations,
  unverifiedDestinationCount,
  savedDestinationCount,
  sharedPreview,
}: {
  accounts: AccountOption[];
  externalDestinations: ExternalDestinationOption[];
  unverifiedDestinationCount: number;
  savedDestinationCount: number;
  sharedPreview: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(withdrawAction, null);
  const [review, setReview] = useState<WithdrawalReview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewPending, setPreviewPending] = useState(false);
  const source = accounts.find((account) => account.id === review?.accountId);
  const destination = externalDestinations.find((account) => account.id === review?.externalAccountId);

  return (
    <form
      action={!sharedPreview && review ? formAction : undefined}
      className="space-y-4"
      onSubmit={async (event) => {
        if (!review) {
          event.preventDefault();
          const form = event.currentTarget;
          if (!form.reportValidity()) return;
          const data = new FormData(form);
          setReview({
            accountId: String(data.get("accountId") ?? ""),
            externalAccountId: String(data.get("externalAccountId") ?? ""),
            amount: String(data.get("amount") ?? ""),
            paymentMethod: data.get("paymentMethod") === "WIRE" ? "WIRE" : "ACH",
          });
          return;
        }
        if (!sharedPreview) return;

        event.preventDefault();
        setPreviewPending(true);
        setPreviewError("");
        const data = new FormData(event.currentTarget);
        try {
          const response = await fetch("/api/preview/withdraw", {
            method: "POST",
            credentials: "omit",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountId: String(data.get("accountId") ?? ""),
              externalAccountId: String(data.get("externalAccountId") ?? ""),
              amount: String(data.get("amount") ?? ""),
              paymentMethod: String(data.get("paymentMethod") ?? "ACH"),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not record this transfer.");
          window.location.assign(result.redirectTo || "/transactions");
        } catch (caught) {
          setPreviewError(caught instanceof Error ? caught.message : "Could not record this transfer.");
          setPreviewPending(false);
        }
      }}
    >
      {state?.error && <Alert tone="error" title="Withdrawal error">{state.error}</Alert>}
      {previewError && <Alert tone="error" title="Withdrawal error">{previewError}</Alert>}
      {!review ? (
        externalDestinations.length === 0 ? (
          <Alert tone="info" title={unverifiedDestinationCount > 0 ? "Verification is still in progress" : savedDestinationCount > 0 ? "No verified destination is available" : "Add an external account first"}>
            {unverifiedDestinationCount > 0
              ? "A saved destination must be verified before it can be selected. Check its status on "
              : savedDestinationCount > 0
                ? "This destination is unavailable. Add another account or check the status of your saved accounts on "
                : "Save an external destination before submitting an ACH or wire request. Visit "}
            <Link href="/linked-accounts" className="font-semibold underline underline-offset-2">Linked Accounts</Link>.
          </Alert>
        ) : (
          <>
            <AccountSelect name="accountId" label="Withdraw from" accounts={accounts} />
            <Select name="externalAccountId" label="Send to external account" defaultValue="" required>
              <option value="" disabled>Select a saved destination</option>
              {externalDestinations.map((account) => (
                <option key={account.id} value={account.id}>
                  {safeExternalNickname(account.nickname, account.accountType)} · {safeInstitutionName(account.institutionName)} · •••• {lastFourDigits(account.accountMask)}
                </option>
              ))}
            </Select>
            <Select name="paymentMethod" label="Transfer method" defaultValue="ACH" required>
              <option value="ACH">ACH transfer</option>
              <option value="WIRE">Wire transfer</option>
            </Select>
            <Input name="amount" label="Amount" inputMode="decimal" placeholder="$0.00" required />
            <div className="border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-gray-600">
              Your balance updates when the transfer has been processed.
            </div>
            <Button type="submit" variant="navy" size="lg" className="w-full">
              Review external transfer
            </Button>
          </>
        )
      ) : (
        <>
          <ReviewSummary title="Review external transfer">
            <ReviewLine label="From" value={`${source?.name ?? "Account"} · ${formatCents(source?.balance ?? 0)}`} />
            <ReviewLine label="To" value={`${destination ? safeExternalNickname(destination.nickname, destination.accountType) : "External account"} · ${destination ? safeInstitutionName(destination.institutionName) : ""} · •••• ${destination ? lastFourDigits(destination.accountMask) : "----"}`} />
            <ReviewLine label="Method" value={review.paymentMethod === "WIRE" ? "Wire transfer" : "ACH transfer"} />
            <ReviewLine label="Amount" value={formatCents(parseCents(review.amount) ?? 0)} strong />
            <ReviewLine label="Status" value="Processing" />
          </ReviewSummary>
          <input type="hidden" name="accountId" value={review.accountId} />
          <input type="hidden" name="externalAccountId" value={review.externalAccountId} />
          <input type="hidden" name="amount" value={review.amount} />
          <input type="hidden" name="paymentMethod" value={review.paymentMethod} />
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" onClick={() => setReview(null)}>
              <ArrowLeft className="h-4 w-4" /> Edit
            </Button>
            <Button type="submit" loading={sharedPreview ? previewPending : pending} variant="navy">
              Submit transfer
            </Button>
          </div>
          <p className="text-center text-[10.5px] text-gray-500">Your balance updates when the transfer is complete.</p>
        </>
      )}
    </form>
  );
}

type TransferReview = { fromId: string; toId: string; amount: string; memo: string };

function TransferForm({
  accounts,
  initialFromId,
}: {
  accounts: AccountOption[];
  initialFromId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(transferAction, null);
  const [review, setReview] = useState<TransferReview | null>(null);
  const fromDefault = accounts.some((account) => account.id === initialFromId) ? initialFromId : accounts[0]?.id;
  const [fromId, setFromId] = useState(fromDefault ?? "");
  const toOptions = accounts.filter((account) => account.id !== fromId);
  const [toId, setToId] = useState(toOptions[0]?.id ?? "");
  const from = accounts.find((account) => account.id === (review?.fromId ?? fromId));
  const to = accounts.find((account) => account.id === (review?.toId ?? toId));

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
          fromId: String(data.get("fromId") ?? ""),
          toId: String(data.get("toId") ?? ""),
          amount: String(data.get("amount") ?? ""),
          memo: String(data.get("memo") ?? "").trim() || "Transfer",
        });
      }}
    >
      {state?.error && <Alert tone="error" title="Transfer error">{state.error}</Alert>}
      {!review ? (
        <>
          <AccountSelect
            name="fromId"
            label="Transfer from"
            accounts={accounts}
            defaultValue={fromDefault}
            onChange={(event) => {
              setFromId(event.target.value);
              if (event.target.value === toId) setToId(accounts.find((account) => account.id !== event.target.value)?.id ?? "");
            }}
          />
          <Select name="toId" label="Transfer to" value={toId} onChange={(event) => setToId(event.target.value)} required>
            {toOptions.map((account) => <option key={account.id} value={account.id}>{account.name} — {formatCents(account.balance)}</option>)}
          </Select>
          <Input name="amount" label="Amount" inputMode="decimal" placeholder="$0.00" required />
          <Input name="memo" label="Memo (optional)" placeholder="e.g. Monthly savings" maxLength={120} />
          <Button type="submit" variant="navy" size="lg" className="w-full">Review transfer</Button>
        </>
      ) : (
        <>
          <ReviewSummary title="Review this transfer">
            <ReviewLine label="From" value={`${from?.name ?? "Account"} · Available ${formatCents(from?.balance ?? 0)}`} />
            <ReviewLine label="To" value={to?.name ?? "Account"} />
            <ReviewLine label="Amount" value={formatCents(parseCents(review.amount) ?? 0)} strong />
            <ReviewLine label="Memo" value={review.memo} />
            <ReviewLine label="Status" value="Processing; balances update when complete" />
          </ReviewSummary>
          <input type="hidden" name="fromId" value={review.fromId} />
          <input type="hidden" name="toId" value={review.toId} />
          <input type="hidden" name="amount" value={review.amount} />
          <input type="hidden" name="memo" value={review.memo} />
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" onClick={() => setReview(null)}><ArrowLeft className="h-4 w-4" /> Edit</Button>
            <Button type="submit" loading={pending} variant="navy">Submit transfer</Button>
          </div>
          <p className="text-center text-[10.5px] text-gray-500">Balances update when the transfer is complete.</p>
        </>
      )}
    </form>
  );
}

type SendReview = { fromId: string; recipientEmail: string; amount: string; memo: string };

function SendForm({
  accounts,
  initialFromId,
}: {
  accounts: AccountOption[];
  initialFromId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(sendMoneyAction, null);
  const [review, setReview] = useState<SendReview | null>(null);
  const fromDefault = accounts.some((account) => account.id === initialFromId) ? initialFromId : accounts[0]?.id;
  const from = accounts.find((account) => account.id === (review?.fromId ?? fromDefault));

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
          fromId: String(data.get("fromId") ?? ""),
          recipientEmail: String(data.get("recipientEmail") ?? "").trim().toLowerCase(),
          amount: String(data.get("amount") ?? ""),
          memo: String(data.get("memo") ?? "").trim() || "Quick Pay",
        });
      }}
    >
      {state?.error && <Alert tone="error" title="Quick Pay error">{state.error}</Alert>}
      {!review ? (
        <>
          <AccountSelect
            name="fromId"
            label="Pay from"
            accounts={accounts}
            defaultValue={fromDefault}
          />
          <Input
            name="recipientEmail"
            label="Recipient email"
            type="email"
            placeholder="recipient@example.com"
            hint="Quick Pay is limited to other First Meridian member accounts."
            required
          />
          <Input name="amount" label="Amount" inputMode="decimal" placeholder="$0.00" required />
          <Input name="memo" label="Memo (optional)" placeholder="e.g. Dinner split" maxLength={120} />
          <Button type="submit" variant="navy" size="lg" className="w-full">Review Quick Pay</Button>
          <p className="text-[10.5px] leading-relaxed text-gray-500">Quick Pay is limited to First Meridian members.</p>
        </>
      ) : (
        <>
          <ReviewSummary title="Review your Quick Pay">
            <ReviewLine label="Pay from" value={`${from?.name ?? "Account"} · Available ${formatCents(from?.balance ?? 0)}`} />
            <ReviewLine label="Recipient" value={review.recipientEmail} />
            <ReviewLine label="Amount" value={formatCents(parseCents(review.amount) ?? 0)} strong />
            <ReviewLine label="Memo" value={review.memo} />
            <ReviewLine label="Status" value="Processing" />
          </ReviewSummary>
          <input type="hidden" name="fromId" value={review.fromId} />
          <input type="hidden" name="recipientEmail" value={review.recipientEmail} />
          <input type="hidden" name="amount" value={review.amount} />
          <input type="hidden" name="memo" value={review.memo} />
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" onClick={() => setReview(null)}><ArrowLeft className="h-4 w-4" /> Edit</Button>
              <Button type="submit" loading={pending} variant="navy"><Send className="h-4 w-4" /> Send Quick Pay</Button>
          </div>
          <p className="text-center text-[10.5px] text-gray-500">Your payment will appear in account activity as it is processed.</p>
        </>
      )}
    </form>
  );
}

function ReviewSummary({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-300 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 text-[13px] font-bold text-bank-navy">
        <CheckCircle2 className="h-4 w-4 text-bank-red" /> {title}
      </div>
      <div className="space-y-3 px-4 py-4">{children}</div>
    </div>
  );
}

function ReviewLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-[12px]">
      <span className="text-gray-500">{label}</span>
      <span className={`max-w-[65%] text-right ${strong ? "text-[15px] font-bold tabular-nums text-bank-navy" : "font-semibold text-gray-900"}`}>{value}</span>
    </div>
  );
}
