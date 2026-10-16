"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, signupAction, type ActionState } from "@/lib/actions";
import { Alert, Button, Input, PasswordInput } from "./ui";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, null);
  return (
    <div className="border border-gray-300 bg-white shadow-panel">
      <div className="border-b border-gray-200 bg-bank-sand px-6 py-4">
        <h1 className="text-[19px] font-bold text-bank-navy">Sign in to Online Banking</h1>
        <p className="mt-0.5 text-[11.5px] text-gray-600">
          Not enrolled? <Link href="/signup" className="font-semibold text-bank-link underline underline-offset-2">Enroll now</Link>
        </p>
      </div>
      <form action={formAction} className="space-y-4 px-6 py-6">
        {state?.error && <Alert tone="error" title="Sign-in error">{state.error}</Alert>}
        <Input
          id="login-username"
          label="Username / User ID"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Username or email"
          hint="Existing members can still sign in with their email address."
          required
        />
        <PasswordInput label="Passcode" name="password" autoComplete="current-password" placeholder="••••••••" required />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[12px] text-gray-600">
            <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-400" defaultChecked /> Save User ID
          </label>
          <details className="text-right">
            <summary className="cursor-pointer text-[12px] font-semibold text-bank-link underline underline-offset-2">
              Forgot your passcode?
            </summary>
            <p className="mt-1 max-w-[220px] text-[10.5px] leading-relaxed text-gray-500">
              Passcode reset is not available in this version.
            </p>
          </details>
        </div>
        <Button type="submit" loading={pending} variant="red" size="lg" className="w-full">
          Log in securely
        </Button>
      </form>
    </div>
  );
}

export function SignupForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signupAction, null);
  return (
    <div className="border border-gray-300 bg-white shadow-panel">
      <div className="border-b border-gray-200 bg-bank-sand px-6 py-4">
        <h1 className="text-[19px] font-bold text-bank-navy">Online banking enrollment</h1>
        <p className="mt-0.5 text-[11.5px] text-gray-600">
          Already enrolled? <Link href="/login" className="font-semibold text-bank-link underline underline-offset-2">Sign in</Link>
        </p>
      </div>
      <form action={formAction} className="space-y-6 px-6 py-6">
        {state?.error && <Alert tone="error" title="Enrollment could not continue">{state.error}</Alert>}

        <section aria-labelledby="enroll-eligibility">
          <div className="mb-3 border-b border-gray-200 pb-2">
            <h2 id="enroll-eligibility" className="text-[13px] font-bold text-bank-navy">1. Eligibility</h2>
            <p className="mt-0.5 text-[10.5px] text-gray-500">Please confirm both items to continue.</p>
          </div>
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-gray-700">
              <input type="checkbox" name="ageConfirmed" value="yes" required className="mt-0.5 h-4 w-4 accent-[#b3202e]" />
              I confirm I am at least 18 years old.
            </label>
            <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-gray-700">
              <input type="checkbox" name="usResident" value="yes" required className="mt-0.5 h-4 w-4 accent-[#b3202e]" />
              I confirm I am a U.S. resident.
            </label>
          </div>
        </section>

        <section aria-labelledby="enroll-identification">
          <div className="mb-3 border-b border-gray-200 pb-2">
            <h2 id="enroll-identification" className="text-[13px] font-bold text-bank-navy">2. Identify your relationship</h2>
            <p className="mt-0.5 text-[10.5px] text-gray-500">This is a visual prototype step, not an identity check.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="w-full text-[12px] font-bold text-gray-700">
              Identify with
              <select name="identifierType" defaultValue="ACCOUNT" required className="mt-1 block h-10 w-full rounded border border-gray-400 bg-white px-2.5 text-[14px] font-normal text-gray-900 focus:border-bank-blue focus:outline-none focus:ring-2 focus:ring-blue-100">
                <option value="ACCOUNT">Account number</option>
                <option value="CARD">Debit card</option>
              </select>
            </label>
            <Input label="Last six demo digits" name="lastSix" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="123456" autoComplete="off" required />
          </div>
          <p className="mt-2 border-l-4 border-bank-red bg-gray-50 px-3 py-2 text-[10.5px] leading-relaxed text-gray-600">
            Use sample digits only, such as 123456. Do not enter real account or card details. This value is checked for form format and discarded; it is not saved.
          </p>
        </section>

        <section aria-labelledby="enroll-tax">
          <div className="mb-3 border-b border-gray-200 pb-2">
            <h2 id="enroll-tax" className="text-[13px] font-bold text-bank-navy">3. Identity verification option</h2>
          </div>
          <div className="space-y-3">
            <div className="border border-gray-200 bg-gray-50 px-3 py-2.5 text-[11px] leading-relaxed text-gray-600">
              <span className="font-bold text-gray-800">SSN or TIN verification is not available.</span> This prototype will not ask for or store a Social Security number, tax ID, or document.
            </div>
            <label className="flex items-start gap-2.5 text-[11.5px] leading-relaxed text-gray-700">
              <input type="checkbox" name="alternateVerification" value="yes" required className="mt-0.5 h-4 w-4 accent-[#b3202e]" />
              Use the alternate, non-sensitive demo path instead of entering an SSN or TIN.
            </label>
          </div>
        </section>

        <section aria-labelledby="enroll-contact">
          <div className="mb-3 border-b border-gray-200 pb-2">
            <h2 id="enroll-contact" className="text-[13px] font-bold text-bank-navy">4. Contact and sign-in details</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" name="firstName" placeholder="First name" autoComplete="given-name" required />
            <Input label="Last name" name="lastName" placeholder="Last name" autoComplete="family-name" required />
          </div>
          <div className="mt-3 space-y-3">
            <Input
              id="signup-username"
              label="Username / User ID"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={3}
              maxLength={32}
              placeholder="e.g. sam.lee"
              hint="3-32 characters: letters, numbers, periods, underscores, hyphens. This is how you will sign in; it is not case-sensitive and cannot contain @."
              required
            />
            <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            <Input label="Phone number (optional)" name="phone" type="tel" autoComplete="tel" placeholder="(555) 555-0100" />
            <PasswordInput
              label="Create passcode"
              name="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              hint="Use 8+ characters. This creates your prototype sign-in profile."
              required
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Input label="Email verification code" disabled placeholder="Not available" autoComplete="off" />
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">No email is sent; email-code verification is not configured.</p>
            </div>
            <div>
              <Input label="Card PIN" disabled placeholder="Never collected" autoComplete="off" />
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">PIN entry is intentionally disabled. Never enter a real PIN.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="enroll-funding">
          <div className="mb-3 border-b border-gray-200 pb-2">
            <h2 id="enroll-funding" className="text-[13px] font-bold text-bank-navy">5. Optional opening-funds request</h2>
          </div>
          <Input
            label="Amount"
            name="openingDeposit"
            inputMode="decimal"
            placeholder="$0.00"
            hint="Creates an unposted request for admin review; it does not send or receive money."
          />
        </section>

        <div className="space-y-3 border-t border-gray-200 pt-4">
          <Button type="submit" loading={pending} variant="red" size="lg" className="w-full">
            Continue enrollment
          </Button>
          <p className="text-[10.5px] leading-relaxed text-gray-500">
            Submitting creates a profile in this prototype. Your age, residency, identity and email are not verified. First Meridian is fictional and is not a bank; no real deposit, transfer, card service or account is opened.
          </p>
        </div>
      </form>
    </div>
  );
}
