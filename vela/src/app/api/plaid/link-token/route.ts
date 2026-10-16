import { NextResponse } from "next/server";
import { getSessionUserId, isSharedPreviewDemoMode } from "@/lib/auth";
import { getPlaidClient } from "@/lib/plaid";

export const runtime = "nodejs";

export async function POST() {
  if (await isSharedPreviewDemoMode()) {
    return NextResponse.json({ error: "External bank linking is disabled for the shared sample account." }, { status: 503 });
  }
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const plaid = await getPlaidClient();
  if (!plaid) return NextResponse.json({ error: "Plaid is not configured for this environment." }, { status: 503 });

  try {
    const { CountryCode, Products } = await import("plaid");
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "First Meridian",
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
