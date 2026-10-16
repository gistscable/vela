"use client";

import { useActionState } from "react";
import { KeyRound, Mail, ShieldCheck, Smartphone } from "lucide-react";
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
        <h1 className="text-[19px] font-bold text-bank-navy">Choose a verification method</h1>
        <p className="mt-0.5 text-[11.5px] text-gray-600">Sign-in verification for {email}.</p>
      </div>

      <div className="space-y-5 px-6 py-6">
        {state?.error && <Alert tone="error" title="Sign-in verification">{state.error}</Alert>}

        <section aria-labelledby="available-method-heading">
          <h2 id="available-method-heading" className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">Available now</h2>
          <div
            data-testid="mfa-method-authenticator"
            aria-current="step"
            className="border border-bank-blue bg-blue-50/60 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-bank-blue">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[12px] font-bold text-bank-navy">Authenticator app</h3>
                  <span className="border border-blue-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-bank-blue">Available</span>
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-gray-600">
                  Open Google Authenticator for {email} and enter its current six-digit code.
                </p>
              </div>
            </div>

            <form action={formAction} className="mt-4 space-y-4">
              <Input label="Six-digit authenticator code" name="totpCode" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="123456" autoComplete="one-time-code" required />
              <Button type="submit" variant="red" size="lg" loading={pending} className="w-full">Verify and sign in</Button>
            </form>
          </div>
        </section>

        <section aria-labelledby="other-methods-heading">
          <h2 id="other-methods-heading" className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">Other methods</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div data-testid="mfa-method-sms" aria-disabled="true" className="border border-gray-200 bg-gray-50 p-3.5">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[11.5px] font-bold text-gray-700">Text message to phone</h3>
                    <span className="border border-gray-300 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">Not enabled</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-gray-500">SMS delivery is not configured, so no text code will be sent.</p>
                </div>
              </div>
            </div>

            <div data-testid="mfa-method-email" aria-disabled="true" className="border border-gray-200 bg-gray-50 p-3.5">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[11.5px] font-bold text-gray-700">Email code</h3>
                    <span className="border border-gray-300 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">Not enabled</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-gray-500">Email delivery is not configured, so no email code will be sent.</p>
                </div>
              </div>
            </div>

            <div data-testid="mfa-method-app-approval" aria-disabled="true" className="border border-gray-200 bg-gray-50 p-3.5 sm:col-span-2">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[11.5px] font-bold text-gray-700">Approve in First Meridian app</h3>
                    <span className="border border-gray-300 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">Not enabled</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-gray-500">There is no companion mobile app connected to approve sign-in requests.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <p className="border-l-4 border-bank-red bg-gray-50 px-3 py-2 text-[10.5px] leading-relaxed text-gray-600">
          The authenticator app is currently the only working sign-in method. If you lose access, contact an administrator for a reset.
        </p>
      </div>
    </div>
  );
}
