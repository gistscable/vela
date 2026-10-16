import bcrypt from "bcryptjs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar, run } from "./helpers/next-mocks";
import { useDisposableDatabase } from "./helpers/test-db";

let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;
let actions: typeof import("@/lib/actions");
let auth: typeof import("@/lib/auth");

const PASSWORD = "correct-horse-1";
const GENERIC_LOGIN_ERROR = "The User ID or passcode you entered is incorrect.";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

async function addUser(email: string, extra: Record<string, unknown> = {}) {
  return db.user.create({
    data: { email, passwordHash: await bcrypt.hash(PASSWORD, 4), firstName: "Test", lastName: "User", ...extra },
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

describe("sign-in", () => {
  it("lets an existing user without a username sign in with their email (unchanged behaviour)", async () => {
    const legacy = await addUser("legacy@example.com");
    // Old clients post the field as "email"; the new form posts "username". Both must work.
    for (const field of ["email", "username"]) {
      cookieJar.clear();
      const result = await run(() => actions.loginAction(null, form({ [field]: "Legacy@Example.com", password: PASSWORD })));
      expect(result.redirectedTo, field).toBe("/mfa/setup");
      expect(await auth.getMfaChallenge()).toMatchObject({ userId: legacy.id, stage: "setup" });
    }
  });

  it("signs in by Username / User ID, case-insensitively, and still by email once one is set", async () => {
    const user = await addUser("sam@example.com", { username: "Sam.Lee", usernameNormalized: "sam.lee" });
    for (const typed of ["Sam.Lee", "sam.lee", "SAM.LEE", "sam@example.com"]) {
      cookieJar.clear();
      const result = await run(() => actions.loginAction(null, form({ username: typed, password: PASSWORD })));
      expect(result.redirectedTo, typed).toBe("/mfa/setup");
      expect((await auth.getMfaChallenge())?.userId, typed).toBe(user.id);
    }
  });

  it("still requires MFA: no full session cookie is issued by password sign-in", async () => {
    await addUser("mfa@example.com", { username: "mfa.user", usernameNormalized: "mfa.user", mfaEnabled: true });
    const result = await run(() => actions.loginAction(null, form({ username: "mfa.user", password: PASSWORD })));
    expect(result.redirectedTo).toBe("/mfa/verify");
    expect(await auth.getSessionUserId()).toBeNull();
  });

  it("returns one generic error for unknown user, wrong password and unknown username", async () => {
    await addUser("sam@example.com", { username: "sam.lee", usernameNormalized: "sam.lee" });
    const attempts = [
      { username: "nobody", password: PASSWORD },
      { username: "nobody@example.com", password: PASSWORD },
      { username: "sam.lee", password: "wrong-password" },
      { username: "sam@example.com", password: "wrong-password" },
      { username: "", password: PASSWORD },
    ];
    for (const attempt of attempts) {
      const result = await run(() => actions.loginAction(null, form(attempt)));
      expect(result.value, JSON.stringify(attempt)).toEqual({ error: GENERIC_LOGIN_ERROR });
    }
    expect(cookieJar.size).toBe(0);
  });

  it("keeps enrollment approval: pending and rejected users cannot proceed, and statuses are not leaked on a bad password", async () => {
    await addUser("pending@example.com", { username: "pending.user", usernameNormalized: "pending.user", enrollmentStatus: "PENDING_APPROVAL" });
    await addUser("rejected@example.com", { enrollmentStatus: "REJECTED" });

    const pending = await run(() => actions.loginAction(null, form({ username: "pending.user", password: PASSWORD })));
    expect(pending.value?.error).toMatch(/awaiting approval/);
    const rejected = await run(() => actions.loginAction(null, form({ username: "rejected@example.com", password: PASSWORD })));
    expect(rejected.value?.error).toMatch(/not active/);
    const leak = await run(() => actions.loginAction(null, form({ username: "pending.user", password: "wrong-password" })));
    expect(leak.value).toEqual({ error: GENERIC_LOGIN_ERROR });
    expect(cookieJar.size).toBe(0);
  });
});

describe("enrollment", () => {
  const base = {
    ageConfirmed: "yes", usResident: "yes", firstName: "Sam", lastName: "Lee",
    email: "sam@example.com", phone: "(312) 555-0192", password: PASSWORD, username: "Sam.Lee",
  };

  it("requires a username and validates it on the server", async () => {
    for (const bad of ["", "ab", "has space", "sam@example.com", "admin", "x".repeat(40)]) {
      const result = await run(() => actions.signupAction(null, form({ ...base, username: bad })));
      expect(result.value?.error, bad).toBeTruthy();
      expect(result.redirectedTo, bad).toBeNull();
    }
    expect(await db.user.count()).toBe(0);
    // Omitted entirely (client validation bypassed).
    const { username: _omit, ...withoutUsername } = base;
    const missing = await run(() => actions.signupAction(null, form(withoutUsername)));
    expect(missing.value?.error).toBeTruthy();
    expect(await db.user.count()).toBe(0);
  });

  it("stores the username separately from the internal id and keeps the account pending approval", async () => {
    const result = await run(() => actions.signupAction(null, form(base)));
    expect(result.redirectedTo).toBe("/enrollment/pending");
    const user = await db.user.findUnique({ where: { email: "sam@example.com" } });
    expect(user).toMatchObject({ username: "Sam.Lee", usernameNormalized: "sam.lee", enrollmentStatus: "PENDING_APPROVAL" });
    expect(user!.id).not.toBe("Sam.Lee");
    expect(user!.passwordHash).not.toContain(PASSWORD);
    // Cannot sign in until an administrator approves.
    const login = await run(() => actions.loginAction(null, form({ username: "sam.lee", password: PASSWORD })));
    expect(login.value?.error).toMatch(/awaiting approval/);
  });

  it("enforces case-insensitive uniqueness", async () => {
    await run(() => actions.signupAction(null, form(base)));
    for (const clash of ["sam.lee", "SAM.LEE"]) {
      const result = await run(() => actions.signupAction(null, form({ ...base, email: `${clash}@other.test`, username: clash })));
      expect(result.value?.error, clash).toMatch(/not available/);
    }
    expect(await db.user.count()).toBe(1);
  });

  it("still rejects a duplicate email and a weak passcode", async () => {
    await run(() => actions.signupAction(null, form(base)));
    const dupe = await run(() => actions.signupAction(null, form({ ...base, username: "other.name" })));
    expect(dupe.value?.error).toMatch(/already exists/);
    const weak = await run(() => actions.signupAction(null, form({ ...base, email: "w@example.com", username: "weak.pw", password: "short" })));
    expect(weak.value?.error).toMatch(/at least 8/);
  });
});

describe("settings: existing users choose a username", () => {
  it("lets a legacy session user claim one once, without changing their email or id", async () => {
    const legacy = await addUser("legacy@example.com");
    await auth.setSessionCookie(legacy.id);
    const ok = await run(() => actions.setUsernameAction(null, form({ username: "Legacy.User" })));
    expect(ok.value).toMatchObject({ success: true });
    const stored = await db.user.findUnique({ where: { id: legacy.id } });
    expect(stored).toMatchObject({ email: "legacy@example.com", username: "Legacy.User", usernameNormalized: "legacy.user" });
    const second = await run(() => actions.setUsernameAction(null, form({ username: "Another.Name" })));
    expect(second.value?.error).toBeTruthy();
    expect((await db.user.findUnique({ where: { id: legacy.id } }))?.username).toBe("Legacy.User");
  });
});
