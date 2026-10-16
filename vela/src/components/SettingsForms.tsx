"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction, type ActionState } from "@/lib/actions";
import { Alert, Button, Input } from "./ui";

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
      <Input name="currentPassword" label="Current passcode" type="password" autoComplete="current-password" required />
      <Input name="newPassword" label="New passcode" type="password" autoComplete="new-password" placeholder="At least 8 characters" required />
      <Button type="submit" loading={pending} variant="navy">
        Update passcode
      </Button>
    </form>
  );
}
