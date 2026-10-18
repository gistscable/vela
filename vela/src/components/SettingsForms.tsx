"use client";

import { useActionState } from "react";
import { changePasswordAction, setUsernameAction, updateProfileAction, type ActionState } from "@/lib/actions";
import { Alert, Button, Input, PasswordInput } from "./ui";

export function ProfileForm({
  firstName,
  lastName,
  phone,
  email,
}: {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateProfileAction, null);
  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert tone="error" title="Error">{state.error}</Alert>}
      {state?.success && <Alert tone="success" title="Success">Your profile has been updated.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="firstName" label="First name" defaultValue={firstName} required />
        <Input name="lastName" label="Last name" defaultValue={lastName} required />
      </div>
      <Input name="phone" label="Phone (optional)" defaultValue={phone ?? ""} placeholder="+1 (555) 000-0000" />
      <Input label="Email address" value={email} disabled hint="Contact customer service to change your sign-in email." />
      <Button type="submit" loading={pending} variant="navy">
        Save changes
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePasswordAction, null);
  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert tone="error" title="Error">{state.error}</Alert>}
      {state?.success && <Alert tone="success" title="Success">Your passcode has been changed.</Alert>}
      <PasswordInput name="currentPassword" label="Current passcode" toggleLabel="current password" autoComplete="current-password" required />
      <PasswordInput name="newPassword" label="New passcode" toggleLabel="new password" autoComplete="new-password" placeholder="At least 8 characters" required />
      <Input
        name="totpCode"
        label="Authenticator code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        placeholder="6-digit code"
        hint="Enter the current code from Google Authenticator to confirm it's you."
        required
      />
      <Button type="submit" loading={pending} variant="navy">
        Update passcode
      </Button>
    </form>
  );
}

/** Username / User ID: read-only once set; existing users without one choose it here. */
export function UsernameForm({ username }: { username: string | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setUsernameAction, null);
  if (username || state?.success) {
    return (
      <div className="space-y-2">
        {state?.success && <Alert tone="success" title="Success">{state.message}</Alert>}
        <Input id="settings-username-current" label="Username / User ID" value={username ?? ""} readOnly hint="Your sign-in username. Email sign-in keeps working." data-testid="username-current" />
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-3" data-testid="username-form">
      <p className="text-[11.5px] leading-relaxed text-gray-600">
        You do not have a Username / User ID yet. You can keep signing in with your email; choose a username to sign in with it as well. You can only set it once here.
      </p>
      {state?.error && <Alert tone="error" title="Username / User ID">{state.error}</Alert>}
      <Input
        id="settings-username"
        name="username"
        label="Choose a Username / User ID"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        minLength={3}
        maxLength={32}
        hint="3-32 characters: letters, numbers, periods, underscores, hyphens. Not case-sensitive; no @."
        required
      />
      <Button type="submit" loading={pending} variant="navy">Save username</Button>
    </form>
  );
}
