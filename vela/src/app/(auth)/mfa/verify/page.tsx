import type { Metadata } from "next";
import { TotpLoginForm } from "@/components/MfaForms";
import { requireMfaChallengeUser } from "@/lib/auth";
import { buildMfaContactHints } from "@/lib/mfa-contact";

export const metadata: Metadata = { title: "Choose verification method — First Meridian" };

export default async function MfaVerifyPage() {
  // The user comes from the signed, server-side MFA challenge cookie. This page takes no URL
  // parameters or client-supplied IDs, and only masked values leave the server.
  const user = await requireMfaChallengeUser("verify");
  return <TotpLoginForm contact={buildMfaContactHints({ email: user.email, phone: user.phone })} />;
}
