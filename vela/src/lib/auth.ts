import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db, type User } from "@/lib/db";

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

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await sign({ sub: userId, kind: "session" }, "7d");
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
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

export async function getSessionUserId(): Promise<string | null> {
  const payload = await verify((await cookies()).get(SESSION_COOKIE)?.value);
  if (!payload || payload.kind !== "session" || typeof payload.sub !== "string") return null;
  return payload.sub;
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
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.enrollmentStatus !== "APPROVED") redirect("/login");
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
