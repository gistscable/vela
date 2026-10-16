"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { Camera, CheckCircle2, FileImage } from "lucide-react";
import { mobileDepositAction, type ActionState } from "@/lib/actions";
import { formatCents, parseCents } from "@/lib/money";
import { Alert, Button, Input, Select } from "@/components/ui";

type AccountOption = { id: string; name: string; balance: number };
type ImageSelection = { fileName: string; url: string };

export function MobileDepositForm({ accounts }: { accounts: AccountOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(mobileDepositAction, null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [front, setFront] = useState<ImageSelection | null>(null);
  const [back, setBack] = useState<ImageSelection | null>(null);
  const [review, setReview] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => () => {
    if (front) URL.revokeObjectURL(front.url);
    if (back) URL.revokeObjectURL(back.url);
  }, [front, back]);

  function selectImage(file: File | undefined, setter: (value: ImageSelection | null) => void) {
    setLocalError("");
    if (!file) return setter(null);
    if (!file.type.startsWith("image/")) return setLocalError("Choose an image file for each side of the check.");
    if (file.size > 10 * 1024 * 1024) return setLocalError("Each image must be smaller than 10 MB.");
    setter({ fileName: file.name, url: URL.createObjectURL(file) });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (review) return;
    event.preventDefault();
    setLocalError("");
    if (!event.currentTarget.reportValidity()) return;
    if (!front || !back) {
      setLocalError("Add images of both the front and back of the check.");
      return;
    }
    setReview(true);
  }

  const amountCents = parseCents(amount);
  const selectedAccount = accounts.find((account) => account.id === accountId);

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Check images stay on this device">
        Images are not uploaded or stored. This request must be approved before the account balance changes; no bank processes the check.
      </Alert>
      {(state?.error || localError) && <Alert tone="error" title="Check the deposit details">{state?.error ?? localError}</Alert>}

      <form action={review ? formAction : undefined} onSubmit={handleSubmit} className="space-y-5">
        {!review ? (
          <>
            <Select name="accountId" label="Deposit into" value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} — {formatCents(account.balance)}</option>
              ))}
            </Select>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="amount" label="Check amount" inputMode="decimal" placeholder="$0.00" min="1" max="5000" value={amount} onChange={(event) => setAmount(event.target.value)} required />
              <Input name="checkNumber" label="Check number" placeholder="e.g. 1042" maxLength={20} pattern="[A-Za-z0-9-]{4,20}" hint="4–20 letters or numbers" value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckImageField label="Front of check" selection={front} onChange={(file) => selectImage(file, setFront)} />
              <CheckImageField label="Back of check" selection={back} onChange={(file) => selectImage(file, setBack)} />
            </div>
            <Button type="submit" variant="navy" size="lg" className="w-full">
              Review mobile deposit
            </Button>
            <p className="text-[10.5px] leading-relaxed text-gray-500">Check details and endorsements are not verified, and images are not submitted to any bank.</p>
          </>
        ) : (
          <>
            <div className="border border-gray-300 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-bank-red" />
                <h2 className="text-[13px] font-bold text-bank-navy">Review your mobile deposit</h2>
              </div>
              <div className="space-y-3 px-4 py-4 text-[12px]">
                <ReviewRow label="Deposit to" value={selectedAccount?.name ?? "Account"} />
                <ReviewRow label="Amount" value={formatCents(amountCents ?? 0)} strong />
                <ReviewRow label="Check number" value={checkNumber} />
                <div className="border-t border-gray-200 pt-3 text-[10.5px] leading-relaxed text-gray-600">
                  Confirming submits a request for approval. The balance stays the same until it is approved; no check is sent to a bank.
                </div>
              </div>
            </div>
            <input type="hidden" name="accountId" value={accountId} />
            <input type="hidden" name="amount" value={amount} />
            <input type="hidden" name="checkNumber" value={checkNumber} />
            <input type="hidden" name="frontSelected" value={front ? "yes" : ""} />
            <input type="hidden" name="backSelected" value={back ? "yes" : ""} />
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" onClick={() => setReview(false)}>Edit details</Button>
              <Button type="submit" loading={pending} variant="navy">Submit for approval</Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function CheckImageField({
  label,
  selection,
  onChange,
}: {
  label: string;
  selection: ImageSelection | null;
  onChange: (file?: File) => void;
}) {
  return (
    <label className="block cursor-pointer rounded border border-dashed border-gray-400 bg-gray-50 p-3 hover:bg-gray-100">
      <span className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-gray-800">
        {selection ? <FileImage className="h-4 w-4 text-bank-navy" /> : <Camera className="h-4 w-4 text-bank-navy" />}
        {label}
      </span>
      {selection ? (
        <span className="block overflow-hidden rounded border border-gray-200 bg-white">
          <span className="relative block h-32 w-full">
            <Image src={selection.url} alt={`Selected image: ${label}`} fill unoptimized className="object-contain" />
          </span>
          <span className="block truncate border-t border-gray-100 px-2 py-1.5 text-[10px] text-gray-500">{selection.fileName}</span>
        </span>
      ) : (
        <span className="flex h-32 flex-col items-center justify-center gap-1 rounded border border-gray-200 bg-white text-[10.5px] text-gray-500">
          <Camera className="h-5 w-5" /> Tap to capture or choose image
        </span>
      )}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        required
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0])}
      />
    </label>
  );
}

function ReviewRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right ${strong ? "font-bold tabular-nums text-bank-navy" : "font-semibold text-gray-900"}`}>{value}</span>
    </div>
  );
}
