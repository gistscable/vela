import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar, run } from "./helpers/next-mocks";
import { useDisposableDatabase } from "./helpers/test-db";
import { HISTORY_END, OPENING_DESCRIPTION } from "@/lib/history";

let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;
let adminActions: typeof import("@/lib/admin-actions");
let actions: typeof import("@/lib/actions");
let auth: typeof import("@/lib/auth");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

async function addUser(email: string, extra: Record<string, unknown> = {}) {
  return db.user.create({
    data: { email, passwordHash: "test-hash", firstName: "Test", lastName: "User", ...extra },
  });
}

beforeEach(async () => {
  cookieJar.clear();
  testDb = useDisposableDatabase();
  ({ db } = await import("@/lib/db"));
  adminActions = await import("@/lib/admin-actions");
  actions = await import("@/lib/actions");
  auth = await import("@/lib/auth");
});

afterEach(() => {
  testDb.cleanup();
  vi.resetModules();
});

describe("pause generated history", () => {
  it("stops continuation while paused and resumes afterward", async () => {
    const admin = await addUser("pause-admin@example.test", { role: "ADMIN" });
    const customer = await addUser("pause-customer@example.test");
    const checking = await db.account.create({
      data: { userId: customer.id, type: "CHECKING", name: "Everyday Checking", accountNumber: "600000000001", routingNumber: "021000021", balance: 95_000_000 },
    });
    await db.account.create({
      data: { userId: customer.id, type: "SAVINGS", name: "High-Yield Savings", accountNumber: "600000000002", routingNumber: "021000021", balance: 10_000_000, apy: 4.25 },
    });
    await db.transaction.create({
      data: {
        accountId: checking.id,
        amount: 95_000_000,
        type: "DEPOSIT",
        category: "TRANSFER",
        description: OPENING_DESCRIPTION,
        status: "COMPLETED",
        createdAt: new Date(2023, 0, 3, 9),
      },
    });
    await auth.setSessionCookie(admin.id);

    const paused = await run(() => adminActions.adminPauseHistoryAction(form({ userId: customer.id, paused: "yes" })));
    expect(paused.redirectedTo).toBe("/admin?notice=history-paused");
    expect((await db.user.findUnique({ where: { id: customer.id } }))?.historyPaused).toBe(true);

    const { continueUserHistory } = await import("@/lib/history-continue");
    const through = new Date(2026, 9, 25, 18);
    const whilePaused = await continueUserHistory(db, customer.id, { through });
    expect(whilePaused.added).toBe(0);
    expect(await db.transaction.count({ where: { accountId: checking.id, createdAt: { gt: HISTORY_END } } })).toBe(0);

    const resumed = await run(() => adminActions.adminPauseHistoryAction(form({ userId: customer.id, paused: "no" })));
    expect(resumed.redirectedTo).toBe("/admin?notice=history-resumed");
    const afterResume = await continueUserHistory(db, customer.id, { through });
    expect(afterResume.added).toBeGreaterThan(0);
  });
});

describe("delete activity", () => {
  it("removes a posted credit and rebuilds the balance", async () => {
    const admin = await addUser("delete-admin@example.test", { role: "ADMIN" });
    const customer = await addUser("delete-customer@example.test");
    const checking = await db.account.create({
      data: { userId: customer.id, type: "CHECKING", name: "Everyday Checking", accountNumber: "600000000003", routingNumber: "021000021", balance: 15_000 },
    });
    const first = await db.transaction.create({
      data: { accountId: checking.id, amount: 10_000, type: "DEPOSIT", category: "TRANSFER", description: "First credit", status: "COMPLETED", balanceAfter: 10_000, createdAt: new Date("2026-10-01T12:00:00.000Z") },
    });
    const second = await db.transaction.create({
      data: { accountId: checking.id, amount: 5_000, type: "DEPOSIT", category: "TRANSFER", description: "Second credit", status: "COMPLETED", balanceAfter: 15_000, createdAt: new Date("2026-10-02T12:00:00.000Z") },
    });
    await auth.setSessionCookie(admin.id);

    const unconfirmed = await run(() => adminActions.adminDeleteActivityAction(form({ transactionId: second.id, accountId: checking.id })));
    expect(unconfirmed.redirectedTo).toBe(`/admin?notice=activity-confirm&account=${checking.id}`);
    expect(await db.transaction.count({ where: { accountId: checking.id } })).toBe(2);

    const deleted = await run(() => adminActions.adminDeleteActivityAction(form({ transactionId: second.id, accountId: checking.id, confirm: "yes" })));
    expect(deleted.redirectedTo).toBe(`/admin?notice=activity-deleted&account=${checking.id}`);
    expect(await db.transaction.count({ where: { accountId: checking.id } })).toBe(1);
    expect(await db.transaction.findUnique({ where: { id: first.id } })).toMatchObject({ balanceAfter: 10_000 });
    expect((await db.account.findUnique({ where: { id: checking.id } }))?.balance).toBe(10_000);
  });

  it("deletes both legs of an internal transfer", async () => {
    const admin = await addUser("pair-admin@example.test", { role: "ADMIN" });
    const customer = await addUser("pair-customer@example.test");
    const checking = await db.account.create({
      data: { userId: customer.id, type: "CHECKING", name: "Everyday Checking", accountNumber: "600000000004", routingNumber: "021000021", balance: 8_000 },
    });
    const savings = await db.account.create({
      data: { userId: customer.id, type: "SAVINGS", name: "High-Yield Savings", accountNumber: "600000000005", routingNumber: "021000021", balance: 2_000 },
    });
    const out = await db.transaction.create({
      data: { accountId: checking.id, amount: -2_000, type: "TRANSFER_OUT", category: "TRANSFER", description: "Transfer to savings", status: "COMPLETED", reference: "trf_pair1", balanceAfter: 8_000, createdAt: new Date("2026-10-03T12:00:00.000Z") },
    });
    await db.transaction.create({
      data: { accountId: savings.id, amount: 2_000, type: "TRANSFER_IN", category: "TRANSFER", description: "Transfer from checking", status: "COMPLETED", reference: "trf_pair1", balanceAfter: 2_000, createdAt: new Date("2026-10-03T12:01:00.000Z") },
    });
    await db.transaction.create({
      data: { accountId: checking.id, amount: 10_000, type: "DEPOSIT", category: "TRANSFER", description: "Prior deposit", status: "COMPLETED", balanceAfter: 10_000, createdAt: new Date("2026-10-02T12:00:00.000Z") },
    });
    await auth.setSessionCookie(admin.id);

    const deleted = await run(() => adminActions.adminDeleteActivityAction(form({ transactionId: out.id, accountId: checking.id, confirm: "yes" })));
    expect(deleted.redirectedTo).toContain("activity-deleted");
    expect(await db.transaction.count({ where: { reference: "trf_pair1" } })).toBe(0);
    expect((await db.account.findUnique({ where: { id: checking.id } }))?.balance).toBe(10_000);
    expect((await db.account.findUnique({ where: { id: savings.id } }))?.balance).toBe(0);
  });
});

describe("account lockout", () => {
  it("requires a written reason and blocks sign-in with that reason", async () => {
    const admin = await addUser("lock-admin@example.test", { role: "ADMIN" });
    const customer = await addUser("lock-customer@example.test", { passwordHash: "$2a$04$abcdefghijklmnopqrstuv" });
    await auth.setSessionCookie(admin.id);

    const missingReason = await run(() => adminActions.adminLockUserAction(form({ userId: customer.id, lockReason: "short", confirm: "yes" })));
    expect(missingReason.redirectedTo).toBe("/admin?notice=lock-reason");

    const unconfirmed = await run(() => adminActions.adminLockUserAction(form({ userId: customer.id, lockReason: "Suspicious ATM withdrawals overnight." })));
    expect(unconfirmed.redirectedTo).toBe("/admin?notice=lock-confirm");

    const locked = await run(() => adminActions.adminLockUserAction(form({
      userId: customer.id,
      lockReason: "Suspicious ATM withdrawals overnight.",
      confirm: "yes",
    })));
    expect(locked.redirectedTo).toBe("/admin?notice=locked");
    const stored = await db.user.findUnique({ where: { id: customer.id } });
    expect(stored).toMatchObject({ accessLocked: true, lockReason: "Suspicious ATM withdrawals overnight.", lockedById: admin.id });

    const bcrypt = await import("bcryptjs");
    const password = "lock-pass-99";
    await db.user.update({ where: { id: customer.id }, data: { passwordHash: await bcrypt.hash(password, 4) } });
    cookieJar.clear();
    const signIn = await run(() => actions.loginAction(null, form({ username: customer.email, password })));
    expect(signIn.value).toEqual({ error: "This account is locked. Suspicious ATM withdrawals overnight." });
    expect(await auth.getSessionUserId()).toBeNull();
  });

  it("cannot lock an administrator and can unlock a customer", async () => {
    const admin = await addUser("lock-admin-2@example.test", { role: "ADMIN" });
    const customer = await addUser("unlock-customer@example.test");
    await auth.setSessionCookie(admin.id);

    const self = await run(() => adminActions.adminLockUserAction(form({
      userId: admin.id,
      lockReason: "Trying to lock my own admin session.",
      confirm: "yes",
    })));
    expect(self.redirectedTo).toBe("/admin?notice=lock-self");
    expect((await db.user.findUnique({ where: { id: admin.id } }))?.accessLocked).toBe(false);

    await run(() => adminActions.adminLockUserAction(form({
      userId: customer.id,
      lockReason: "Reviewing a disputed card claim.",
      confirm: "yes",
    })));
    const unlocked = await run(() => adminActions.adminUnlockUserAction(form({ userId: customer.id })));
    expect(unlocked.redirectedTo).toBe("/admin?notice=unlocked");
    expect(await db.user.findUnique({ where: { id: customer.id } })).toMatchObject({ accessLocked: false, lockReason: null });
  });
});
