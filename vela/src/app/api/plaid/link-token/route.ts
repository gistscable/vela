import { NextResponse } from "next/server";
import { getSessionUserId, isSharedPreviewDemoMode } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { getPlaidClient } from "@/lib/plaid";

export const runtime = "nodejs";

export async function POST() {
  if (await isSharedPreviewDemoMode()) {
    return NextResponse.json({ error: "Bank linking is temporarily unavailable. Please try another method." }, { status: 503 });
  }
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const plaid = await getPlaidClient();
  if (!plaid) return NextResponse.json({ error: "Bank linking is temporarily unavailable. Please try another method." }, { status: 503 });

  try {
    const { CountryCode, Products } = await import("plaid");
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: BRAND.name,
      products: [Products.Auth],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("Plaid link token error", error);
    return NextResponse.json({ error: "We couldn't start secure bank linking. Please try again." }, { status: 502 });
  }
}
