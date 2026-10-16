import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar, run } from "./helpers/next-mocks";
import { useDisposableDatabase } from "./helpers/test-db";

let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;
let adminActions: typeof import("@/lib/admin-actions");
let auth: typeof import("@/lib/auth");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

async function addUser(email: string, extra: Record<string, unknown> = {}) {
  return db.user.create({
    data: {
      email,
      passwordHash: "test-hash",
      firstName: "Test",
      lastName: "User",
      ...extra,
    },
  });
}

async function addAccount(userId: string, type: "CHECKING" | "SAVINGS", accountNumber: string, extra: Record<string, unknown> = {}) {
  return db.account.create({
    data: {
      userId,
      type,
      name: type === "CHECKING" ? "Everyday Checking" : "High-Yield Savings",
      accountNumber,
      routingNumber: "021000021",
      balance: 0,
      ...extra,
    },
  });
}

beforeEach(async () => {
  cookieJar.clear();
  testDb = useDisposableDatabase();
  ({ db } = await import("@/lib/db"));
  adminActions = await import("@/lib/admin-actions");
  auth = await import("@/lib/auth");
});

afterEach(() => {
  testDb.cleanup();
  vi.resetModules();
});

describe("admin enrollment history decisions", () => {
  it("requires an explicit history choice and can approve without generated activity", async () => {
    const admin = await addUser("admin@example.test", { role: "ADMIN" });
    const applicant = await addUser("new-customer@example.test", { enrollmentStatus: "PENDING_APPROVAL" });
    const checking = await addAccount(applicant.id, "CHECKING", "100000000001");
    await auth.setSessionCookie(admin.id);

    const missingChoice = await run(() => adminActions.reviewEnrollmentAction(form({ userId: applicant.id, decision: "approve" })));
    expect(missingChoice.redirectedTo).toBe("/admin?notice=enrollment-history-choice");
    expect((await db.user.findUnique({ where: { id: applicant.id } }))?.enrollmentStatus).toBe("PENDING_APPROVAL");

    const approved = await run(() => adminActions.reviewEnrollmentAction(form({
      userId: applicant.id,
      decision: "approve",
      historyChoice: "none",
    })));
    expect(approved.redirectedTo).toBe("/admin?notice=enrollment-approved");
    expect(await db.user.findUnique({ where: { id: applicant.id } })).toMatchObject({
      enrollmentStatus: "APPROVED",
      enrollmentReviewedById: admin.id,
    });
    expect(await db.transaction.count({ where: { accountId: checking.id } })).toBe(0);
    expect((await db.account.findUnique({ where: { id: checking.id } }))?.balance).toBe(0);
  });

  it("provisions the 2023–2026 sample history only when the admin opts in", async () => {
    const admin = await addUser("admin-history@example.test", { role: "ADMIN" });
    const applicant = await addUser("history-customer@example.test", { enrollmentStatus: "PENDING_APPROVAL" });
    const checking = await addAccount(applicant.id, "CHECKING", "100000000002");
    const savings = await addAccount(applicant.id, "SAVINGS", "100000000003");
    await auth.setSessionCookie(admin.id);

    const result = await run(() => adminActions.reviewEnrollmentAction(form({
      userId: applicant.id,
      decision: "approve",
      historyChoice: "include",
    })));
    expect(result.redirectedTo).toBe("/admin?notice=enrollment-approved-history");

    const { generateUserHistory } = await import("@/lib/history");
    const { summary } = generateUserHistory(applicant.email);
    const updatedChecking = await db.account.findUnique({ where: { id: checking.id } });
    const updatedSavings = await db.account.findUnique({ where: { id: savings.id } });
    const firstEntry = await db.transaction.findFirst({
      where: { accountId: checking.id },
      orderBy: { createdAt: "asc" },
    });
    expect(updatedChecking?.balance).toBe(summary.checkingEnding);
    expect(updatedSavings?.balance).toBe(summary.savingsEnding);
    expect(await db.transaction.count({ where: { accountId: { in: [checking.id, savings.id] } } })).toBe(summary.transactionCount);
    expect(firstEntry?.createdAt.toISOString()).toBe("2023-01-03T09:00:00.000Z");
  });
});

describe("admin customer payments", () => {
  it("records a named, backdated single payment and sends one payment per approved customer in a batch", async () => {
    const admin = await addUser("payments-admin@example.test", { role: "ADMIN" });
    const firstCustomer = await addUser("first-customer@example.test");
    const secondCustomer = await addUser("second-customer@example.test");
    const pendingCustomer = await addUser("pending-customer@example.test", { enrollmentStatus: "PENDING_APPROVAL" });
    const firstChecking = await addAccount(firstCustomer.id, "CHECKING", "200000000001");
    const firstSavings = await addAccount(firstCustomer.id, "SAVINGS", "200000000002");
    const secondChecking = await addAccount(secondCustomer.id, "CHECKING", "200000000003");
    await addAccount(pendingCustomer.id, "CHECKING", "200000000004");
    await addAccount(admin.id, "CHECKING", "200000000005");
    await auth.setSessionCookie(admin.id);

    const single = await run(() => adminActions.adminCreditAction(form({
      recipient: firstChecking.id,
      paymentMethod: "WIRE",
      senderName: "Jordan Lee",
      sourceName: "Lakeview Credit Union",
      sourceLast4: "3141",
      amount: "125.00",
      activityDate: "2024-04-05",
      confirm: "yes",
    })));
    expect(single.redirectedTo).toBe("/admin?notice=credit-submitted");
    const singlePayment = await db.transaction.findFirst({
      where: { accountId: firstChecking.id, description: "Jordan Lee" },
    });
    expect(singlePayment).toMatchObject({
      amount: 12_500,
      type: "DEPOSIT",
      status: "PENDING_APPROVAL",
      paymentMethod: "WIRE",
      counterparty: "Lakeview Credit Union · •••• 3141",
    });
    expect(singlePayment?.createdAt.toISOString()).toBe("2024-04-05T12:00:00.000Z");
    expect((await db.account.findUnique({ where: { id: firstChecking.id } }))?.balance).toBe(0);

    const batch = await run(() => adminActions.adminCreditAction(form({
      recipient: "ALL_CUSTOMERS",
      paymentMethod: "ACH",
      senderName: "Acme Community Foundation",
      sourceName: "",
      sourceLast4: "",
      amount: "50.00",
      activityDate: "2024-04-06",
      confirm: "yes",
    })));
    expect(batch.redirectedTo).toBe("/admin?notice=credit-submitted");

    const batchRows = await db.transaction.findMany({
      where: { description: "Acme Community Foundation" },
    });
    expect(batchRows).toHaveLength(2);
    expect(new Set(batchRows.map((row) => row.accountId))).toEqual(new Set([firstChecking.id, secondChecking.id]));
    expect(batchRows.every((row) => row.amount === 5_000 && row.status === "PENDING_APPROVAL" && row.counterparty === null)).toBe(true);
    expect(batchRows.every((row) => row.createdAt.toISOString() === "2024-04-06T12:00:00.000Z")).toBe(true);
    expect(new Set(batchRows.map((row) => row.reference)).size).toBe(1);
    expect((await db.account.findUnique({ where: { id: firstSavings.id } }))?.balance).toBe(0);
    expect((await db.account.findUnique({ where: { id: firstChecking.id } }))?.balance).toBe(0);

    const reference = batchRows[0].reference!;
    const approved = await run(() => adminActions.approveTransactionGroupAction(form({ groupKey: `ref:${reference}` })));
    expect(approved.redirectedTo).toBe("/admin?notice=approved");
    expect((await db.transaction.findMany({ where: { reference } })).every((row) => row.status === "COMPLETED")).toBe(true);
    expect((await db.account.findUnique({ where: { id: firstChecking.id } }))?.balance).toBe(5_000);
    expect((await db.account.findUnique({ where: { id: secondChecking.id } }))?.balance).toBe(5_000);
  });

  it("rejects invalid calendar dates and an unconfirmed payment", async () => {
    const admin = await addUser("payments-validation-admin@example.test", { role: "ADMIN" });
    const customer = await addUser("payment-recipient@example.test");
    const checking = await addAccount(customer.id, "CHECKING", "300000000001");
    await auth.setSessionCookie(admin.id);

    const invalidDate = await run(() => adminActions.adminCreditAction(form({
      recipient: checking.id,
      paymentMethod: "ACH",
      senderName: "Example Sender",
      sourceName: "",
      sourceLast4: "",
      amount: "10.00",
      activityDate: "2024-02-30",
      confirm: "yes",
    })));
    expect(invalidDate.redirectedTo).toBe("/admin?notice=credit-error");

    const unconfirmed = await run(() => adminActions.adminCreditAction(form({
      recipient: checking.id,
      paymentMethod: "ACH",
      senderName: "Example Sender",
      sourceName: "",
      sourceLast4: "",
      amount: "10.00",
      activityDate: "2024-02-29",
    })));
    expect(unconfirmed.redirectedTo).toBe("/admin?notice=credit-confirm");
    expect(await db.transaction.count({ where: { accountId: checking.id } })).toBe(0);
  });
});
