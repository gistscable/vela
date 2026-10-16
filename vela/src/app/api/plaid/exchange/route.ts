import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId, isSharedPreviewDemoMode } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlaidClient } from "@/lib/plaid";
import { encryptSensitive } from "@/lib/sensitive";

export const runtime = "nodejs";

const bodySchema = z.object({
  publicToken: z.string().min(1).max(3000),
  institutionName: z.string().trim().max(120).optional(),
  institutionId: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  if (await isSharedPreviewDemoMode()) {
    return NextResponse.json({ error: "External bank linking is disabled for the shared sample account." }, { status: 503 });
  }
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const plaid = await getPlaidClient();
  if (!plaid) return NextResponse.json({ error: "Plaid is not configured for this environment." }, { status: 503 });

  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid bank-link response." }, { status: 400 });
  }

  try {
    const exchanged = await plaid.itemPublicTokenExchange({ public_token: parsed.publicToken });
    const itemId = exchanged.data.item_id;
    const accountsResponse = await plaid.accountsGet({ access_token: exchanged.data.access_token });
    const accounts = accountsResponse.data.accounts.map((account) => ({
      name: account.name,
      officialName: account.official_name ?? null,
      mask: account.mask ?? "",
      type: account.type,
      subtype: account.subtype ?? null,
    }));
    const prior = await db.linkedBank.findUnique({ where: { plaidItemId: itemId } });
    if (prior && prior.userId !== userId) {
      return NextResponse.json({ error: "This bank connection is already associated with another profile." }, { status: 409 });
    }

    const data = {
      userId,
      provider: "PLAID",
      institutionId: parsed.institutionId || null,
      institutionName: parsed.institutionName || "Connected financial institution",
      encryptedAccessToken: encryptSensitive(exchanged.data.access_token),
      accountsJson: JSON.stringify(accounts),
    };
    const linkedBank = prior
      ? await db.linkedBank.update({ where: { id: prior.id }, data })
      : await db.linkedBank.create({ data: { ...data, plaidItemId: itemId } });

    return NextResponse.json({
      connected: true,
      bank: { id: linkedBank.id, institutionName: linkedBank.institutionName, accounts },
    });
  } catch (error) {
    console.error("Plaid token exchange failed", error);
    return NextResponse.json({ error: "We couldn't finish linking that account. Please try again." }, { status: 502 });
  }
}
