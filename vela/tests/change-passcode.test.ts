import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar, run } from "./helpers/next-mocks";
import { useDisposableDatabase } from "./helpers/test-db";

let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;
let auth: typeof import("@/lib/auth");
let actions: typeof import("@/lib/actions");
let totp: typeof import("@/lib/totp");
let sensitive: typeof import("@/lib/sensitive");

const OLD = "correct-horse-1";
const NEW = "battery-staple-2";
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
};

async function signedInUser(options: { mfa?: boolean } = {}) {
  const secret = totp.generateTotpSecret();
  const user = await db.user.create({
    data: {
      email: "pw@example.com", firstName: "P", lastName: "W",
      passwordHash: await bcrypt.hash(OLD, 4),
      mfaEnabled: options.mfa !== false,
      totpSecretEncrypted: options.mfa === false ? null : sensitive.encryptSensitive(secret),
    },
  });
  await auth.setSessionCookie(user.id);
  return { user, secret };
}
const code = (secret: string, offset = 0) => totp.totpCodeAt(secret, totp.currentTotpStep() + offset);

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

describe("changePasswordAction requires the authenticator code", () => {
  it("changes the passcode with the right current passcode and a valid code", async () => {
    const { user, secret } = await signedInUser();
    const result = await run(() => actions.changePasswordAction(null, form({ currentPassword: OLD, newPassword: NEW, totpCode: code(secret) })));
    expect(result.value).toEqual({ success: true });
    const after = await db.user.findUnique({ where: { id: user.id } });
    expect(await bcrypt.compare(NEW, after!.passwordHash)).toBe(true);
    expect(after!.totpLastUsedStep).toBe(totp.currentTotpStep());
  });

  it("rejects a missing or wrong code and leaves the passcode unchanged", async () => {
    const { user, secret } = await signedInUser();
    for (const totpCode of ["", "000000"]) {
      const wrong = totpCode === "000000" && code(secret) === "000000" ? "111111" : totpCode;
      const result = await run(() => actions.changePasswordAction(null, form({ currentPassword: OLD, newPassword: NEW, totpCode: wrong })));
      expect(result.value).toMatchObject({ error: expect.stringContaining("authenticator code") });
    }
    const after = await db.user.findUnique({ where: { id: user.id } });
    expect(await bcrypt.compare(OLD, after!.passwordHash)).toBe(true);
    expect(after!.mfaFailedAttempts).toBe(2);
  });

  it("does not accept a code that was already used", async () => {
    const { secret } = await signedInUser();
    const first = await run(() => actions.changePasswordAction(null, form({ currentPassword: OLD, newPassword: NEW, totpCode: code(secret) })));
    expect(first.value).toEqual({ success: true });
    const replay = await run(() => actions.changePasswordAction(null, form({ currentPassword: NEW, newPassword: "another-pass-3", totpCode: code(secret) })));
    expect(replay.value).toMatchObject({ error: expect.stringContaining("authenticator code") });
  });

  it("still requires the current passcode", async () => {
    const { user, secret } = await signedInUser();
    const result = await run(() => actions.changePasswordAction(null, form({ currentPassword: "nope-nope-1", newPassword: NEW, totpCode: code(secret) })));
    expect(result.value).toMatchObject({ error: expect.stringContaining("current passcode") });
    const after = await db.user.findUnique({ where: { id: user.id } });
    expect(await bcrypt.compare(OLD, after!.passwordHash)).toBe(true);
  });

  it("locks out after repeated wrong codes", async () => {
    const { secret } = await signedInUser();
    for (let i = 0; i < 5; i++) {
      await run(() => actions.changePasswordAction(null, form({ currentPassword: OLD, newPassword: NEW, totpCode: "123456" === code(secret) ? "654321" : "123456" })));
    }
    const locked = await run(() => actions.changePasswordAction(null, form({ currentPassword: OLD, newPassword: NEW, totpCode: code(secret) })));
    expect(locked.value).toMatchObject({ error: expect.stringContaining("Too many") });
  });

  it("refuses when no authenticator is enrolled", async () => {
    await signedInUser({ mfa: false });
    const result = await run(() => actions.changePasswordAction(null, form({ currentPassword: OLD, newPassword: NEW, totpCode: "123456" })));
    expect(result.value).toMatchObject({ error: expect.stringContaining("Google Authenticator") });
  });
});
