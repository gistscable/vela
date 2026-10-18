import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieJar, run } from "./helpers/next-mocks";
import { useDisposableDatabase } from "./helpers/test-db";
import { openingDescriptionFor } from "@/lib/product-history";

let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;
let actions: typeof import("@/lib/actions");
let adminActions: typeof import("@/lib/admin-actions");
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

async function addAccount(userId: string, type: string, accountNumber: string, extra: Record<string, unknown> = {}) {
  return db.account.create({
    data: {
      userId,
      type,
      name: type === "SAVINGS" ? "High-Yield Savings" : "Everyday Checking",
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
  actions = await import("@/lib/actions");
  adminActions = await import("@/lib/admin-actions");
  auth = await import("@/lib/auth");
});

afterEach(() => {
  testDb.cleanup();
  vi.resetModules();
});

describe("product applications", () => {
  it("lets a customer apply for business checking and issues it at $0 without history", async () => {
    const admin = await addUser("admin-products@example.test", { role: "ADMIN" });
    const customer = await addUser("biz-owner@example.test");
    await addAccount(customer.id, "CHECKING", "500000000001");
    await auth.setSessionCookie(customer.id);

    const applied = await actions.applyProductAction(null, form({ productCode: "BUSINESS_CHECKING", nickname: "Jenn & Co." }));
    expect(applied).toMatchObject({ success: true });
    const application = await db.productApplication.findFirst({ where: { userId: customer.id } });
    expect(application).toMatchObject({ productCode: "BUSINESS_CHECKING", status: "PENDING_APPROVAL", nickname: "Jenn & Co." });

    await auth.setSessionCookie(admin.id);
    const missing = await run(() => adminActions.reviewProductApplicationAction(form({
      applicationId: application!.id,
      decision: "approve",
    })));
    expect(missing.redirectedTo).toBe("/admin?notice=product-history-choice");

    const approved = await run(() => adminActions.reviewProductApplicationAction(form({
      applicationId: application!.id,
      decision: "approve",
      historyChoice: "none",
    })));
    expect(approved.redirectedTo).toBe("/admin?notice=product-approved");
    const business = await db.account.findFirst({ where: { userId: customer.id, type: "BUSINESS_CHECKING" } });
    expect(business).toMatchObject({ name: "Jenn & Co.", balance: 0, status: "ACTIVE" });
    expect(await db.transaction.count({ where: { accountId: business!.id } })).toBe(0);
  });

  it("issues a debit card onto checking after approval and lists it for the customer", async () => {
    const admin = await addUser("admin-cards@example.test", { role: "ADMIN" });
    const customer = await addUser("card-holder@example.test");
    const checking = await addAccount(customer.id, "CHECKING", "500000000002");
    await auth.setSessionCookie(customer.id);

    const applied = await actions.applyProductAction(null, form({ productCode: "DEBIT_VISA", linkedAccountId: checking.id }));
    expect(applied).toMatchObject({ success: true });
    const duplicate = await actions.applyProductAction(null, form({ productCode: "DEBIT_VISA", linkedAccountId: checking.id }));
    expect(duplicate).toMatchObject({ error: expect.stringMatching(/already have an application/i) });

    const application = await db.productApplication.findFirst({ where: { userId: customer.id, productCode: "DEBIT_VISA" } });
    await auth.setSessionCookie(admin.id);
    const approved = await run(() => adminActions.reviewProductApplicationAction(form({
      applicationId: application!.id,
      decision: "approve",
    })));
    expect(approved.redirectedTo).toBe("/admin?notice=product-approved");
    const card = await db.card.findFirst({ where: { accountId: checking.id } });
    expect(card).toMatchObject({ kind: "DEBIT", status: "ACTIVE", brand: "Visa" });
    expect(card?.last4).toHaveLength(4);
  });

  it("opens a credit card with generated history and accepts an admin credit onto it", async () => {
    const admin = await addUser("admin-credit-card@example.test", { role: "ADMIN" });
    const customer = await addUser("rewards@example.test");
    await addAccount(customer.id, "CHECKING", "500000000003");
    await auth.setSessionCookie(customer.id);

    const applied = await actions.applyProductAction(null, form({ productCode: "CREDIT_CASH_REWARDS" }));
    expect(applied).toMatchObject({ success: true });
    const application = await db.productApplication.findFirst({ where: { userId: customer.id, productCode: "CREDIT_CASH_REWARDS" } });
    await auth.setSessionCookie(admin.id);
    const approved = await run(() => adminActions.reviewProductApplicationAction(form({
      applicationId: application!.id,
      decision: "approve",
      historyChoice: "include",
    })));
    expect(approved.redirectedTo).toBe("/admin?notice=product-approved-history");

    const cardAccount = await db.account.findFirst({ where: { userId: customer.id, type: "CREDIT" } });
    expect(cardAccount).toBeTruthy();
    expect(await db.transaction.count({ where: { accountId: cardAccount!.id } })).toBeGreaterThan(0);
    expect(await db.transaction.findFirst({ where: { accountId: cardAccount!.id, description: openingDescriptionFor("CREDIT_CASH_REWARDS") } })).toBeNull();
    const card = await db.card.findFirst({ where: { accountId: cardAccount!.id } });
    expect(card).toMatchObject({ kind: "CREDIT", creditLimit: 1_000_000 });

    const credited = await run(() => adminActions.adminCreditAction(form({
      recipient: cardAccount!.id,
      paymentMethod: "ACH",
      senderName: "Card Services Adjustment",
      sourceName: "",
      sourceLast4: "",
      amount: "50.00",
      activityDate: "2026-10-18",
      confirm: "yes",
    })));
    expect(credited.redirectedTo).toBe("/admin?notice=credit-submitted");
    const payment = await db.transaction.findFirst({ where: { accountId: cardAccount!.id, description: "Card Services Adjustment" } });
    expect(payment).toMatchObject({ amount: 5_000, status: "PENDING_APPROVAL", paymentMethod: "ACH" });
  });
});
