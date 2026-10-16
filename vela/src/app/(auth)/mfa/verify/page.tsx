import type { Metadata } from "next";
import { TotpLoginForm } from "@/components/MfaForms";
import { requireMfaChallengeUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose verification method — First Meridian" };

export default async function MfaVerifyPage() {
  const user = await requireMfaChallengeUser("verify");
  return <TotpLoginForm email={user.email} />;
}
