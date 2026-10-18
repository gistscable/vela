/**
 * Ongoing activity that continues the Jan 2023–Oct 2026 generated history.
 *
 * The closed history in `history.ts` stays a fixed, reconciled block ending
 * HISTORY_END. After that date the same cadence keeps posting — payroll every
 * other Friday, bills on the same days of the month, weekly spending, the
 * savings sweep — so an already-open account does not freeze in October 2026.
 *
 * Only users who already have the generated opening deposit are continued.
 * Real customer transactions (which carry a `reference`) are never deleted.
 */

import { HISTORY_END, OPENING_DESCRIPTION, type HistoryEvent } from "@/lib/history";
import { isCreditAccountType, isDepositAccountType, productByCode } from "@/lib/products";
import { generateProductHistory, openingDescriptionFor } from "@/lib/product-history";

function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (y: number, m: number, d: number, hour = 10, min = 0) => new Date(y, m, d, hour, min, 0, 0);

const EMPLOYERS = ["Northstar Labs Inc.", "Quantum Design Co.", "Harborview Health", "FMB Consulting LLC", "Brightline Technologies"];
const GROCERY = ["Whole Foods Market", "Trader Joe's", "Mariano's", "Jewel-Osco", "Aldi"];
const DINING = ["Sweetgreen", "Shake Shack", "Domino's Pizza", "Joe's Pizza", "Doordash", "Chipotle", "Pret A Manger", "Starbucks"];
const RETAIL = ["Amazon", "Target", "Apple Store", "Uniqlo", "Best Buy", "IKEA", "Costco"];
const TRANSPORT_MERCHANTS = ["Uber", "Lyft", "Shell", "CTA Ventra", "SpotHero", "BP"];
const HEALTH_MERCHANTS = ["Walgreens", "CVS Pharmacy", "Lakeshore Fitness", "Northwestern Medicine"];
const REFUNDS = ["Merchant refund", "Card cashback credit", "Expense reimbursement", "Deposit adjustment credit"];

const CHECKING_FLOOR_CENTS = 5_000_00; // skip discretionary spending below $5,000

function monthsOverlapping(fromExclusive: Date, toInclusive: Date): { y: number; m: number }[] {
  const start = new Date(fromExclusive.getFullYear(), fromExclusive.getMonth(), 1);
  const out: { y: number; m: number }[] = [];
  for (let y = start.getFullYear(), m = start.getMonth(); y < toInclusive.getFullYear() || (y === toInclusive.getFullYear() && m <= toInclusive.getMonth()); ) {
    out.push({ y, m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

function inWindow(date: Date, fromExclusive: Date, toInclusive: Date) {
  return date.getTime() > fromExclusive.getTime() && date.getTime() <= toInclusive.getTime();
}

function jitter(rand: () => number, base: number, spread = 0.12) {
  return Math.max(1, Math.round(base * (1 - spread + rand() * spread * 2)));
}

/** Pattern-matching activity after `fromExclusive` through `toInclusive` (inclusive). */
export function generateContinuingHistory(userKey: string, fromExclusive: Date, toInclusive: Date): HistoryEvent[] {
  if (toInclusive.getTime() <= fromExclusive.getTime()) return [];
  const rand = mulberry32(hashSeed(`vela-history-continue:${userKey.toLowerCase()}`));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const employer = pick(EMPLOYERS);
  const events: HistoryEvent[] = [];
  const push = (e: HistoryEvent) => {
    if (inWindow(e.date, fromExclusive, toInclusive)) events.push(e);
  };
  const months = monthsOverlapping(fromExclusive, toInclusive);

  for (let d = at(2023, 0, 13, 9); d <= toInclusive; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14, 9)) {
    push({
      account: "CHECKING",
      date: new Date(d),
      amount: jitter(rand, 345_000, 0.08),
      type: "DEPOSIT",
      category: "INCOME",
      description: `Payroll — ${employer.replace(/ Inc\.| LLC/, "")}`,
      counterparty: employer,
      paymentMethod: "ACH",
    });
  }

  for (const { y, m } of months) {
    if (m === 11) {
      push({
        account: "CHECKING",
        date: at(y, 11, 15, 9),
        amount: jitter(rand, 1_600_000, 0.15),
        type: "DEPOSIT",
        category: "INCOME",
        description: "Annual bonus",
        counterparty: employer,
        paymentMethod: "ACH",
      });
    }
    if (m % 3 === 1) {
      push({
        account: "CHECKING",
        date: at(y, m, 17, 11),
        amount: jitter(rand, 80_000, 0.25),
        type: "DEPOSIT",
        category: "INCOME",
        description: "External deposit — consulting income",
        counterparty: "External bank ••1234",
        paymentMethod: "ACH",
      });
    }
    if (m === 3) {
      push({
        account: "CHECKING",
        date: at(y, 3, 18, 9),
        amount: jitter(rand, 300_000, 0.2),
        type: "DEPOSIT",
        category: "INCOME",
        description: "Tax refund — U.S. Treasury",
        counterparty: "U.S. Department of the Treasury",
        paymentMethod: "ACH",
      });
    }
    push({
      account: "CHECKING",
      date: at(y, m, 14, 14),
      amount: jitter(rand, 18_000, 0.4),
      type: "DEPOSIT",
      category: "OTHER",
      description: pick(REFUNDS),
      counterparty: "FMB",
      paymentMethod: "ACH",
    });

    const interestDate = at(y, m + 1, 0, 6);
    push({
      account: "SAVINGS",
      date: interestDate,
      amount: jitter(rand, 15_000, 0.2),
      type: "INTEREST",
      category: "INCOME",
      description: "Interest payment",
      counterparty: "FMB Savings",
      paymentMethod: "ACH",
    });

    const sweepDate = at(y, m, 28, 17);
    const sweep = jitter(rand, 214_000, 0.1);
    push({
      account: "CHECKING",
      date: sweepDate,
      amount: -sweep,
      type: "TRANSFER_OUT",
      category: "SAVINGS",
      description: "Monthly savings sweep",
      counterparty: "To High-Yield Savings",
      paymentMethod: "INTERNAL",
      internal: true,
    });
    push({
      account: "SAVINGS",
      date: new Date(sweepDate.getTime() + 60_000),
      amount: sweep,
      type: "TRANSFER_IN",
      category: "SAVINGS",
      description: "Monthly savings sweep",
      counterparty: "From Everyday Checking",
      paymentMethod: "INTERNAL",
      internal: true,
    });

    push({
      account: "CHECKING",
      date: at(y, m, 1, 8),
      amount: -jitter(rand, 199_000, 0.04),
      type: "PAYMENT",
      category: "HOUSING",
      description: "Mortgage — Lakeshore Properties",
      counterparty: "Lakeshore Properties LLC",
      paymentMethod: "BILL_PAY",
    });
  }

  const bills: { day: number; amount: number; seasonal?: (m: number) => number; make: () => Omit<HistoryEvent, "account" | "date" | "amount"> }[] = [
    { day: 5, amount: 2_900, make: () => ({ type: "PAYMENT", category: "HEALTH", description: "Lakeshore Fitness", counterparty: "Lakeshore Fitness", paymentMethod: "BILL_PAY" }) },
    { day: 8, amount: 1_799, make: () => ({ type: "PAYMENT", category: "ENTERTAINMENT", description: "Netflix", counterparty: "Netflix Inc.", paymentMethod: "BILL_PAY" }) },
    { day: 10, amount: 28_500, make: () => ({ type: "PAYMENT", category: "OTHER", description: "Home & auto insurance", counterparty: "Statewide Insurance", paymentMethod: "BILL_PAY" }) },
    { day: 12, amount: 1_199, make: () => ({ type: "PAYMENT", category: "ENTERTAINMENT", description: "Spotify", counterparty: "Spotify USA", paymentMethod: "BILL_PAY" }) },
    { day: 15, amount: 12_000, seasonal: (m) => [1.25, 1.1, 0.9, 0.8, 0.85, 1.15, 1.35, 1.3, 1.0, 0.85, 0.95, 1.2][m], make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "ComEd", counterparty: "ComEd", paymentMethod: "BILL_PAY" }) },
    { day: 18, amount: 10_000, seasonal: (m) => [1.6, 1.45, 1.15, 0.8, 0.55, 0.4, 0.35, 0.35, 0.5, 0.8, 1.2, 1.5][m], make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "People Gas", counterparty: "People Gas", paymentMethod: "BILL_PAY" }) },
    { day: 20, amount: 8_500, make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "Mobile phone — T-Mobile", counterparty: "T-Mobile", paymentMethod: "BILL_PAY" }) },
    { day: 22, amount: 6_500, make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "Xfinity Internet", counterparty: "Comcast", paymentMethod: "BILL_PAY" }) },
    { day: 25, amount: 8_000, make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "City Water & Sewer", counterparty: "City of Chicago Water", paymentMethod: "BILL_PAY" }) },
  ];
  for (const bill of bills) {
    for (const { y, m } of months) {
      const amount = Math.round(bill.amount * (bill.seasonal ? bill.seasonal(m) : 1) * (0.95 + rand() * 0.1));
      push({ account: "CHECKING", date: at(y, m, bill.day, 10), amount: -amount, ...bill.make() });
    }
  }

  const weekly = (startOffsetDays: number, stepDays: number, make: () => Omit<HistoryEvent, "account" | "date" | "amount">, base: number) => {
    for (let d = new Date(2023, 0, 3 + startOffsetDays, 13); d <= toInclusive; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + stepDays, 13)) {
      push({ account: "CHECKING", date: new Date(d), amount: -jitter(rand, base, 0.35), ...make() });
    }
  };
  weekly(2, 4, () => {
    const name = pick([...GROCERY, ...DINING]);
    const card = rand() > 0.5;
    return { type: card ? "CARD_PURCHASE" : "PAYMENT", category: "FOOD", description: name, counterparty: card ? "FMB debit card" : "ACH debit", paymentMethod: card ? undefined : "ACH" };
  }, 6_500);
  weekly(4, 6, () => {
    const name = pick(RETAIL);
    return { type: "CARD_PURCHASE", category: "SHOPPING", description: name, counterparty: "FMB debit card" };
  }, 8_500);
  weekly(1, 5, () => {
    const name = pick(TRANSPORT_MERCHANTS);
    const card = rand() > 0.4;
    return { type: card ? "CARD_PURCHASE" : "PAYMENT", category: "TRANSPORT", description: name, counterparty: card ? "FMB debit card" : "ACH debit", paymentMethod: card ? undefined : "ACH" };
  }, 3_200);

  for (const { y, m } of months) {
    push({
      account: "CHECKING",
      date: at(y, m, 19, 11),
      amount: -jitter(rand, 7_500, 0.3),
      type: "PAYMENT",
      category: "HEALTH",
      description: pick(HEALTH_MERCHANTS),
      counterparty: "ACH debit",
      paymentMethod: "ACH",
    });
    if (m % 3 === 2) {
      push({
        account: "CHECKING",
        date: at(y, m, 14, 15),
        amount: -jitter(rand, 180_000, 0.25),
        type: "CARD_PURCHASE",
        category: "ENTERTAINMENT",
        description: pick(["United Airlines", "Marriott Hotels", "Delta Air Lines", "Airbnb", "American Airlines"]),
        counterparty: "FMB debit card",
      });
    }
    if (m === 3 || m === 5 || m === 8 || m === 0) {
      push({
        account: "CHECKING",
        date: at(y, m, 15, 9),
        amount: -jitter(rand, 250_000, 0.2),
        type: "PAYMENT",
        category: "OTHER",
        description: m === 3 ? "Federal tax payment — IRS" : "Estimated tax payment",
        counterparty: "U.S. Department of the Treasury",
        paymentMethod: "ACH",
      });
    }
    push({
      account: "CHECKING",
      date: at(y, m, 16, 10),
      amount: -jitter(rand, 85_000, 0.15),
      type: "TRANSFER_OUT",
      category: "OTHER",
      description: "Brokerage transfer — external investment account",
      counterparty: "External brokerage ••7741",
      paymentMethod: "ACH",
    });
    if (m % 4 === 3) {
      push({
        account: "CHECKING",
        date: at(y, m, 9, 12),
        amount: -jitter(rand, 220_000, 0.2),
        type: "PAYMENT",
        category: "HOUSING",
        description: pick(["Home improvement payment", "Furniture & appliances", "Tuition payment", "Vehicle purchase payment", "Home repair contractor"]),
        counterparty: "ACH debit",
        paymentMethod: "ACH",
      });
    }
    push({
      account: "CHECKING",
      date: at(y, m, 26, 10),
      amount: -jitter(rand, 3_400, 0.3),
      type: "FEE",
      category: "OTHER",
      description: pick(["Wire service fee", "Account service charges", "ATM & card fees", "Miscellaneous account fee"]),
      counterparty: "FMB",
      paymentMethod: "ACH",
    });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}

type Db = any;

async function lastGeneratedAt(db: Db, accountId: string): Promise<Date | null> {
  const row = await db.transaction.findFirst({
    where: { accountId, status: "COMPLETED", reference: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

async function hasOpening(db: Db, accountId: string, description: string): Promise<boolean> {
  const row = await db.transaction.findFirst({
    where: { accountId, description, status: "COMPLETED" },
    select: { id: true },
  });
  return Boolean(row);
}

async function insertEvents(
  db: Db,
  account: { id: string; type: string; balance: number },
  events: Array<{ date: Date; amount: number; type: string; category: string; description: string; counterparty?: string; paymentMethod?: string }>,
) {
  if (events.length === 0) return 0;
  let balance = account.balance;
  const rows: any[] = [];
  for (const event of events) {
    const next = balance + event.amount;
    if (!isCreditAccountType(account.type) && event.amount < 0 && next < CHECKING_FLOOR_CENTS) continue;
    balance = next;
    rows.push({
      accountId: account.id,
      amount: event.amount,
      type: event.type,
      category: event.category,
      description: event.description,
      counterparty: event.counterparty ?? null,
      paymentMethod: event.paymentMethod ?? null,
      status: "COMPLETED",
      reference: null,
      balanceAfter: balance,
      createdAt: event.date,
    });
  }
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += 400) {
    await db.transaction.createMany({ data: rows.slice(i, i + 400) });
  }
  await db.account.update({ where: { id: account.id }, data: { balance } });
  return rows.length;
}

export type ContinueResult = {
  skipped: boolean;
  added: number;
  through: Date;
};

/**
 * Post any missing pattern activity from the last generated entry through `through`.
 * Safe to call on every dashboard load: no-ops when the user has no generated
 * history, and is idempotent when already caught up.
 */
export async function continueUserHistory(
  db: Db,
  userId: string,
  opts: { through?: Date } = {},
): Promise<ContinueResult> {
  const through = opts.through ?? new Date();
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, historyPaused: true } });
  if (!user) return { skipped: true, added: 0, through };
  if (user.historyPaused) return { skipped: true, added: 0, through };

  const accounts = await db.account.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (accounts.length === 0) return { skipped: true, added: 0, through };

  const primaryChecking = accounts.find((account: { type: string }) => account.type === "CHECKING") ?? null;
  const primarySavings = accounts.find((account: { type: string }) => account.type === "SAVINGS") ?? null;
  let added = 0;
  let hadHistory = false;

  if (primaryChecking && (await hasOpening(db, primaryChecking.id, OPENING_DESCRIPTION))) {
    hadHistory = true;
    const lastChecking = (await lastGeneratedAt(db, primaryChecking.id)) ?? HISTORY_END;
    const lastSavings = primarySavings ? ((await lastGeneratedAt(db, primarySavings.id)) ?? HISTORY_END) : HISTORY_END;
    const fromExclusive = new Date(Math.max(HISTORY_END.getTime(), lastChecking.getTime(), lastSavings.getTime()));
    const events = generateContinuingHistory(user.email, fromExclusive, through);
    const checkingEvents = events.filter((event) => event.account === "CHECKING");
    const savingsEvents = events.filter((event) => event.account === "SAVINGS");
    added += await insertEvents(db, primaryChecking, checkingEvents);
    if (primarySavings) added += await insertEvents(db, primarySavings, savingsEvents);
  }

  const extra = accounts.filter((account: { id: string; type: string }) => {
    if (!primaryChecking) return true;
    if (account.id === primaryChecking.id) return false;
    if (primarySavings && account.id === primarySavings.id) return false;
    return isDepositAccountType(account.type) || isCreditAccountType(account.type);
  });

  for (const account of extra) {
    const productCode = productCodeForAccountType(account.type, account.name);
    const opening = openingDescriptionFor(productCode);
    const optedIn = (await hasOpening(db, account.id, opening)) || (isCreditAccountType(account.type) && Boolean(await lastGeneratedAt(db, account.id)));
    if (!optedIn) continue;
    hadHistory = true;
    const last = (await lastGeneratedAt(db, account.id)) ?? new Date(0);
    const events = generateProductHistory(user.email, productCode, { through }).filter((event) => event.date.getTime() > last.getTime() && event.date.getTime() <= through.getTime());
    added += await insertEvents(db, account, events);
  }

  return { skipped: !hadHistory, added, through };
}

function productCodeForAccountType(type: string, name: string): string {
  if (type === "BUSINESS_CHECKING") return "BUSINESS_CHECKING";
  if (type === "BUSINESS_SAVINGS") return "BUSINESS_SAVINGS";
  if (type === "MONEY_MARKET") return "MONEY_MARKET";
  if (type === "CD") return "CD_12";
  if (type === "CREDIT") {
    const travel = productByCode("CREDIT_TRAVEL");
    if (travel && name.includes(travel.shortName)) return "CREDIT_TRAVEL";
    return "CREDIT_CASH_REWARDS";
  }
  if (type === "SAVINGS") return "HIGH_YIELD_SAVINGS";
  return "EVERYDAY_CHECKING";
}
