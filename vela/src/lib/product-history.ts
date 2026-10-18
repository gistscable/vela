/**
 * Generated activity for additional products (business accounts, extra
 * savings, credit cards, CDs). Separate from the reconciled personal
 * checking/savings history so those exact totals stay intact.
 */

import { HISTORY_START, type HistoryEvent } from "@/lib/history";
import { productByCode } from "@/lib/products";

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

function jitter(rand: () => number, base: number, spread = 0.15) {
  return Math.max(1, Math.round(base * (1 - spread + rand() * spread * 2)));
}

function monthsThrough(through: Date): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  for (let y = 2023; y <= through.getFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      const start = at(y, m, 1, 0);
      if (start > through) return out;
      out.push({ y, m });
    }
  }
  return out;
}

export function openingDescriptionFor(productCode: string): string {
  const product = productByCode(productCode);
  return product ? `Opening deposit — ${product.name}` : "Opening deposit — additional account";
}

const CLIENTS = ["Harbor Logistics LLC", "North Shore Clinics", "Lakeside Bakery", "Prairie Software", "Cinder & Co."];
const VENDORS = ["Office Depot", "Staples", "UPS Store", "QuickBooks Payroll", "Gusto", "AWS", "Square"];
const CARD_SPEND = ["United Airlines", "Starbucks", "Amazon Business", "Shell", "Hilton Hotels", "Office Depot", "Uber"];

export function generateProductHistory(
  userKey: string,
  productCode: string,
  opts: { through?: Date } = {},
): HistoryEvent[] {
  const through = opts.through ?? new Date();
  const product = productByCode(productCode);
  if (!product) return [];
  const rand = mulberry32(hashSeed(`vela-product-history:${productCode}:${userKey.toLowerCase()}`));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const events: HistoryEvent[] = [];
  const push = (e: Omit<HistoryEvent, "account">) => {
    if (e.date.getTime() > through.getTime()) return;
    if (!e.opening && e.date.getTime() < HISTORY_START.getTime()) return;
    events.push({ account: "CHECKING", ...e });
  };

  const opening = openingDescriptionFor(productCode);
  const openingAmount =
    productCode === "BUSINESS_CHECKING" ? 7_500_000 :
      productCode === "BUSINESS_SAVINGS" ? 1_500_000 :
        productCode === "MONEY_MARKET" ? 2_500_000 :
          productCode === "CD_12" ? 1_000_000 :
            productCode === "HIGH_YIELD_SAVINGS" ? 250_000 :
              productCode === "CREDIT_CASH_REWARDS" || productCode === "CREDIT_TRAVEL" ? 0 :
                500_000;

  if (openingAmount > 0) {
    push({
      date: new Date(HISTORY_START),
      amount: openingAmount,
      type: "DEPOSIT",
      category: "TRANSFER",
      description: opening,
      counterparty: "External bank ••1234",
      paymentMethod: "ACH",
      opening: true,
    });
  }

  const months = monthsThrough(through);

  if (productCode === "BUSINESS_CHECKING") {
    for (const { y, m } of months) {
      push({
        date: at(y, m, 4, 9),
        amount: jitter(rand, 1_150_000, 0.2),
        type: "DEPOSIT",
        category: "INCOME",
        description: `Client payment — ${pick(CLIENTS)}`,
        counterparty: pick(CLIENTS),
        paymentMethod: "ACH",
      });
      push({
        date: at(y, m, 18, 9),
        amount: jitter(rand, 880_000, 0.2),
        type: "DEPOSIT",
        category: "INCOME",
        description: `Client payment — ${pick(CLIENTS)}`,
        counterparty: pick(CLIENTS),
        paymentMethod: "ACH",
      });
      push({
        date: at(y, m, 1, 8),
        amount: -jitter(rand, 320_000, 0.05),
        type: "PAYMENT",
        category: "HOUSING",
        description: "Commercial rent — River North Plaza",
        counterparty: "River North Plaza LLC",
        paymentMethod: "BILL_PAY",
      });
      push({
        date: at(y, m, 15, 10),
        amount: -jitter(rand, 640_000, 0.08),
        type: "PAYMENT",
        category: "OTHER",
        description: "Payroll — Gusto",
        counterparty: "Gusto",
        paymentMethod: "ACH",
      });
      push({
        date: at(y, m, 12, 13),
        amount: -jitter(rand, 45_000, 0.3),
        type: "CARD_PURCHASE",
        category: "SHOPPING",
        description: pick(VENDORS),
        counterparty: "FMB debit card",
      });
      push({
        date: at(y, m, 22, 11),
        amount: -jitter(rand, 28_000, 0.25),
        type: "PAYMENT",
        category: "UTILITIES",
        description: pick(["ComEd", "Xfinity Business", "AT&T Business"]),
        counterparty: "ACH debit",
        paymentMethod: "ACH",
      });
    }
  } else if (productCode === "BUSINESS_SAVINGS" || productCode === "HIGH_YIELD_SAVINGS" || productCode === "MONEY_MARKET") {
    for (const { y, m } of months) {
      if (m % 2 === 0 && productCode !== "HIGH_YIELD_SAVINGS") {
        push({
          date: at(y, m, 28, 16),
          amount: jitter(rand, 80_000, 0.2),
          type: "TRANSFER_IN",
          category: "SAVINGS",
          description: "Reserve transfer",
          counterparty: "From operating account",
          paymentMethod: "INTERNAL",
          internal: true,
        });
      }
      const interestDate = at(y, m + 1, 0, 6);
      push({
        date: interestDate,
        amount: jitter(rand, productCode === "MONEY_MARKET" ? 8_000 : 4_500, 0.15),
        type: "INTEREST",
        category: "INCOME",
        description: "Interest payment",
        counterparty: "FMB",
        paymentMethod: "ACH",
      });
    }
  } else if (productCode === "CD_12") {
    for (const { y, m } of months) {
      const interestDate = at(y, m + 1, 0, 6);
      push({
        date: interestDate,
        amount: jitter(rand, 3_300, 0.05),
        type: "INTEREST",
        category: "INCOME",
        description: "CD interest payment",
        counterparty: "FMB",
        paymentMethod: "ACH",
      });
    }
  } else if (productCode === "EVERYDAY_CHECKING") {
    for (const { y, m } of months) {
      push({
        date: at(y, m, 7, 9),
        amount: jitter(rand, 180_000, 0.15),
        type: "DEPOSIT",
        category: "INCOME",
        description: "External deposit",
        counterparty: "External bank ••1234",
        paymentMethod: "ACH",
      });
      push({
        date: at(y, m, 11, 13),
        amount: -jitter(rand, 22_000, 0.3),
        type: "CARD_PURCHASE",
        category: "FOOD",
        description: pick(["Whole Foods Market", "Chipotle", "Starbucks"]),
        counterparty: "FMB debit card",
      });
      push({
        date: at(y, m, 21, 14),
        amount: -jitter(rand, 35_000, 0.3),
        type: "CARD_PURCHASE",
        category: "SHOPPING",
        description: pick(["Amazon", "Target", "Apple Store"]),
        counterparty: "FMB debit card",
      });
    }
  } else if (product.kind === "CREDIT_CARD") {
    for (const { y, m } of months) {
      const spend = jitter(rand, 42_000, 0.35);
      push({
        date: at(y, m, 8, 15),
        amount: -spend,
        type: "CARD_PURCHASE",
        category: "SHOPPING",
        description: pick(CARD_SPEND),
        counterparty: "FMB credit card",
      });
      const extra = jitter(rand, 18_000, 0.4);
      push({
        date: at(y, m, 19, 16),
        amount: -extra,
        type: "CARD_PURCHASE",
        category: "FOOD",
        description: pick(["Sweetgreen", "Shake Shack", "Starbucks"]),
        counterparty: "FMB credit card",
      });
      const payment = Math.round((spend + extra) * (0.72 + rand() * 0.2));
      push({
        date: at(y, m, 27, 9),
        amount: payment,
        type: "PAYMENT",
        category: "TRANSFER",
        description: "Automatic payment from Everyday Checking",
        counterparty: "Everyday Checking",
        paymentMethod: "INTERNAL",
      });
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events.filter((event) => event.date.getTime() <= through.getTime());
}

type Db = any;

export async function applyProductHistory(
  db: Db,
  user: { id: string; email: string },
  account: { id: string; type: string },
  productCode: string,
  opts: { through?: Date } = {},
): Promise<{ transactionCount: number; endingBalance: number }> {
  const existing = await db.transaction.findFirst({
    where: { accountId: account.id, status: "COMPLETED" },
    select: { id: true },
  });
  if (existing) {
    const current = await db.account.findUnique({ where: { id: account.id } });
    return { transactionCount: 0, endingBalance: current?.balance ?? 0 };
  }

  const through = opts.through ?? new Date();
  const events = generateProductHistory(user.email, productCode, { through });
  let balance = 0;
  const rows = events.map((event) => {
    balance += event.amount;
    return {
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
    };
  });

  await db.$transaction(async (tx: Db) => {
    await tx.account.update({ where: { id: account.id }, data: { createdAt: HISTORY_START, balance: 0 } });
    for (let i = 0; i < rows.length; i += 400) {
      await tx.transaction.createMany({ data: rows.slice(i, i + 400) });
    }
    await tx.account.update({ where: { id: account.id }, data: { balance } });
  });

  return { transactionCount: rows.length, endingBalance: balance };
}
