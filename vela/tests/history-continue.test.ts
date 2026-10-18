import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { HISTORY_END, OPENING_DESCRIPTION } from "@/lib/history";
import { generateContinuingHistory } from "@/lib/history-continue";
import { generateProductHistory, openingDescriptionFor } from "@/lib/product-history";
import { cookieJar } from "./helpers/next-mocks";
import { useDisposableDatabase } from "./helpers/test-db";

describe("generateContinuingHistory", () => {
  it("posts the same bill cadence after the closed Oct 2026 history block", () => {
    const through = new Date(2026, 9, 25, 23, 0, 0);
    const events = generateContinuingHistory("continuity@example.test", HISTORY_END, through);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.date.getTime() > HISTORY_END.getTime())).toBe(true);
    expect(events.every((event) => event.date.getTime() <= through.getTime())).toBe(true);
    expect(events.some((event) => event.description === "People Gas")).toBe(true);
    expect(events.some((event) => event.description === "Xfinity Internet")).toBe(true);
    expect(events.some((event) => event.description === "City Water & Sewer")).toBe(true);
    expect(events.some((event) => event.amount > 0)).toBe(true);
    expect(events.some((event) => event.amount < 0)).toBe(true);
  });

  it("is empty when the window has already been covered", () => {
    expect(generateContinuingHistory("continuity@example.test", HISTORY_END, HISTORY_END)).toEqual([]);
  });
});

describe("generateProductHistory", () => {
  it("builds a 2023-forward business checking ledger that never overdraws", () => {
    const events = generateProductHistory("biz@example.test", "BUSINESS_CHECKING", { through: new Date(2026, 9, 18) });
    expect(events[0]?.description).toBe(openingDescriptionFor("BUSINESS_CHECKING"));
    expect(events[0]?.opening).toBe(true);
    let balance = 0;
    let min = Infinity;
    for (const event of events) {
      balance += event.amount;
      min = Math.min(min, balance);
    }
    expect(min).toBeGreaterThan(0);
    expect(balance).toBeGreaterThan(0);
    expect(events.some((event) => event.description.startsWith("Client payment"))).toBe(true);
  });
});

let testDb: ReturnType<typeof useDisposableDatabase>;
let db: typeof import("@/lib/db").db;

beforeEach(async () => {
  cookieJar.clear();
  testDb = useDisposableDatabase();
  ({ db } = await import("@/lib/db"));
});

afterEach(() => {
  testDb.cleanup();
  vi.resetModules();
});

describe("continueUserHistory", () => {
  it("adds pattern activity after HISTORY_END and is idempotent", async () => {
    const { continueUserHistory } = await import("@/lib/history-continue");
    const user = await db.user.create({
      data: { email: "live-ledger@example.test", passwordHash: "x", firstName: "Live", lastName: "Ledger" },
    });
    const checking = await db.account.create({
      data: { userId: user.id, type: "CHECKING", name: "Everyday Checking", accountNumber: "400000000001", routingNumber: "021000021", balance: 95_000_000 },
    });
    const savings = await db.account.create({
      data: { userId: user.id, type: "SAVINGS", name: "High-Yield Savings", accountNumber: "400000000002", routingNumber: "021000021", balance: 10_000_000, apy: 4.25 },
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

    const through = new Date(2026, 9, 25, 18, 0, 0);
    const first = await continueUserHistory(db, user.id, { through });
    expect(first.skipped).toBe(false);
    expect(first.added).toBeGreaterThan(0);
    const countAfterFirst = await db.transaction.count({ where: { accountId: { in: [checking.id, savings.id] } } });
    const later = await db.transaction.findMany({
      where: { accountId: { in: [checking.id, savings.id] }, createdAt: { gt: HISTORY_END } },
    });
    expect(later.length).toBe(first.added);
    expect(later.some((row) => row.amount < 0)).toBe(true);

    const second = await continueUserHistory(db, user.id, { through });
    expect(second.added).toBe(0);
    expect(await db.transaction.count({ where: { accountId: { in: [checking.id, savings.id] } } })).toBe(countAfterFirst);
  });

  it("does not invent history for accounts that never received generated activity", async () => {
    const { continueUserHistory } = await import("@/lib/history-continue");
    const user = await db.user.create({
      data: { email: "blank@example.test", passwordHash: "x", firstName: "Blank", lastName: "Book" },
    });
    await db.account.create({
      data: { userId: user.id, type: "CHECKING", name: "Everyday Checking", accountNumber: "400000000003", routingNumber: "021000021", balance: 0 },
    });
    const result = await continueUserHistory(db, user.id, { through: new Date(2026, 9, 25) });
    expect(result.skipped).toBe(true);
    expect(result.added).toBe(0);
    expect(await db.transaction.count()).toBe(0);
  });
});
