import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar, run } from "./helpers/next-mocks";
import { useDisposableDatabase } from "./helpers/test-db";
import { SESSION_IDLE_NOTICE, SESSION_IDLE_SECONDS } from "@/lib/session";

const SESSION_COOKIE = "fmb_session_v2";

let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;
let actions: typeof import("@/lib/actions");
let auth: typeof import("@/lib/auth");

function jwtPayload(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { sub: string; iat: number; exp: number; kind: string };
}

function authSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "fmb-dev-auth-secret-change-me");
}

async function addUser(email: string, extra: Record<string, unknown> = {}) {
  return db.user.create({
    data: { email, passwordHash: "test-hash", firstName: "Test", lastName: "User", ...extra },
  });
}

beforeEach(async () => {
  cookieJar.clear();
  testDb = useDisposableDatabase();
  ({ db } = await import("@/lib/db"));
  actions = await import("@/lib/actions");
  auth = await import("@/lib/auth");
});
afterEach(() => {
  testDb.cleanup();
  vi.resetModules();
});

describe("idle session cookie", () => {
  it("issues a session JWT that lasts the idle window, not seven days", async () => {
    const user = await addUser("idle-cookie@example.test");
    await auth.setSessionCookie(user.id);
    const token = cookieJar.get(SESSION_COOKIE);
    expect(token).toBeTruthy();
    const payload = jwtPayload(token!);
    expect(payload.kind).toBe("session");
    expect(payload.sub).toBe(user.id);
    expect(payload.exp - payload.iat).toBe(SESSION_IDLE_SECONDS);
    expect(await auth.getSessionUserId()).toBe(user.id);
  });

  it("treats an expired JWT as signed out and hands off to the session-ending route with an idle notice", async () => {
    const user = await addUser("idle-expired@example.test");
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sub: user.id, kind: "session" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now - 700)
      .setExpirationTime(now - 10)
      .sign(authSecret());
    cookieJar.set(SESSION_COOKIE, token);

    expect(await auth.getSessionUserId()).toBeNull();
    const result = await run(() => auth.requireUser());
    // Server Components cannot delete cookies in Next.js 15, so requireUser
    // must not clear the cookie itself: it redirects to /api/auth/end, whose
    // route handler clears the cookies and lands on /login?notice=idle.
    expect(result.redirectedTo).toBe(`/api/auth/end?notice=${SESSION_IDLE_NOTICE}`);
    expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
  });

  it("sends a locked member to the session-ending route instead of deleting cookies itself", async () => {
    const user = await addUser("idle-locked@example.test", { accessLocked: true, lockReason: "Hold for review." });
    await auth.setSessionCookie(user.id);
    const result = await run(() => auth.requireUser());
    expect(result.redirectedTo).toBe("/api/auth/end");
    expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
  });
});

describe("idle session actions", () => {
  it("refreshes a valid session and refuses a missing or locked one", async () => {
    const user = await addUser("idle-touch@example.test");
    expect(await actions.touchSessionAction()).toEqual({ ok: false });

    await auth.setSessionCookie(user.id);
    expect(await actions.touchSessionAction()).toEqual({ ok: true });
    const payload = jwtPayload(cookieJar.get(SESSION_COOKIE)!);
    expect(payload.sub).toBe(user.id);
    expect(payload.exp - payload.iat).toBe(SESSION_IDLE_SECONDS);

    await db.user.update({ where: { id: user.id }, data: { accessLocked: true, lockReason: "Hold for review." } });
    expect(await actions.touchSessionAction()).toEqual({ ok: false });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("clears the session cookie when the idle watchdog expires it", async () => {
    const user = await addUser("idle-expire@example.test");
    await auth.setSessionCookie(user.id);
    expect(await actions.expireIdleSessionAction()).toEqual({ ok: true });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await auth.getSessionUserId()).toBeNull();
  });
});

describe("GET /api/auth/end", () => {
  it("clears the auth cookies and redirects to sign-in, keeping only the idle notice", async () => {
    const { GET } = await import("@/app/api/auth/end/route");
    const response = await GET(new Request(`https://example.test/api/auth/end?notice=${SESSION_IDLE_NOTICE}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(`/login?notice=${SESSION_IDLE_NOTICE}`);
    const setCookies = response.headers.getSetCookie().join("\n");
    expect(setCookies).toContain(SESSION_COOKIE);
    expect(setCookies).toContain("fmb_mfa_challenge");

    const noNotice = await GET(new Request("https://example.test/api/auth/end?notice=https://evil.example"));
    expect(noNotice.headers.get("location")).toContain("/login");
    expect(noNotice.headers.get("location")).not.toContain("evil");
  });
});
