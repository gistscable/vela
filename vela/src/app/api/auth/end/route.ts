import { NextResponse } from "next/server";
import { MFA_COOKIE_NAME, SESSION_COOKIE } from "@/lib/auth";
import { SESSION_IDLE_NOTICE } from "@/lib/session";

export const runtime = "nodejs";

/**
 * End the session and send the member to sign-in.
 *
 * `requireUser` runs in Server Components (e.g. the app layout), where
 * Next.js 15 forbids deleting cookies — attempting it throws and crashes the
 * page. It therefore redirects here instead: route handlers may mutate
 * cookies, so this clears the session/MFA cookies on the redirect response.
 * Only the known idle-timeout notice is carried through to /login.
 */
function endSession(request: Request) {
  const url = new URL("/login", request.url);
  if (new URL(request.url).searchParams.get("notice") === SESSION_IDLE_NOTICE) {
    url.searchParams.set("notice", SESSION_IDLE_NOTICE);
  }
  const response = NextResponse.redirect(url);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(MFA_COOKIE_NAME);
  return response;
}

export async function GET(request: Request) {
  return endSession(request);
}

export async function POST(request: Request) {
  return endSession(request);
}
