import "server-only";
import Stripe from "stripe";

/** Stripe is test-mode only in this fictional demo; live keys are rejected. */

export function stripeKeyStatus(): { configured: boolean; testMode: boolean; problem: string | null } {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { configured: false, testMode: false, problem: "Stripe test checkout is not configured." };
  if (!key.startsWith("sk_test_")) return { configured: false, testMode: false, problem: "Only Stripe test keys are accepted in this demo." };
  return { configured: true, testMode: true, problem: null };
}

export async function getStripeClient(): Promise<Stripe | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith("sk_test_")) return null;
  return new Stripe(key);
}
