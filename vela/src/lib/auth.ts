import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { db, type User } from "@/lib/db";
import { SESSION_IDLE_NOTICE, SESSION_IDLE_SECONDS } from "@/lib/session";

export const SESSION_COOKIE = "fmb_session_v2";
const MFA_COOKIE = "fmb_mfa_challenge";

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "fmb-dev-auth-secret-change-me");
}

export function isSharedPreviewDemoMode(): Promise<boolean> {
  return Promise.resolve(process.env.PREVIEW_DEMO_MODE === "1" || process.env.PREVIEW_DEMO_MODE === "true");
}

async function sharedDemoUser(): Promise<User | null> {
  return db.user.findUnique({ where: { email: "demo@vela.app" } });
}

async function sign(payload: Record<string, unknown>, expiresIn: string): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiresIn).sign(secret());
}

async function verify(token: string | undefined): Promise<Record<string, any> | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as Record<string, any>;
  } catch {
    return null;
  }
}

type SessionRead = { sub: string } | "expired" | null;

async function readSession(): Promise<SessionRead> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "session" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) return "expired";
    return null;
  }
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await sign({ sub: userId, kind: "session" }, `${SESSION_IDLE_SECONDS}s`);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_IDLE_SECONDS });
}

export async function setMfaChallengeCookie(userId: string, stage: "setup" | "verify"): Promise<void> {
  const token = await sign({ sub: userId, kind: "mfa", stage }, "15m");
  (await cookies()).set(MFA_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 15 });
}

export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_COOKIE);
}

export const MFA_COOKIE_NAME = MFA_COOKIE;

export async function getSessionUserId(): Promise<string | null> {
  const session = await readSession();
  if (!session || session === "expired") return null;
  return session.sub;
}

/** Session user, or the shared demo user in shared-preview mode. */
export async function getEffectiveUserId(): Promise<string | null> {
  const session = await getSessionUserId();
  if (session) return session;
  if (await isSharedPreviewDemoMode()) return (await sharedDemoUser())?.id ?? null;
  return null;
}

export async function requireUser(): Promise<User> {
  if (await isSharedPreviewDemoMode()) {
    const demo = await sharedDemoUser();
    if (demo) return demo;
  }
  const session = await readSession();
  if (session === "expired") {
    // Cookies cannot be deleted from a Server Component in Next.js 15 (it
    // throws, which is what crashed the app layout), so hand off to the
    // /api/auth/end route handler, which clears them and redirects to /login.
    redirect(`/api/auth/end?notice=${SESSION_IDLE_NOTICE}`);
  }
  if (!session) redirect("/login");
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.enrollmentStatus !== "APPROVED") redirect("/login");
  if (user.accessLocked) {
    redirect("/api/auth/end");
  }
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/** User in a pending MFA challenge (setup or verify stage); else back to /login. */
export async function requireMfaChallengeUser(stage: "setup" | "verify"): Promise<User> {
  const payload = await verify((await cookies()).get(MFA_COOKIE)?.value);
  if (!payload || payload.kind !== "mfa" || payload.stage !== stage || typeof payload.sub !== "string") redirect("/login");
  const user = await db.user.findUnique({ where: { id: payload.sub as string } });
  if (!user) redirect("/login");
  return user as User;
}

export async function getMfaChallenge(): Promise<{ userId: string; stage: "setup" | "verify" } | null> {
  const payload = await verify((await cookies()).get(MFA_COOKIE)?.value);
  if (!payload || payload.kind !== "mfa" || typeof payload.sub !== "string") return null;
  return { userId: payload.sub, stage: payload.stage === "setup" ? "setup" : "verify" };
}
