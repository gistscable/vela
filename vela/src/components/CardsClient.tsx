"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { toggleCardAction, updateCardLimitAction, type ActionState } from "@/lib/actions";
import { Alert, Button, Input } from "./ui";

export function CardVisual({
  card,
  holderName,
}: {
  card: { id: string; last4: string; brand: string; status: string; dailyLimit: number; spentToday: number };
  holderName: string;
}) {
  const [show, setShow] = useState(false);
  const frozen = card.status === "FROZEN";
  const fullNumber = `4532 9101 4473 ${card.last4}`;

  return (
    <div
      className={`relative aspect-[1.6/1] w-full max-w-[420px] overflow-hidden border border-gray-700 p-7 text-white shadow-dropdown ${
        frozen ? "bg-gray-600" : "bg-bank-navy"
      }`}
    >
      {/* subtle stripe pattern */}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,255,255,0.35) 14px 15px)",
        }}
      />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.22em]">FMB</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/70">{card.brand} Debit</p>
            {frozen && (
              <span className="mt-2 inline-flex items-center gap-1 border border-white/40 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider">
                <Lock className="h-3 w-3" /> Frozen
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="flex h-8 w-8 items-center justify-center rounded border border-white/30 transition-colors hover:bg-white/10"
            title={show ? "Hide number" : "Show number"}
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div>
          <div className="flex items-center gap-3">
            <div className="h-7 w-10 rounded-sm border border-yellow-200/60 bg-gradient-to-br from-yellow-100 to-yellow-300" />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-80">
              <path d="M6 8c3.5-3.5 8.5-3.5 12 0M8.5 11c2-2 5-2 7 0M11 14c.7-.7 1.8-.7 2.5 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <p className="mt-4 font-mono text-[17px] tracking-[0.14em]">
            {show ? fullNumber : `•••• •••• •••• ${card.last4}`}
          </p>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-[8.5px] uppercase tracking-[0.18em] text-white/60">Card holder</p>
              <p className="text-[12px] font-semibold uppercase tracking-wide">{holderName}</p>
            </div>
            <div className="text-right">
              <p className="text-[8.5px] uppercase tracking-[0.18em] text-white/60">Expires</p>
              <p className="text-[12px] font-semibold">09/29</p>
            </div>
            <div className="text-right">
              <p className="text-[8.5px] uppercase tracking-[0.18em] text-white/60">CVV</p>
              <p className="text-[12px] font-semibold">•••</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CardControls({ cardId, dailyLimit, frozen }: { cardId: string; dailyLimit: number; frozen: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateCardLimitAction, null);

  return (
    <div className="space-y-5">
      <form action={toggleCardAction} className="border border-gray-300 bg-white p-5 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[13px] font-bold text-bank-navy">Lock or unlock your card</h3>
            <p className="mt-1 text-[11.5px] text-gray-600">
              {frozen
                ? "Your card is currently locked. New purchases are being declined."
                : "Lock your card instantly to block new purchases. Unlock anytime."}
            </p>
          </div>
          <input type="hidden" name="cardId" value={cardId} />
          <button
            type="submit"
            className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded px-4 text-[12px] font-bold ${
              frozen
                ? "border border-emerald-700 bg-white text-emerald-800 hover:bg-emerald-50"
                : "border border-bank-red bg-bank-red text-white hover:bg-bank-redDark"
            }`}
          >
            {frozen ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {frozen ? "Unlock card" : "Lock card"}
          </button>
        </div>
      </form>

      <form action={formAction} className="border border-gray-300 bg-white p-5 shadow-panel">
        <h3 className="text-[13px] font-bold text-bank-navy">Daily purchase limit</h3>
        <p className="mt-1 text-[11.5px] text-gray-600">
          Current limit:{" "}
          <span className="font-semibold text-gray-800">
            {(dailyLimit / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </span>
        </p>
        <input type="hidden" name="cardId" value={cardId} />
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <Input name="dailyLimit" label="New daily limit" inputMode="decimal" defaultValue={(dailyLimit / 100).toFixed(2)} />
          </div>
          <Button type="submit" loading={pending} variant="navy" className="h-10">
            Update limit
          </Button>
        </div>
        {state?.error && (
          <div className="mt-3">
            <Alert tone="error">{state.error}</Alert>
          </div>
        )}
        {state?.success && (
          <div className="mt-3">
            <Alert tone="success">Your daily limit has been updated.</Alert>
          </div>
        )}
      </form>
    </div>
  );
}
