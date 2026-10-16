import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { TotpSetupForm } from "@/components/MfaForms";
import { requireMfaChallengeUser } from "@/lib/auth";
import { decryptSensitive } from "@/lib/sensitive";
import { totpProvisioningUri } from "@/lib/totp";

export const metadata: Metadata = { title: "Set up authenticator — First Meridian" };

export default async function MfaSetupPage() {
  const user = await requireMfaChallengeUser("setup");
  if (!user.mfaPendingSecretEncrypted || !user.mfaPendingExpiresAt || user.mfaPendingExpiresAt <= new Date()) {
    redirect("/login");
  }

  let secret: string;
  try {
    secret = decryptSensitive(user.mfaPendingSecretEncrypted);
  } catch {
    redirect("/login");
  }
  const uri = totpProvisioningUri(user.email, secret);
  const qrDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 220 });

  return <TotpSetupForm email={user.email} qrDataUrl={qrDataUrl} secret={secret} />;
}
