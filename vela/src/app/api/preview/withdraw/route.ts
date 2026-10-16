import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getEffectiveUserId, isSharedPreviewDemoMode } from "@/lib/auth";
import { db } from "@/lib/db";
import { lastFourDigits, safeExternalNickname, safeInstitutionName } from "@/lib/external-account-display";
import { parseCents } from "@/lib/money";
import { isPreviewApiOriginAllowed, previewCorsHeaders } from "@/lib/preview-api";

export const runtime = "nodejs";

const withdrawalSchema = z.object({
  accountId: z.string().min(1).max(100),
  externalAccountId: z.string().min(1).max(100),
  amount: z.string().trim().min(1).max(24),
  paymentMethod: z.enum(["ACH", "WIRE"]).default("ACH"),
});

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: previewCorsHeaders(request) });
}

export async function OPTIONS(request: Request) {
  if (!(await isSharedPreviewDemoMode()) || !isPreviewApiOriginAllowed(request)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: previewCorsHeaders(request) });
}

export async function POST(request: Request) {
  if (!(await isSharedPreviewDemoMode()) || !isPreviewApiOriginAllowed(request)) {
    return json(request, { error: "This preview-only action is not available from this origin." }, 403);
  }

  let parsed;
  try {
    parsed = withdrawalSchema.parse(await request.json());
  } catch {
    return json(request, { error: "Choose a source account, saved destination, and valid amount." }, 400);
  }

  const amount = parseCents(parsed.amount);
  if (!amount || amount <= 0) return json(request, { error: "Enter an amount greater than $0." }, 400);
  if (amount > 10_000_000) return json(request, { error: "Preview withdrawals are limited to $100,000." }, 400);

  const userId = await getEffectiveUserId();
  if (!userId) return json(request, { error: "The shared sample account is unavailable." }, 503);

  const [source, destination] = await Promise.all([
    db.account.findFirst({ where: { id: parsed.accountId, userId } }),
    db.externalAccount.findFirst({ where: { id: parsed.externalAccountId, userId, status: "VERIFIED" } }),
  ]);
  if (!source) return json(request, { error: "Choose an account owned by the shared sample profile." }, 404);
  if (!destination) return json(request, { error: "Choose a saved external destination." }, 404);
  if (source.status !== "ACTIVE") return json(request, { error: "This source account is not active." }, 400);

  if (source.balance < amount) return json(request, { error: "Insufficient funds for this transfer." }, 409);

  const reference = `ext_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const counterparty = `${safeInstitutionName(destination.institutionName)} · ${safeExternalNickname(destination.nickname, destination.accountType)} · •••• ${lastFourDigits(destination.accountMask)}`;
  const transaction = await db.transaction.create({
    data: {
      accountId: source.id,
      amount: -amount,
      type: "WITHDRAWAL",
      category: "TRANSFER",
      description: "External transfer",
      counterparty,
      paymentMethod: parsed.paymentMethod,
      status: "PENDING_APPROVAL",
      reference,
    },
  });
  const transactionId = transaction.id;

  revalidatePath("/dashboard");
  revalidatePath(`/accounts/${source.id}`);
  revalidatePath("/transactions");
  revalidatePath("/transfer");
  return json(request, { ok: true, redirectTo: `/transactions/${transactionId}` });
}
