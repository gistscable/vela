import { describe, expect, it, vi } from "vitest";
import {
  isMissingSchemaError,
  isMissingTableError,
  missingColumnFromError,
  wrapPrismaForMissingSchema,
} from "@/lib/schema-compat";

const NEW_USER_FIELDS = [
  "historyPaused", "historyPausedAt", "historyPausedById",
  "accessLocked", "lockReason", "lockedById", "lockedAt",
];
const NEW_CARD_FIELDS = ["kind", "creditLimit"];

function missingColumn(model: string, field: string) {
  const error = new Error(
    `Invalid prisma.${model.toLowerCase()}.findMany() invocation: The column \`${model}.${field}\` does not exist in the current database.`,
  ) as Error & { code: string; meta: { column: string } };
  error.code = "P2022";
  error.meta = { column: `${model}.${field}` };
  return error;
}

function missingTable(table: string) {
  const error = new Error(
    `The table \`public.${table}\` does not exist in the current database.`,
  ) as Error & { code: string; meta: { table: string } };
  error.code = "P2021";
  error.meta = { table: `public.${table}` };
  return error;
}

function pick(row: Record<string, unknown>, select?: Record<string, unknown>) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(select)) if (value === true) out[key] = row[key];
  return out;
}

/** Fake delegate emulating Prisma against the pre-migration database. */
function fakeUserDelegate() {
  const legacyRow: Record<string, unknown> = {
    id: "u1", email: "ada@example.com", username: null, usernameNormalized: null,
    passwordHash: "hash", firstName: "Ada", lastName: "Example", phone: null,
    role: "CUSTOMER", enrollmentStatus: "APPROVED", enrollmentReviewedById: null,
    enrollmentReviewedAt: null, mfaEnabled: false, totpSecretEncrypted: null,
    totpLastUsedStep: null, mfaPendingSecretEncrypted: null, mfaPendingExpiresAt: null,
    mfaFailedAttempts: 0, mfaLockedUntil: null, createdAt: new Date(0), updatedAt: new Date(0),
  };
  const guard = (args: any) => {
    if (!args?.select) throw missingColumn("User", "accessLocked");
    for (const field of NEW_USER_FIELDS) {
      if (field in (args.select ?? {})) throw missingColumn("User", field);
      if (field in (args.where ?? {})) throw missingColumn("User", field);
      if (field in (args.orderBy ?? {})) throw missingColumn("User", field);
    }
  };
  return {
    legacyRow,
    findUnique: vi.fn(async (args: any = {}) => { guard(args); return pick(legacyRow, args.select); }),
    findMany: vi.fn(async (args: any = {}) => { guard(args); return [pick(legacyRow, args.select)]; }),
    count: vi.fn(async (args: any = {}) => {
      for (const field of NEW_USER_FIELDS) if (field in (args?.where ?? {})) throw missingColumn("User", field);
      return 7;
    }),
    // Emulates Prisma writes against the old database: writing a missing
    // column fails in the SET clause; otherwise the returned row selects
    // every column, so it fails too unless an explicit legacy select is used.
    update: vi.fn(async (args: any = {}) => {
      for (const field of NEW_USER_FIELDS) if (field in (args.data ?? {})) throw missingColumn("User", field);
      if (!args?.select) throw missingColumn("User", "accessLocked");
      for (const field of NEW_USER_FIELDS) if (field in (args.select ?? {})) throw missingColumn("User", field);
      return pick({ ...legacyRow, ...(args.data ?? {}) }, args.select);
    }),
    create: vi.fn(async (args: any = {}) => {
      for (const field of NEW_USER_FIELDS) if (field in (args.data ?? {})) throw missingColumn("User", field);
      if (!args?.select) throw missingColumn("User", "accessLocked");
      for (const field of NEW_USER_FIELDS) if (field in (args.select ?? {})) throw missingColumn("User", field);
      return pick({ ...legacyRow, ...(args.data ?? {}) }, args.select);
    }),
  };
}

function fakeCardDelegate() {
  const legacyRow: Record<string, unknown> = {
    id: "c1", accountId: "a1", last4: "8124", brand: "Visa", status: "ACTIVE",
    dailyLimit: 50000, spentToday: 0, createdAt: new Date(0),
  };
  const guard = (args: any) => {
    if (!args?.select) throw missingColumn("Card", "kind");
    for (const field of NEW_CARD_FIELDS) {
      if (field in (args.select ?? {})) throw missingColumn("Card", field);
      if (field in (args.where ?? {})) throw missingColumn("Card", field);
    }
  };
  return {
    legacyRow,
    findMany: vi.fn(async (args: any = {}) => { guard(args); return [pick(legacyRow, args.select)]; }),
    findFirst: vi.fn(async (args: any = {}) => { guard(args); return pick(legacyRow, args.select); }),
  };
}

describe("missing-schema error detection", () => {
  it("recognises Prisma P2021/P2022 and plain does-not-exist errors", () => {
    expect(isMissingSchemaError(missingColumn("User", "accessLocked"))).toBe(true);
    expect(isMissingSchemaError(missingTable("ProductApplication"))).toBe(true);
    expect(isMissingSchemaError(new Error("The column `Card.kind` does not exist"))).toBe(true);
    expect(isMissingTableError(missingTable("ProductApplication"))).toBe(true);
    expect(isMissingTableError(missingColumn("User", "accessLocked"))).toBe(false);
    expect(isMissingSchemaError(new Error("connection refused"))).toBe(false);
    const pgError = new Error("column User.accessLocked does not exist") as Error & { code: string };
    pgError.code = "42703";
    expect(isMissingSchemaError(pgError)).toBe(true);
    expect(missingColumnFromError(pgError)).toBe("accessLocked");
    expect(missingColumnFromError(missingColumn("User", "accessLocked"))).toBe("accessLocked");
    expect(missingColumnFromError(new Error("boom"))).toBeNull();
  });
});

describe("wrapPrismaForMissingSchema", () => {
  it("retries a full user read without the new columns and fills their defaults", async () => {
    const user = fakeUserDelegate();
    const db = wrapPrismaForMissingSchema({ user });
    const row = await db.user.findUnique({ where: { id: "u1" } });
    expect(user.findUnique).toHaveBeenCalledTimes(2);
    const retryArgs = user.findUnique.mock.calls[1][0];
    expect(retryArgs.select.email).toBe(true);
    for (const field of NEW_USER_FIELDS) expect(retryArgs.select).not.toHaveProperty(field);
    expect(row.email).toBe("ada@example.com");
    expect(row.accessLocked).toBe(false);
    expect(row.historyPaused).toBe(false);
    expect(row.lockReason).toBeNull();
  });

  it("retries an explicit select that named a new column, dropping only that column", async () => {
    const user = fakeUserDelegate();
    const db = wrapPrismaForMissingSchema({ user });
    const row = await db.user.findUnique({
      where: { id: "u1" },
      select: { id: true, email: true, historyPaused: true },
    });
    expect(row).toMatchObject({ id: "u1", email: "ada@example.com", historyPaused: false });
  });

  it("retries card reads without kind/creditLimit and reports cards as debit by default", async () => {
    const card = fakeCardDelegate();
    const db = wrapPrismaForMissingSchema({ card });
    const rows = await db.card.findMany({ where: { accountId: { in: ["a1"] } }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "c1", kind: "DEBIT", creditLimit: null });
    // A where-filter on the missing column is dropped rather than crashing.
    const first = await db.card.findFirst({ where: { accountId: "a1", kind: "DEBIT" } });
    expect(first).toMatchObject({ id: "c1", kind: "DEBIT" });
  });

  it("strips new fields from count filters without injecting a select", async () => {
    const user = fakeUserDelegate();
    const db = wrapPrismaForMissingSchema({ user });
    await expect(db.user.count({ where: { accessLocked: true } })).resolves.toBe(7);
    const retryArgs = user.count.mock.calls[1][0];
    expect(retryArgs.where).not.toHaveProperty("accessLocked");
    expect(retryArgs).not.toHaveProperty("select");
  });

  it("treats a missing ProductApplication table as empty for reads", async () => {
    const productApplication = {
      findMany: vi.fn(async (_args: any) => { throw missingTable("ProductApplication"); }),
      findFirst: vi.fn(async (_args: any) => { throw missingTable("ProductApplication"); }),
      findUnique: vi.fn(async (_args: any) => { throw missingTable("ProductApplication"); }),
      count: vi.fn(async (_args?: any) => { throw missingTable("ProductApplication"); }),
    };
    const db = wrapPrismaForMissingSchema({ productApplication });
    await expect(db.productApplication.findMany({ where: { userId: "u1" } })).resolves.toEqual([]);
    await expect(db.productApplication.findFirst({ where: { userId: "u1" } })).resolves.toBeNull();
    await expect(db.productApplication.findUnique({ where: { id: "p1" } })).resolves.toBeNull();
    await expect(db.productApplication.count()).resolves.toBe(0);
  });

  it("does not mask missing tables for other models or real errors", async () => {
    const user = fakeUserDelegate();
    const db = wrapPrismaForMissingSchema({ user });

    const broken = wrapPrismaForMissingSchema({
      user: { findMany: vi.fn(async (_args?: any) => { throw new Error("connection refused"); }) },
      account: { findMany: vi.fn(async (_args?: any) => { throw missingTable("Account"); }) },
    });
    await expect(broken.user.findMany()).rejects.toThrow("connection refused");
    await expect(broken.account.findMany()).rejects.toMatchObject({ code: "P2021" });
  });

  it("retries a row-returning user update with a legacy select (the MFA code-submit write)", async () => {
    const user = fakeUserDelegate();
    const db = wrapPrismaForMissingSchema({ user });
    // verifyTotpLoginAction records the used step exactly like this: every
    // written column exists on the old database, but Prisma's returned row
    // would select accessLocked/historyPaused and crash before this fix.
    const row = await db.user.update({
      where: { id: "u1" },
      data: { totpLastUsedStep: 12345, mfaFailedAttempts: 0, mfaLockedUntil: null },
    });
    expect(user.update).toHaveBeenCalledTimes(2);
    const retryArgs = user.update.mock.calls[1][0];
    expect(retryArgs.data).toEqual({ totpLastUsedStep: 12345, mfaFailedAttempts: 0, mfaLockedUntil: null });
    for (const field of NEW_USER_FIELDS) expect(retryArgs.select).not.toHaveProperty(field);
    expect(row).toMatchObject({ id: "u1", totpLastUsedStep: 12345, accessLocked: false });
  });

  it("retries a row-returning create, but never a write whose data needs a missing column", async () => {
    const user = fakeUserDelegate();
    const db = wrapPrismaForMissingSchema({ user });
    const created = await db.user.create({ data: { email: "new@example.com", passwordHash: "h" } });
    expect(created).toMatchObject({ email: "new@example.com", accessLocked: false });

    // An admin lock writes accessLocked itself: silently stripping it would
    // report success while locking nobody, so it must still fail, unretried.
    await expect(db.user.update({ where: { id: "u1" }, data: { accessLocked: true } })).rejects.toMatchObject({ code: "P2022" });
    expect(user.update).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying when each attempt reveals another missing column (older databases)", async () => {
    const legacyRow = { id: "u1", email: "ada@example.com", firstName: "Ada" };
    const findUnique = vi.fn(async (args: any = {}) => {
      if (!args?.select) throw missingColumn("User", "accessLocked");
      if ("username" in args.select) throw missingColumn("User", "username");
      if ("usernameNormalized" in args.select) throw missingColumn("User", "usernameNormalized");
      return pick({ ...legacyRow, username: undefined, usernameNormalized: undefined }, args.select);
    });
    const db = wrapPrismaForMissingSchema({ user: { findUnique } });
    const row = await db.user.findUnique({ where: { id: "u1" } });
    expect(row).toMatchObject({ id: "u1", email: "ada@example.com" });
    expect(findUnique.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("converts a nested include of cards into a legacy select on retry", async () => {
    const legacyCard = { id: "c1", accountId: "a1", last4: "8124", brand: "Visa", status: "ACTIVE", dailyLimit: 50000, spentToday: 0, createdAt: new Date(0) };
    const account = {
      findMany: vi.fn(async (args: any = {}) => {
        if (args.include?.cards === true) throw missingColumn("Card", "kind");
        const cardSelect = args.select?.cards?.select;
        if (!cardSelect) throw new Error("expected a legacy card select on retry");
        for (const field of NEW_CARD_FIELDS) expect(cardSelect).not.toHaveProperty(field);
        return [{ id: "a1", userId: "u1", name: "Checking", balance: 100, cards: [pick(legacyCard, cardSelect)] }];
      }),
    };
    const db = wrapPrismaForMissingSchema({ account });
    const rows = await db.account.findMany({ where: { userId: "u1" }, include: { cards: true } });
    expect(rows[0].cards[0]).toMatchObject({ id: "c1", kind: "DEBIT", creditLimit: null });
  });

  it("wraps the transaction client passed to $transaction callbacks", async () => {
    const user = fakeUserDelegate();
    const rawTx = { user };
    const client = {
      user,
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(rawTx)),
    };
    const db = wrapPrismaForMissingSchema(client);
    const email = await db.$transaction(async (tx: any) => (await tx.user.findUnique({ where: { id: "u1" } })).email);
    expect(email).toBe("ada@example.com");
  });

  it("passes reads through untouched when the database is up to date", async () => {
    const row = { id: "u1", email: "ada@example.com", accessLocked: true, historyPaused: true };
    const user = { findUnique: vi.fn(async (_args: any) => row) };
    const db = wrapPrismaForMissingSchema({ user });
    await expect(db.user.findUnique({ where: { id: "u1" } })).resolves.toMatchObject({
      email: "ada@example.com", accessLocked: true, historyPaused: true,
    });
    expect(user.findUnique).toHaveBeenCalledTimes(1);
  });
});
