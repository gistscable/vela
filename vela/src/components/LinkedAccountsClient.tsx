"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Building2, CheckCircle2, ExternalLink, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { addExternalAccountAction, verifyExternalAccountAction, type ActionState } from "@/lib/actions";
import { lastFourDigits, safeExternalNickname, safeInstitutionName } from "@/lib/external-account-display";
import { formatDateTime } from "@/lib/money";
import { Alert, Button, Input, Panel, Select } from "./ui";

type LinkedBankView = {
  id: string;
  institutionName: string;
  createdAt: string;
  accounts: { name: string; officialName?: string | null; mask: string; type: string; subtype?: string | null }[];
};

type ExternalAccountView = {
  id: string;
  institutionName: string;
  nickname: string;
  accountType: string;
  accountMask: string;
  status: string;
  microdepositExpiresAt: string | null;
  createdAt: string;
};

export function LinkedAccountsClient({
  configured,
  banks,
  externalAccounts,
  sharedPreview,
}: {
  configured: boolean;
  banks: LinkedBankView[];
  externalAccounts: ExternalAccountView[];
  sharedPreview: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [launchRequested, setLaunchRequested] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!publicToken) {
        setError("Plaid did not return a public token. Please try again.");
        return;
      }
      setWorking(true);
      setError("");
      try {
        const response = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            institutionName: metadata.institution?.name ?? "Connected financial institution",
            institutionId: metadata.institution?.institution_id,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not finish linking that account.");
        setSuccess(`${result.bank.institutionName} has been linked securely.`);
        setToken(null);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not finish linking that account.");
      } finally {
        setWorking(false);
      }
    },
    onExit: (linkError) => {
      if (linkError?.display_message) setError(linkError.display_message);
    },
  });

  useEffect(() => {
    if (launchRequested && ready) {
      open();
      setLaunchRequested(false);
    }
  }, [launchRequested, ready, open]);

  async function connectBank() {
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/plaid/link-token", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start secure bank linking.");
      setToken(result.link_token);
      setLaunchRequested(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start secure bank linking.");
      setWorking(false);
    }
  }

  useEffect(() => {
    if (ready && !launchRequested) setWorking(false);
  }, [ready, launchRequested]);

  return (
    <div className="space-y-5">
      {error && <Alert tone="error" title="Bank connection">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <ExternalDestinationForm sharedPreview={sharedPreview} />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Secure bank linking (Plaid)" bodyClassName="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-bank-sand bg-bank-sand text-bank-navy"><Building2 className="h-5 w-5" /></div>
            <div>
              <h2 className="text-[13px] font-bold text-gray-900">Link with Plaid{configured ? "" : " · not configured"}</h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-gray-600">Use Plaid Link to securely identify an external bank and its accounts. Credentials stay with Plaid; only the encrypted access token and masked account details are stored here.</p>
            </div>
          </div>
          <div className="mt-5">
            {sharedPreview ? (
              <div className="border-l-4 border-bank-red bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600">
                Bank linking is unavailable for this shared account. You can still add an external account below.
              </div>
            ) : configured ? (
              <Button type="button" variant="navy" size="lg" loading={working} onClick={connectBank} disabled={!ready && Boolean(token)} className="w-full sm:w-auto">
                <Plus className="h-4 w-4" /> Connect a bank
              </Button>
            ) : (
              <Button type="button" variant="navy" size="lg" disabled className="w-full sm:w-auto">
                <Plus className="h-4 w-4" /> Connect a bank
              </Button>
            )}
          </div>
          {!sharedPreview && !configured && (
            <div className="mt-4 border-l-4 border-bank-red bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600">
              Configure <code>PLAID_CLIENT_ID</code>, <code>PLAID_SECRET</code>, <code>PLAID_ENV</code> and <code>APP_ENCRYPTION_KEY</code> in the server environment to enable Plaid.
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <div className="border border-blue-200 bg-blue-50 p-4">
            <h3 className="flex items-center gap-2 text-[12.5px] font-bold text-bank-navy"><ShieldCheck className="h-4 w-4" /> What linking does</h3>
            <p className="mt-1.5 text-[11px] leading-relaxed text-gray-700">Plaid linking is for account identification and verification. A Stripe ACH checkout is a separate flow and does not use a Plaid token.</p>
          </div>
          <div className="border border-gray-200 bg-gray-50 p-4 text-[11px] leading-relaxed text-gray-600">
            <p className="flex items-center gap-2 font-bold text-gray-800"><LockKeyhole className="h-3.5 w-3.5" /> Security notes</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Provider tokens are encrypted at rest with AES-256-GCM.</li>
              <li>Never paste secrets into the browser.</li>
            </ul>
          </div>
        </div>
      </div>

      <Panel title="Saved external accounts" bodyClassName="p-0">
        {externalAccounts.length === 0 ? (
          <div className="px-5 py-7 text-center">
            <Building2 className="mx-auto h-6 w-6 text-gray-400" />
            <p className="mt-2 text-[12px] font-semibold text-gray-700">No external destinations saved</p>
            <p className="mt-1 text-[11px] text-gray-500">Add an external account above to use it in Withdraw funds.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {externalAccounts.map((account) => (
              <ExternalAccountCard key={account.id} account={account} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Connected financial institutions" bodyClassName="p-0">
        {banks.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Building2 className="mx-auto h-6 w-6 text-gray-400" />
            <p className="mt-2 text-[12px] font-semibold text-gray-700">No external accounts linked</p>
            <p className="mt-1 text-[11px] text-gray-500">When you link a bank, its masked accounts will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {banks.map((bank) => (
              <div key={bank.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-[13px] font-bold text-gray-900"><Building2 className="h-4 w-4 text-bank-navy" /> {bank.institutionName}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Linked</span>
                </div>
                <p className="mt-1 text-[10.5px] text-gray-500">Connected {new Date(bank.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {bank.accounts.map((account, index) => (
                    <div key={`${bank.id}-${index}`} className="flex items-center justify-between border border-gray-200 bg-gray-50 px-3 py-2.5 text-[11px]">
                      <span>
                        <span className="block font-semibold text-gray-800">{account.name}</span>
                        <span className="text-gray-500">{account.subtype || account.type}</span>
                      </span>
                      <span className="font-bold tabular-nums text-gray-700">•••• {account.mask || "----"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <p className="flex items-center gap-1 text-[10px] text-gray-500"><ExternalLink className="h-3 w-3" /> Review Plaid's end-user terms and required disclosures.</p>
    </div>
  );
}

function ExternalAccountCard({ account }: { account: ExternalAccountView }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(verifyExternalAccountAction, null);
  const label = account.status === "VERIFIED"
    ? "Verified"
    : account.status === "CHALLENGE_ACTIVE"
      ? "Verification amounts requested"
      : account.status === "REJECTED"
        ? "Rejected"
        : "Awaiting admin review";
  const badgeClass = account.status === "VERIFIED"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : account.status === "CHALLENGE_ACTIVE"
      ? "border-blue-200 bg-blue-50 text-blue-900"
      : account.status === "REJECTED"
        ? "border-red-200 bg-red-50 text-bank-red"
        : "border-amber-300 bg-amber-50 text-amber-900";

  return (
    <article className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-bold text-gray-900">
            <Building2 className="h-4 w-4 text-bank-navy" /> {safeExternalNickname(account.nickname, account.accountType)}
          </p>
          <p className="mt-1 text-[11px] text-gray-600">{safeInstitutionName(account.institutionName)} · {account.accountType === "SAVINGS" ? "Savings" : "Checking"} · •••• {lastFourDigits(account.accountMask)}</p>
        </div>
        <span className={`inline-flex items-center gap-1 border px-2 py-1 text-[9px] font-bold uppercase ${badgeClass}`}>
          <CheckCircle2 className="h-3.5 w-3.5" /> {label}
        </span>
      </div>

      {account.status === "PENDING_APPROVAL" && (
        <p className="mt-3 text-[11px] leading-relaxed text-gray-600">This destination is waiting for admin review. It cannot be selected for a transfer yet.</p>
      )}
      {account.status === "REJECTED" && (
        <p className="mt-3 text-[11px] leading-relaxed text-gray-600">This destination was rejected and cannot be used. Contact support if you think this is an error.</p>
      )}
      {account.status === "VERIFIED" && (
        <p className="mt-3 text-[11px] leading-relaxed text-gray-600">Verification is complete. Transfer requests to this destination still require approval.</p>
      )}
      {account.status === "CHALLENGE_ACTIVE" && (
        <div className="mt-3 space-y-3 border border-blue-200 bg-blue-50 p-3">
          <p className="text-[10.5px] leading-relaxed text-blue-950">
            Enter the two amounts shared with you by the administrator.
            {account.microdepositExpiresAt ? ` Expires ${formatDateTime(account.microdepositExpiresAt)}.` : ""}
          </p>
          {state?.error && <Alert tone="error" title="Could not verify destination">{state.error}</Alert>}
          {state?.success && state.message && <Alert tone="success">{state.message}</Alert>}
          <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="externalAccountId" value={account.id} />
            <Input name="microdepositAmount1" label="First amount" inputMode="decimal" placeholder="0.07" autoComplete="off" required />
            <Input name="microdepositAmount2" label="Second amount" inputMode="decimal" placeholder="0.32" autoComplete="off" required />
            <Button type="submit" variant="navy" loading={pending}>Verify</Button>
          </form>
          <p className="text-[10px] text-blue-900">Use amounts from $0.01 to $0.99. Five attempts are allowed.</p>
        </div>
      )}
    </article>
  );
}

function ExternalDestinationForm({ sharedPreview }: { sharedPreview: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addExternalAccountAction, null);
  const [previewError, setPreviewError] = useState("");
  const [previewPending, setPreviewPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  async function submitPreviewDestination(event: FormEvent<HTMLFormElement>) {
    if (!sharedPreview) return;
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    setPreviewPending(true);
    setPreviewError("");
    const data = new FormData(form);
    try {
      const response = await fetch("/api/preview/external-accounts", {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionName: String(data.get("institutionName") ?? ""),
          nickname: String(data.get("nickname") ?? ""),
          accountType: String(data.get("accountType") ?? ""),
          accountNumber: String(data.get("accountNumber") ?? ""),
          routingNumber: String(data.get("routingNumber") ?? ""),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this destination.");
      window.location.assign("/linked-accounts");
    } catch (caught) {
      setPreviewError(caught instanceof Error ? caught.message : "Could not save this destination.");
      setPreviewPending(false);
    }
  }

  return (
    <Panel title="Add an external account" bodyClassName="p-5">
      <p className="mb-4 border-l-4 border-bank-red bg-gray-50 px-3 py-2.5 text-[11px] leading-relaxed text-gray-600">
        Account and routing numbers are used only to check the entry and derive the last four digits. Full numbers are discarded and never stored.
      </p>
      {state?.error && <div className="mb-4"><Alert tone="error" title="Could not save destination">{state.error}</Alert></div>}
      {state?.success && state.message && <div className="mb-4"><Alert tone="success">{state.message}</Alert></div>}
      {previewError && <div className="mb-4"><Alert tone="error" title="Could not save destination">{previewError}</Alert></div>}
      <form ref={formRef} action={sharedPreview ? undefined : formAction} onSubmit={sharedPreview ? submitPreviewDestination : undefined} className="grid gap-3 sm:grid-cols-2">
        <Input label="Bank or credit union" name="institutionName" placeholder="Example Credit Union" autoComplete="off" required />
        <Input label="Account nickname" name="nickname" placeholder="Personal checking" autoComplete="off" required />
        <Select label="Account type" name="accountType" defaultValue="CHECKING" required>
          <option value="CHECKING">Checking</option>
          <option value="SAVINGS">Savings</option>
        </Select>
        <Input label="Account number" name="accountNumber" inputMode="numeric" pattern="[0-9]{4,17}" minLength={4} maxLength={17} placeholder="Enter account number" autoComplete="off" required />
        <Input label="Routing number" name="routingNumber" inputMode="numeric" pattern="[0-9]{9}" minLength={9} maxLength={9} placeholder="9 digits" autoComplete="off" required />
        <div className="sm:col-span-2">
          <Button type="submit" variant="navy" loading={sharedPreview ? previewPending : pending}>
            <Plus className="h-4 w-4" /> Save external account
          </Button>
        </div>
      </form>
    </Panel>
  );
}
