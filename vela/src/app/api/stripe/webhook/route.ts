import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = await getStripeClient();
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !signingSecret) {
    return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, signingSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  if (!event.type.startsWith("payment_intent.")) return NextResponse.json({ received: true });
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const fundingId = paymentIntent.metadata?.fundingIntentId;
  if (!fundingId) return NextResponse.json({ received: true });

  try {
    await db.$transaction(async (tx) => {
      await tx.processorEvent.create({
        data: { id: event.id, provider: "STRIPE", type: event.type },
      });

      const intent = await tx.fundingIntent.findUnique({ where: { id: fundingId } });
      if (!intent) return;

      if (event.type === "payment_intent.succeeded") {
        if (intent.status === "SUCCEEDED") return;
        const account = await tx.account.findFirst({
          where: { id: intent.accountId, userId: intent.userId, status: "ACTIVE" },
        });
        if (!account) throw new Error("Funding account is no longer active");
        await tx.transaction.create({
          data: {
            accountId: account.id,
            amount: intent.amount,
            type: "DEPOSIT",
            category: "TRANSFER",
            description: "ACH deposit",
            counterparty: "Stripe test payment",
            paymentMethod: "ACH",
            status: "PENDING_APPROVAL",
            reference: intent.reference,
          },
        });
        await tx.fundingIntent.update({
          where: { id: intent.id },
          data: { status: "SUCCEEDED", stripePaymentIntentId: paymentIntent.id },
        });
      } else if (event.type === "payment_intent.payment_failed" && intent.status !== "SUCCEEDED") {
        await tx.fundingIntent.update({
          where: { id: intent.id },
          data: { status: "FAILED", stripePaymentIntentId: paymentIntent.id },
        });
      } else if (event.type === "payment_intent.processing" && intent.status === "CREATED") {
        await tx.fundingIntent.update({
          where: { id: intent.id },
          data: { status: "PROCESSING", stripePaymentIntentId: paymentIntent.id },
        });
      }
    });
  } catch (error) {
    // A retried Stripe delivery can race a prior commit. The unique event ID
    // and the FundingIntent status together make ledger posting idempotent.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ received: true });
    }
    console.error("Stripe test webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
