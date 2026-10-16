import "server-only";
import Stripe from "stripe";

/** Stripe keys are checked before a client is created. */

export function stripeKeyStatus(): { configured: boolean; testMode: boolean; problem: string | null } {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { configured: false, testMode: false, problem: "Stripe checkout is not configured." };
  if (!key.startsWith("sk_test_")) return { configured: false, testMode: false, problem: "Stripe checkout is unavailable." };
  return { configured: true, testMode: true, problem: null };
}

export async function getStripeClient(): Promise<Stripe | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith("sk_test_")) return null;
  return new Stripe(key);
}
