import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar, run } from "./helpers/next-mocks";
import { useDisposableDatabase } from "./helpers/test-db";

/**
 * Server-side MFA protections behind the method-choice screen. Choosing a method is client-only,
 * so everything that can complete sign-in is the authenticator action tested here.
 */
let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;
let auth: typeof import("@/lib/auth");
let actions: typeof import("@/lib/actions");
let totp: typeof import("@/lib/totp");
let sensitive: typeof import("@/lib/sensitive");

const PASSWORD = "correct-horse-1";
const SESSION_COOKIE = "fmb_session_v2";
const form = (totpCode: string) => {
  const fd = new FormData();
  fd.set("totpCode", totpCode);
  return fd;
};

async function addMfaUser(email: string, phone: string | null = "+1 (312) 555-0192") {
  const secret = totp.generateTotpSecret();
  const user = await db.user.create({
    data: {
      email, phone, firstName: "T", lastName: "U",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      mfaEnabled: true, totpSecretEncrypted: sensitive.encryptSensitive(secret),
    },
  });
  return { user, secret };
}
const codeFor = (secret: string, offset = 0) => totp.totpCodeAt(secret, totp.currentTotpStep() + offset);

beforeEach(async () => {
  cookieJar.clear();
  testDb = useDisposableDatabase();
  ({ db } = await import("@/lib/db"));
  auth = await import("@/lib/auth");
  actions = await import("@/lib/actions");
  totp = await import("@/lib/totp");
  sensitive = await import("@/lib/sensitive");
});
afterEach(() => {
  testDb.cleanup();
  vi.resetModules();
});

describe("password sign-in → MFA challenge", () => {
  it("only issues a challenge, never a session", async () => {
    await addMfaUser("mfa@example.com");
    const fd = new FormData();
    fd.set("username", "mfa@example.com");
    fd.set("password", PASSWORD);
    const result = await run(() => actions.loginAction(null, fd));
    expect(result.redirectedTo).toBe("/mfa/verify");
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await auth.getSessionUserId()).toBeNull();
    expect(await auth.getMfaChallenge()).toMatchObject({ stage: "verify" });
  });
});

describe("verifyTotpLoginAction", () => {
  it("rejects a request with no MFA challenge, even with a valid code", async () => {
    const { secret } = await addMfaUser("a@example.com");
    const result = await run(() => actions.verifyTotpLoginAction(null, form(codeFor(secret))));
    expect(result.redirectedTo).toBe("/login");
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("rejects a setup-stage challenge on the verify action", async () => {
    const { user, secret } = await addMfaUser("a@example.com");
    await auth.setMfaChallengeCookie(user.id, "setup");
    const result = await run(() => actions.verifyTotpLoginAction(null, form(codeFor(secret))));
    expect(result.redirectedTo).toBe("/login");
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("does not sign in with a missing, malformed or wrong code, and counts the failures", async () => {
    const { user, secret } = await addMfaUser("a@example.com");
    await auth.setMfaChallengeCookie(user.id, "verify");
    const wrong = codeFor(secret) === "000000" ? "111111" : "000000";
    for (const bad of ["", "12345", "1234567", "abcdef", wrong]) {
      const result = await run(() => actions.verifyTotpLoginAction(null, form(bad)));
      expect(result.value?.error, bad).toBeTruthy();
      expect(result.redirectedTo, bad).toBeNull();
    }
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect((await db.user.findUnique({ where: { id: user.id } }))?.mfaFailedAttempts).toBeGreaterThan(0);
  });

  it("locks out after repeated failures, even for a then-valid code", async () => {
    const { user, secret } = await addMfaUser("a@example.com");
    await auth.setMfaChallengeCookie(user.id, "verify");
    const wrong = codeFor(secret) === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await run(() => actions.verifyTotpLoginAction(null, form(wrong)));
    const locked = await run(() => actions.verifyTotpLoginAction(null, form(codeFor(secret))));
    expect(locked.value?.error).toMatch(/too many/i);
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("signs the challenge user in with a valid authenticator code and nothing else", async () => {
    const { user, secret } = await addMfaUser("a@example.com");
    await auth.setMfaChallengeCookie(user.id, "verify");
    const result = await run(() => actions.verifyTotpLoginAction(null, form(codeFor(secret))));
    expect(result.redirectedTo).toBe("/dashboard");
    expect(await auth.getSessionUserId()).toBe(user.id);
    const stored = await db.user.findUnique({ where: { id: user.id } });
    expect(stored?.mfaFailedAttempts).toBe(0);
    expect(stored?.totpLastUsedStep).toBe(totp.currentTotpStep());
  });

  it("does not accept the same code twice (replay protection)", async () => {
    const { user, secret } = await addMfaUser("a@example.com");
    const code = codeFor(secret);
    await auth.setMfaChallengeCookie(user.id, "verify");
    expect((await run(() => actions.verifyTotpLoginAction(null, form(code)))).redirectedTo).toBe("/dashboard");
    cookieJar.clear();
    await auth.setMfaChallengeCookie(user.id, "verify");
    const replay = await run(() => actions.verifyTotpLoginAction(null, form(code)));
    expect(replay.value?.error).toBeTruthy();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it("verifies against the challenge user's own authenticator, not another user's", async () => {
    const alice = await addMfaUser("alice@example.com");
    const bob = await addMfaUser("bob@example.com");
    await auth.setMfaChallengeCookie(alice.user.id, "verify");
    const withBobsCode = await run(() => actions.verifyTotpLoginAction(null, form(codeFor(bob.secret))));
    expect(withBobsCode.value?.error).toBeTruthy();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    const withOwn = await run(() => actions.verifyTotpLoginAction(null, form(codeFor(alice.secret))));
    expect(withOwn.redirectedTo).toBe("/dashboard");
    expect(await auth.getSessionUserId()).toBe(alice.user.id);
  });

  it("ignores any client-supplied user or method fields; only the signed challenge picks the user", async () => {
    const alice = await addMfaUser("alice@example.com");
    const bob = await addMfaUser("bob@example.com");
    await auth.setMfaChallengeCookie(alice.user.id, "verify");
    const fd = form(codeFor(alice.secret));
    fd.set("userId", bob.user.id);
    fd.set("email", "bob@example.com");
    fd.set("method", "sms");
    const result = await run(() => actions.verifyTotpLoginAction(null, fd));
    expect(result.redirectedTo).toBe("/dashboard");
    expect(await auth.getSessionUserId()).toBe(alice.user.id);
  });

  it("works the same whichever method was 'selected' on the screen, since selection is client-only", async () => {
    // The screen sends no method to the server; each path ends in this identical action call.
    for (const method of ["sms", "email", "app", "authenticator"]) {
      cookieJar.clear();
      const { user, secret } = await addMfaUser(`${method}@example.com`);
      await auth.setMfaChallengeCookie(user.id, "verify");
      const result = await run(() => actions.verifyTotpLoginAction(null, form(codeFor(secret))));
      expect(result.redirectedTo, method).toBe("/dashboard");
      expect(await auth.getSessionUserId(), method).toBe(user.id);
    }
  });
});
