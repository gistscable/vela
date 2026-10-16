"use client";

import { useActionState } from "react";
import { completeTotpSetupAction, verifyTotpLoginAction, type ActionState } from "@/lib/actions";
import { Alert, Button, Input } from "./ui";

export function TotpSetupForm({
  email,
  qrDataUrl,
  secret,
}: {
  email: string;
  qrDataUrl: string;
  secret: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(completeTotpSetupAction, null);
  return (
    <div className="border border-gray-300 bg-white shadow-panel">
      <div className="border-b border-gray-200 bg-bank-sand px-6 py-4">
        <h1 className="text-[19px] font-bold text-bank-navy">Set up Google Authenticator</h1>
        <p className="mt-0.5 text-[11.5px] text-gray-600">One authenticator device is linked to {email}.</p>
      </div>
      <div className="space-y-5 px-6 py-6">
        <ol className="list-decimal space-y-2 pl-5 text-[11.5px] leading-relaxed text-gray-700">
          <li>Open Google Authenticator on your phone and add a new account.</li>
          <li>Scan this QR code, or enter the setup key manually.</li>
          <li>Enter the current six-digit code from the app to finish setup.</li>
        </ol>
        <div className="flex flex-col items-center gap-3 border border-gray-200 bg-gray-50 p-4">
          {/* QR data is generated on the server and contains only the one-time TOTP setup secret. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Authenticator setup QR code" width={220} height={220} className="h-[220px] w-[220px] border border-gray-300 bg-white p-2" />
          <div className="w-full text-center">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Manual setup key</p>
            <code data-testid="totp-secret" className="mt-1 inline-block select-all break-all rounded border border-gray-300 bg-white px-3 py-2 font-mono text-[13px] font-bold tracking-[0.16em] text-bank-navy">{secret}</code>
          </div>
        </div>
        {state?.error && <Alert tone="error" title="Authenticator setup">{state.error}</Alert>}
        <form action={formAction} className="space-y-4">
          <Input label="Six-digit authenticator code" name="totpCode" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="123456" autoComplete="one-time-code" required />
          <Button type="submit" variant="red" size="lg" loading={pending} className="w-full">Verify and enable authenticator</Button>
        </form>
        <p className="border-l-4 border-bank-red bg-gray-50 px-3 py-2 text-[10.5px] leading-relaxed text-gray-600">
          This is the only sign-in code method. No code is sent by email or text. The setup registers one TOTP secret for this user; because TOTP is a standard, another compatible app could import the same key. Keep it private. If you lose the phone, an administrator must reset the authenticator.
        </p>
      </div>
    </div>
  );
}

export function TotpLoginForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(verifyTotpLoginAction, null);
  return (
    <div className="border border-gray-300 bg-white shadow-panel">
      <div className="border-b border-gray-200 bg-bank-sand px-6 py-4">
        <h1 className="text-[19px] font-bold text-bank-navy">Enter your authenticator code</h1>
        <p className="mt-0.5 text-[11.5px] text-gray-600">Open Google Authenticator for {email}.</p>
      </div>
      <form action={formAction} className="space-y-4 px-6 py-6">
        {state?.error && <Alert tone="error" title="Sign-in verification">{state.error}</Alert>}
        <Input label="Six-digit authenticator code" name="totpCode" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="123456" autoComplete="one-time-code" required />
        <Button type="submit" variant="red" size="lg" loading={pending} className="w-full">Verify and sign in</Button>
        <p className="text-[10.5px] leading-relaxed text-gray-500">Email and text-message codes are not enabled. If you lost access to your authenticator, contact an administrator for a reset.</p>
      </form>
    </div>
  );
}
