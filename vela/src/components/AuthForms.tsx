"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type ActionState } from "@/lib/actions";
import { SESSION_IDLE_LABEL, SESSION_IDLE_NOTICE } from "@/lib/session";
import { Alert, Button, Input, PasswordInput } from "./ui";

export function LoginForm({ notice }: { notice?: string } = {}) {
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
        {notice === SESSION_IDLE_NOTICE && (
          <Alert tone="info" title="Signed out for security">
            You were signed out after {SESSION_IDLE_LABEL} of inactivity. Sign in again to continue.
          </Alert>
        )}
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
              Contact customer service if you need help resetting your passcode.
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
  return (
    <div className="border border-gray-300 bg-white shadow-panel">
      <div className="border-b border-gray-200 bg-bank-sand px-6 py-4">
        <h1 className="text-[19px] font-bold text-bank-navy">Enrollment is handled by your bank</h1>
        <p className="mt-0.5 text-[11.5px] text-gray-600">
          Already enrolled? <Link href="/login" className="font-semibold text-bank-link underline underline-offset-2">Sign in</Link>
        </p>
      </div>
      <div className="space-y-5 px-6 py-6">
        <p className="text-[13px] leading-relaxed text-gray-700">
          To open an account, contact FMB — visit a branch, or call Support. Online self-enrollment is not available.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/help"
            className="inline-flex h-9 items-center rounded bg-bank-navy px-4 text-[12px] font-bold text-white hover:bg-bank-navyDark"
          >
            Contact Support
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded border border-gray-400 bg-white px-4 text-[12px] font-bold text-bank-navy hover:bg-gray-50"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
