import { NextRequest, NextResponse } from "next/server";
import { isE2bPreviewHost } from "@/lib/preview";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/accounts",
  "/transactions",
  "/transfer",
  "/receive",
  "/mobile-deposit",
  "/services",
  "/help",
  "/bill-pay",
  "/linked-accounts",
  "/cards",
  "/statements",
  "/settings",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!needsAuth) return NextResponse.next();

  // The E2B preview iframe may not retain cookies. Let the server layout decide:
  // it still requires a real session unless PREVIEW_DEMO_MODE is enabled at runtime.
  const previewHostHeaders = [req.headers.get("x-forwarded-host"), req.headers.get("host"), req.nextUrl.hostname];
  if (previewHostHeaders.some(isE2bPreviewHost)) return NextResponse.next();

  // Gate quickly on cookie presence here. The server-only requireUser() verifies the JWT
  // with the runtime AUTH_SECRET, avoiding a second (potentially build-time-inlined) copy
  // of the secret in the Edge middleware bundle.
  const token = req.cookies.get("fmb_session_v2")?.value;
  if (token) return NextResponse.next();

  // Temporary, value-free trace for diagnosing redirects in the embedded preview.
  // Never log cookie contents or full referer URLs.
  console.warn(
    `[auth-trace] middleware redirect path=${pathname} v2_cookie=missing legacy_cookie=${Boolean(req.cookies.get("fmb_session")?.value)} fetch_site=${req.headers.get("sec-fetch-site") ?? "unknown"} fetch_dest=${req.headers.get("sec-fetch-dest") ?? "unknown"} origin=${req.headers.get("origin") ?? "none"} forwarded_proto=${req.headers.get("x-forwarded-proto") ?? "unknown"}`
  );

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
