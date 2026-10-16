"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { KeyRound, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { completeTotpSetupAction, verifyTotpLoginAction, type ActionState } from "@/lib/actions";
import type { MfaContactHints } from "@/lib/mfa-contact";
import { NO_EMAIL_REGISTERED, NO_PHONE_REGISTERED } from "@/lib/mfa-contact";
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

export type MfaMethod = "authenticator" | "sms" | "email" | "app";

const METHOD_LABELS: Record<MfaMethod, string> = {
  authenticator: "Authenticator app",
  sms: "Text message to phone",
  email: "Email code",
  app: "Approve in First Meridian app",
};

/**
 * Method-choice screen. It deliberately receives only masked contact hints — never the full phone
 * number or email address — so nothing sensitive can be rendered or serialized into the page.
 *
 * Choosing a method is purely a client-side view change. It sends nothing to the server, sends no
 * text, email or app request, and cannot complete sign-in: only the server action behind the
 * six-digit authenticator form (which re-checks the signed MFA challenge, lockout and replay
 * protection) can issue a session. Every option currently leads to that same form.
 */
export function TotpLoginForm({ contact }: { contact: MfaContactHints }) {
  const [selected, setSelected] = useState<MfaMethod | null>(null);
  // Remember which card to hand focus back to after "Back to verification methods".
  const lastSelected = useRef<MfaMethod | null>(null);
  const cardRefs = useRef<Partial<Record<MfaMethod, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (selected === null && lastSelected.current) cardRefs.current[lastSelected.current]?.focus();
  }, [selected]);

  const choose = (method: MfaMethod) => {
    lastSelected.current = method;
    setSelected(method);
  };

  return (
    <div className="border border-gray-300 bg-white shadow-panel">
      <div className="border-b border-gray-200 bg-bank-sand px-6 py-4">
        <h1 className="text-[19px] font-bold text-bank-navy">
          {selected ? "Verify with your authenticator app" : "Choose a verification method"}
        </h1>
        <p className="mt-0.5 text-[11.5px] text-gray-600">Sign-in verification for your First Meridian account.</p>
      </div>

      <div className="space-y-5 px-6 py-6">
        {selected ? (
          <AuthenticatorStep method={selected} contact={contact} onBack={() => setSelected(null)} />
        ) : (
          <MethodList contact={contact} onChoose={choose} cardRefs={cardRefs} />
        )}
      </div>
    </div>
  );
}

function MethodCard({
  method,
  icon,
  badge,
  featured = false,
  wide = false,
  onChoose,
  cardRefs,
  children,
}: {
  method: MfaMethod;
  icon: React.ReactNode;
  badge: string;
  featured?: boolean;
  wide?: boolean;
  onChoose: (method: MfaMethod) => void;
  cardRefs: React.MutableRefObject<Partial<Record<MfaMethod, HTMLButtonElement | null>>>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={`mfa-method-${method === "app" ? "app-approval" : method}`}
      ref={(el) => { cardRefs.current[method] = el; }}
      onClick={() => onChoose(method)}
      className={`flex w-full items-start gap-3 border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bank-blue focus-visible:ring-offset-1 ${
        featured ? "border-bank-blue bg-blue-50/60 hover:bg-blue-50" : "border-gray-300 bg-white hover:border-bank-blue hover:bg-gray-50"
      } ${wide ? "sm:col-span-2" : ""}`}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-bank-blue">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold text-bank-navy">{METHOD_LABELS[method]}</span>
          <span className="border border-gray-300 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-600">{badge}</span>
        </span>
        {children}
      </span>
    </button>
  );
}

function MethodList({
  contact,
  onChoose,
  cardRefs,
}: {
  contact: MfaContactHints;
  onChoose: (method: MfaMethod) => void;
  cardRefs: React.MutableRefObject<Partial<Record<MfaMethod, HTMLButtonElement | null>>>;
}) {
  const shared = { onChoose, cardRefs };
  return (
    <>
      <section aria-labelledby="methods-heading" className="space-y-3">
        <h2 id="methods-heading" className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Select how you want to verify</h2>

        <MethodCard method="authenticator" icon={<KeyRound className="h-4 w-4" aria-hidden="true" />} badge="Working now" featured {...shared}>
          <span className="mt-1 block text-[10.5px] leading-relaxed text-gray-600">Enter the six-digit code from Google Authenticator.</span>
        </MethodCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <MethodCard method="sms" icon={<Smartphone className="h-4 w-4" aria-hidden="true" />} badge="Uses authenticator for now" {...shared}>
            <span data-testid="mfa-sms-destination" className="mt-1 block text-[11px] leading-relaxed text-gray-700">
              {contact.phoneLastFour ? <>Phone ending in <strong>{contact.phoneLastFour}</strong></> : NO_PHONE_REGISTERED}
            </span>
            <span className="mt-1 block text-[10px] leading-relaxed text-gray-500">
              {contact.phoneLastFour ? "Registered on your profile, not verified. " : ""}Text messages are not enabled yet; no text will be sent.
            </span>
          </MethodCard>

          <MethodCard method="email" icon={<Mail className="h-4 w-4" aria-hidden="true" />} badge="Uses authenticator for now" {...shared}>
            <span data-testid="mfa-email-destination" className="mt-1 block break-all text-[11px] leading-relaxed text-gray-700">
              {contact.emailMasked ? <strong>{contact.emailMasked}</strong> : NO_EMAIL_REGISTERED}
            </span>
            <span className="mt-1 block text-[10px] leading-relaxed text-gray-500">
              {contact.emailMasked ? "Registered on your profile, not verified. " : ""}Email codes are not enabled yet; no email will be sent.
            </span>
          </MethodCard>

          <MethodCard method="app" icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} badge="Uses authenticator for now" wide {...shared}>
            <span className="mt-1 block text-[10px] leading-relaxed text-gray-500">There is no companion mobile app connected yet; no approval request will be sent.</span>
          </MethodCard>
        </div>
      </section>

      <p data-testid="mfa-methods-notice" className="border-l-4 border-bank-red bg-gray-50 px-3 py-2 text-[10.5px] leading-relaxed text-gray-600">
        All options currently continue to authenticator verification, and no text, email or app request is sent. If you lose access to your authenticator, contact an administrator for a reset.
      </p>
    </>
  );
}

function AuthenticatorStep({ method, contact, onBack }: { method: MfaMethod; contact: MfaContactHints; onBack: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(verifyTotpLoginAction, null);
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { codeRef.current?.focus(); }, []);

  const destination =
    method === "sms"
      ? contact.phoneLastFour ? `Text message to phone ending in ${contact.phoneLastFour}` : NO_PHONE_REGISTERED
      : method === "email"
        ? contact.emailMasked ?? NO_EMAIL_REGISTERED
        : null;

  return (
    <div data-testid="mfa-authenticator-step" className="space-y-4">
      <div data-testid="mfa-temporary-notice">
        <Alert tone="info" title={method === "authenticator" ? "Authenticator verification" : `${METHOD_LABELS[method]} is not available yet`}>
          {method === "authenticator" ? (
            <>Open Google Authenticator and enter the current six-digit code for your First Meridian account.</>
          ) : (
            <>
              Authenticator verification is temporarily being used instead.{" "}
              <strong>
                {method === "sms" && "No text message was sent."}
                {method === "email" && "No email was sent."}
                {method === "app" && "No request was sent to the First Meridian app."}
              </strong>{" "}
              Open Google Authenticator and enter the current six-digit code for your account.
              {destination && <> You selected: <span data-testid="mfa-selected-destination">{destination}</span> (registered, not verified).</>}
            </>
          )}
        </Alert>
      </div>

      {state?.error && <Alert tone="error" title="Sign-in verification">{state.error}</Alert>}

      <form action={formAction} className="space-y-4" aria-label="Authenticator verification">
        <Input
          ref={codeRef}
          label="Six-digit authenticator code"
          name="totpCode"
          inputMode="numeric"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          placeholder="123456"
          autoComplete="one-time-code"
          required
        />
        <Button type="submit" variant="red" size="lg" loading={pending} className="w-full">Verify and sign in</Button>
      </form>

      <Button type="button" variant="outline" size="md" onClick={onBack} className="w-full" data-testid="mfa-back">
        Back to verification methods
      </Button>
    </div>
  );
}
