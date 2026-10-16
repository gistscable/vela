import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDisposableDatabase } from "./helpers/test-db";

let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;
let identity: typeof import("@/lib/identity");

async function addUser(email: string, extra: Record<string, unknown> = {}) {
  return db.user.create({
    data: { email, passwordHash: await bcrypt.hash("pw-12345678", 4), firstName: "T", lastName: "U", ...extra },
  });
}

beforeEach(async () => {
  testDb = useDisposableDatabase();
  ({ db } = await import("@/lib/db"));
  identity = await import("@/lib/identity");
});
afterEach(() => {
  testDb.cleanup();
  vi.resetModules();
});

describe("schema", () => {
  it("has the username columns and a unique index on the normalized value", () => {
    const columns = testDb.raw.prepare(`PRAGMA table_info("User")`).all().map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(["username", "usernameNormalized"]));
    const unique = testDb.raw.prepare(`PRAGMA index_list("User")`).all().filter((i) => i.unique).map((i) => i.name);
    expect(unique).toContain("User_usernameNormalized_key");
  });
});

describe("username uniqueness", () => {
  it("is case-insensitive when claiming", async () => {
    const a = await addUser("a@example.com");
    const b = await addUser("b@example.com");
    expect(await identity.claimUsername(db, a.id, "Sam.Lee")).toEqual({ ok: true, username: "Sam.Lee" });
    for (const clash of ["sam.lee", "SAM.LEE", "sAm.LeE"]) {
      const result = await identity.claimUsername(db, b.id, clash);
      expect(result.ok, clash).toBe(false);
    }
    const stored = await db.user.findUnique({ where: { id: b.id } });
    expect(stored?.username).toBeNull();
  });

  it("is enforced by the database even if application checks are bypassed", async () => {
    await addUser("a@example.com", { username: "Sam.Lee", usernameNormalized: "sam.lee" });
    await expect(addUser("b@example.com", { username: "SAM.LEE", usernameNormalized: "sam.lee" })).rejects.toSatisfy(identity.isUniqueViolation);
  });

  it("allows many users without a username", async () => {
    await addUser("a@example.com");
    await addUser("b@example.com");
    await addUser("c@example.com");
    expect(await db.user.count({ where: { usernameNormalized: null } })).toBe(3);
  });

  it("rejects invalid usernames without touching the record", async () => {
    const a = await addUser("a@example.com");
    for (const bad of ["", "ab", "has space", "a@b.co", "admin"]) {
      expect((await identity.claimUsername(db, a.id, bad)).ok, bad).toBe(false);
    }
    expect((await db.user.findUnique({ where: { id: a.id } }))?.username).toBeNull();
  });

  it("never overwrites a username that is already set", async () => {
    const a = await addUser("a@example.com");
    await identity.claimUsername(db, a.id, "first.name");
    const again = await identity.claimUsername(db, a.id, "second.name");
    expect(again.ok).toBe(false);
    const stored = await db.user.findUnique({ where: { id: a.id } });
    expect(stored).toMatchObject({ username: "first.name", usernameNormalized: "first.name" });
  });
});

describe("login identifier lookup (existing-user compatibility)", () => {
  it("finds a legacy user without a username by email, as before", async () => {
    const legacy = await addUser("legacy@example.com");
    expect((await identity.findUserByLoginIdentifier(db, "legacy@example.com"))?.id).toBe(legacy.id);
    expect((await identity.findUserByLoginIdentifier(db, "  Legacy@Example.COM "))?.id).toBe(legacy.id);
  });

  it("finds a user by username, case-insensitively, and still by email", async () => {
    const user = await addUser("new@example.com", { username: "Sam.Lee", usernameNormalized: "sam.lee" });
    for (const typed of ["Sam.Lee", "sam.lee", "SAM.LEE"]) {
      expect((await identity.findUserByLoginIdentifier(db, typed))?.id, typed).toBe(user.id);
    }
    expect((await identity.findUserByLoginIdentifier(db, "new@example.com"))?.id).toBe(user.id);
  });

  it("does not match a username against another user's email or a partial value", async () => {
    await addUser("other@example.com");
    await addUser("sam@example.com", { username: "samuel", usernameNormalized: "samuel" });
    expect(await identity.findUserByLoginIdentifier(db, "sam")).toBeNull();
    expect(await identity.findUserByLoginIdentifier(db, "other")).toBeNull();
    expect(await identity.findUserByLoginIdentifier(db, "")).toBeNull();
    expect(await identity.findUserByLoginIdentifier(db, "   ")).toBeNull();
  });

  it("still finds a legacy user whose stored email has no @", async () => {
    const odd = await addUser("legacyname");
    expect((await identity.findUserByLoginIdentifier(db, "legacyname"))?.id).toBe(odd.id);
  });

  it("does not let a new username be chosen that equals an existing legacy email", async () => {
    await addUser("legacyname");
    const b = await addUser("b@example.com");
    expect((await identity.claimUsername(db, b.id, "legacyname")).ok).toBe(false);
  });

  it("keeps the existing email identifier when a username is added", async () => {
    const legacy = await addUser("legacy@example.com");
    await identity.claimUsername(db, legacy.id, "legacy.user");
    const stored = await db.user.findUnique({ where: { id: legacy.id } });
    expect(stored?.email).toBe("legacy@example.com");
    expect(stored?.id).toBe(legacy.id);
  });
});
