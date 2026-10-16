/**
 * Long-history generator (Jan 3, 2023 -> Oct 15, 2026).
 *
 * Every user gets the SAME reconciled totals, applied separately per user:
 *   $950,000.00 opening deposit
 * + $450,000.00 later external credits
 * - $1,054,717.25 external debits
 * = $345,282.75 ending total  ($245,282.75 checking + $100,000.00 savings)
 *
 * Internal checking <-> savings transfers net to zero and are NOT counted in
 * the external credit/debit totals. Individual amounts/dates vary per user
 * (seeded by a stable user key) but category and grand totals are exact.
 *
 * Recurring bills always post on the same day of the month:
 * mortgage 1st, gym 5th, Netflix 8th, insurance 10th, Spotify 12th,
 * ComEd 15th, People Gas 18th, phone 20th, Xfinity 22nd, water 25th,
 * savings sweep 28th, savings interest on the last day of the month.
 */

export const HISTORY_START = new Date(2023, 0, 3, 9, 0, 0, 0);
export const HISTORY_END = new Date(2026, 9, 15, 12, 0, 0, 0);

export const OPENING_DEPOSIT_CENTS = 95_000_000; // $950,000.00
export const LATER_CREDITS_CENTS = 45_000_000; //   $450,000.00
export const EXTERNAL_DEBITS_CENTS = 105_471_725; // $1,054,717.25
export const ENDING_TOTAL_CENTS = 34_528_275; //    $345,282.75
export const CHECKING_ENDING_CENTS = 24_528_275; // $245,282.75
export const SAVINGS_ENDING_CENTS = 10_000_000; //  $100,000.00
export const SAVINGS_TRANSFERS_CENTS = 9_640_000; // $96,400.00 internal
export const SAVINGS_INTEREST_CENTS = 360_000; //   $3,600.00 (part of credits)

export const OPENING_DESCRIPTION = "Opening deposit — initial account funding";

export type HistoryEvent = {
  account: "CHECKING" | "SAVINGS";
  date: Date;
  amount: number; // cents, signed
  type: string;
  category: string;
  description: string;
  counterparty?: string;
  paymentMethod?: string;
  internal?: boolean;
  opening?: boolean;
};

export type HistorySummary = {
  openingCredits: number;
  laterCredits: number;
  externalDebits: number;
  internalNet: number;
  checkingEnding: number;
  savingsEnding: number;
  endingTotal: number;
  transactionCount: number;
  firstDate: Date;
  lastDate: Date;
  minCheckingBalance: number;
  minSavingsBalance: number;
};

/* ------------------------- deterministic randomness ------------------------ */

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

/** Split `total` cents across weights exactly (largest-remainder method). */
function distribute(total: number, weights: number[], minEach = 0): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const rest = total - minEach * n;
  if (rest < 0) throw new Error("distribute: total below minimum");
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (rest * w) / sumW);
  const out = raw.map((v) => Math.floor(v) + minEach);
  let remainder = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remainder > 0; k = (k + 1) % n) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}

const at = (y: number, m: number, d: number, hour = 10, min = 0) =>
  new Date(y, m, d, hour, min, 0, 0);

/* -------------------------------- generator -------------------------------- */

const EMPLOYERS = [
  "Northstar Labs Inc.",
  "Quantum Design Co.",
  "Harborview Health",
  "Meridian Consulting LLC",
  "Brightline Technologies",
];
const GROCERY = ["Whole Foods Market", "Trader Joe's", "Mariano's", "Jewel-Osco", "Aldi"];
const DINING = ["Sweetgreen", "Shake Shack", "Domino's Pizza", "Joe's Pizza", "Doordash", "Chipotle", "Pret A Manger", "Starbucks"];
const RETAIL = ["Amazon", "Target", "Apple Store", "Uniqlo", "Best Buy", "IKEA", "Costco"];
const TRANSPORT_MERCHANTS = ["Uber", "Lyft", "Shell", "CTA Ventra", "SpotHero", "BP"];
const HEALTH_MERCHANTS = ["Walgreens", "CVS Pharmacy", "Lakeshore Fitness", "Northwestern Medicine"];
const REFUNDS = ["Merchant refund", "Card cashback credit", "Expense reimbursement", "Deposit adjustment credit"];

export function generateUserHistory(userKey: string): {
  events: HistoryEvent[];
  summary: HistorySummary;
} {
  const rand = mulberry32(hashSeed(`vela-history:${userKey.toLowerCase()}`));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const employer = pick(EMPLOYERS);
  const events: HistoryEvent[] = [];
  const push = (e: HistoryEvent) => events.push(e);

  // Months Jan 2023 .. Oct 2026 inclusive (46 months)
  const months: { y: number; m: number }[] = [];
  for (let y = 2023; y <= 2026; y++)
    for (let m = 0; m < 12; m++) {
      if (y === 2026 && m > 9) break;
      months.push({ y, m });
    }

  /* Opening deposit */
  push({
    account: "CHECKING",
    date: new Date(HISTORY_START),
    amount: OPENING_DEPOSIT_CENTS,
    type: "DEPOSIT",
    category: "TRANSFER",
    description: OPENING_DESCRIPTION,
    counterparty: "External bank ••1234",
    paymentMethod: "ACH",
    opening: true,
  });

  /* ------------------------------ credits ------------------------------ */
  // Payroll: every other Friday from Jan 13, 2023 — total $342,000
  const payDates: Date[] = [];
  for (let d = at(2023, 0, 13, 9); d <= HISTORY_END; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14, 9))
    payDates.push(new Date(d));
  distribute(34_200_000, payDates.map(() => 0.85 + rand() * 0.3), 250_000).forEach((amount, i) =>
    push({
      account: "CHECKING", date: payDates[i], amount, type: "DEPOSIT", category: "INCOME",
      description: `Payroll — ${employer.replace(/ Inc\.| LLC/, "")}`, counterparty: employer, paymentMethod: "ACH",
    }),
  );
  // Annual bonuses (Dec 2023/2024/2025) — total $48,000
  distribute(4_800_000, [1, 1.1, 1.2].map((w) => w * (0.9 + rand() * 0.2)), 500_000).forEach((amount, i) =>
    push({
      account: "CHECKING", date: at(2023 + i, 11, 15, 9), amount, type: "DEPOSIT", category: "INCOME",
      description: "Annual bonus", counterparty: employer, paymentMethod: "ACH",
    }),
  );
  // External / consulting deposits, roughly quarterly — total $36,000
  const extDates = months.filter((_, i) => i % 3 === 1).map(({ y, m }) => at(y, m, 17, 11));
  distribute(3_600_000, extDates.map(() => 0.7 + rand() * 0.6), 50_000).forEach((amount, i) =>
    push({
      account: "CHECKING", date: extDates[i], amount, type: "DEPOSIT", category: "INCOME",
      description: "External deposit — consulting income", counterparty: "External bank ••1234", paymentMethod: "ACH",
    }),
  );
  // Tax refunds each April — total $12,000
  distribute(1_200_000, [1, 1, 1, 1].map((w) => w * (0.8 + rand() * 0.4)), 50_000).forEach((amount, i) =>
    push({
      account: "CHECKING", date: at(2023 + i, 3, 18, 9), amount, type: "DEPOSIT", category: "INCOME",
      description: "Tax refund — U.S. Treasury", counterparty: "U.S. Department of the Treasury", paymentMethod: "ACH",
    }),
  );
  // Refunds / cashback / reimbursements, monthly — total $8,400
  distribute(840_000, months.map(() => 0.5 + rand()), 2_000).forEach((amount, i) => {
    const { y, m } = months[i];
    push({
      account: "CHECKING", date: at(y, m, 14, 14), amount, type: "DEPOSIT", category: "OTHER",
      description: pick(REFUNDS), counterparty: "First Meridian", paymentMethod: "ACH",
    });
  });
  // Savings interest on month-end, weighted later — total $3,600 (in credits)
  distribute(SAVINGS_INTEREST_CENTS, months.slice(0, -1).map((_, i) => 0.3 + i / 12), 100).forEach((amount, i) => {
    const { y, m } = months[i];
    const date = at(y, m + 1, 0, 6);
    push({
      account: "SAVINGS", date, amount, type: "INTEREST", category: "INCOME",
      description: "Interest payment", counterparty: "First Meridian Savings", paymentMethod: "ACH",
    });
  });

  /* --------------------- internal savings sweeps ----------------------- */
  distribute(SAVINGS_TRANSFERS_CENTS, months.slice(0, -1).map((_, i) => 0.8 + (i / months.length) * 0.5 + rand() * 0.15), 50_000).forEach(
    (amount, i) => {
      const { y, m } = months[i];
      const date = at(y, m, 28, 17);
      push({
        account: "CHECKING", date, amount: -amount, type: "TRANSFER_OUT", category: "SAVINGS",
        description: "Monthly savings sweep", counterparty: "To High-Yield Savings", paymentMethod: "INTERNAL", internal: true,
      });
      push({
        account: "SAVINGS", date: new Date(date.getTime() + 60_000), amount, type: "TRANSFER_IN", category: "SAVINGS",
        description: "Monthly savings sweep", counterparty: "From Everyday Checking", paymentMethod: "INTERNAL", internal: true,
      });
    },
  );

  /* ------------------------------- debits ------------------------------ */
  const debit = (
    total: number,
    dates: Date[],
    make: (date: Date) => Omit<HistoryEvent, "account" | "date" | "amount">,
    minEach = 100,
  ) =>
    distribute(total, dates.map(() => 0.7 + rand() * 0.6), minEach).forEach((amount, i) =>
      push({ account: "CHECKING", date: dates[i], amount: -amount, ...make(dates[i]) }),
    );

  // Mortgage on the 1st (first full month after the Jan 3 opening: Feb 2023) — $89,700
  const mortgageDates = months.slice(1).map(({ y, m }) => at(y, m, 1, 8));
  distribute(8_970_000, mortgageDates.map(() => 0.97 + rand() * 0.06), 150_000).forEach((amount, i) =>
    push({
      account: "CHECKING", date: mortgageDates[i], amount: -amount, type: "PAYMENT", category: "HOUSING",
      description: "Mortgage — Lakeshore Properties", counterparty: "Lakeshore Properties LLC", paymentMethod: "BILL_PAY",
    }),
  );

  // Fixed-date monthly bills (utilities pool totals exactly $38,480 incl. mortgage-free bills)
  const fixedBills: { day: number; total: number; min: number; make: () => Omit<HistoryEvent, "account" | "date" | "amount">; seasonal?: (m: number) => number }[] = [
    { day: 5, total: 133_400, min: 2_900, make: () => ({ type: "PAYMENT", category: "HEALTH", description: "Lakeshore Fitness", counterparty: "Lakeshore Fitness", paymentMethod: "BILL_PAY" }) },
    { day: 8, total: 82_754, min: 1_799, make: () => ({ type: "PAYMENT", category: "ENTERTAINMENT", description: "Netflix", counterparty: "Netflix Inc.", paymentMethod: "BILL_PAY" }) },
    { day: 10, total: 1_311_000, min: 28_500, make: () => ({ type: "PAYMENT", category: "OTHER", description: "Home & auto insurance", counterparty: "Statewide Insurance", paymentMethod: "BILL_PAY" }) },
    { day: 12, total: 55_154, min: 1_199, make: () => ({ type: "PAYMENT", category: "ENTERTAINMENT", description: "Spotify", counterparty: "Spotify USA", paymentMethod: "BILL_PAY" }) },
    { day: 15, total: 650_000, min: 4_000, seasonal: (m) => [1.25, 1.1, 0.9, 0.8, 0.85, 1.15, 1.35, 1.3, 1.0, 0.85, 0.95, 1.2][m], make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "ComEd", counterparty: "ComEd", paymentMethod: "BILL_PAY" }) },
    { day: 18, total: 520_000, min: 3_000, seasonal: (m) => [1.6, 1.45, 1.15, 0.8, 0.55, 0.4, 0.35, 0.35, 0.5, 0.8, 1.2, 1.5][m], make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "People Gas", counterparty: "People Gas", paymentMethod: "BILL_PAY" }) },
    { day: 20, total: 391_000, min: 8_500, make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "Mobile phone — T-Mobile", counterparty: "T-Mobile", paymentMethod: "BILL_PAY" }) },
    { day: 22, total: 299_000, min: 6_500, make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "Xfinity Internet", counterparty: "Comcast", paymentMethod: "BILL_PAY" }) },
    { day: 25, total: 405_692, min: 5_000, seasonal: (m) => 0.8 + ((m * 7) % 5) * 0.12, make: () => ({ type: "PAYMENT", category: "UTILITIES", description: "City Water & Sewer", counterparty: "City of Chicago Water", paymentMethod: "BILL_PAY" }) },
  ];
  let utilitiesTotal = 0;
  for (const bill of fixedBills) {
    const occurrences = months.filter(({ y, m }) => at(y, m, bill.day, 10) <= HISTORY_END);
    const amounts = distribute(
      bill.total,
      occurrences.map(({ m }) => (bill.seasonal ? bill.seasonal(m) : 1) * (0.95 + rand() * 0.1)),
      Math.min(bill.min, Math.floor(bill.total / occurrences.length)),
    );
    utilitiesTotal += amounts.reduce((a, b) => a + b, 0);
    amounts.forEach((amount, i) => {
      const { y, m } = occurrences[i];
      push({ account: "CHECKING", date: at(y, m, bill.day, 10), amount: -amount, ...bill.make() });
    });
  }
  if (utilitiesTotal !== 3_848_000) throw new Error(`Utilities pool mismatch: ${utilitiesTotal}`);

  // Weekly-ish everyday spending
  const weeklyDates = (startOffsetDays: number, stepDays: number) => {
    const out: Date[] = [];
    for (let d = new Date(2023, 0, 3 + startOffsetDays, 13); d <= HISTORY_END; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + stepDays, 13))
      out.push(new Date(d));
    return out;
  };
  debit(7_200_000, weeklyDates(2, 4), () => {
    const name = pick([...GROCERY, ...DINING]);
    const card = rand() > 0.5;
    return { type: card ? "CARD_PURCHASE" : "PAYMENT", category: "FOOD", description: name, counterparty: card ? "First Meridian debit card" : "ACH debit", paymentMethod: card ? undefined : "ACH" };
  }, 500);
  debit(9_600_000, weeklyDates(4, 6), () => {
    const name = pick(RETAIL);
    return { type: "CARD_PURCHASE", category: "SHOPPING", description: name, counterparty: "First Meridian debit card" };
  }, 800);
  debit(5_400_000, weeklyDates(1, 5), () => {
    const name = pick(TRANSPORT_MERCHANTS);
    const card = rand() > 0.4;
    return { type: card ? "CARD_PURCHASE" : "PAYMENT", category: "TRANSPORT", description: name, counterparty: card ? "First Meridian debit card" : "ACH debit", paymentMethod: card ? undefined : "ACH" };
  }, 500);
  debit(3_200_000, months.slice(0, -1).map(({ y, m }) => at(y, m, 19, 11)), () => {
    const name = pick(HEALTH_MERCHANTS);
    return { type: "PAYMENT", category: "HEALTH", description: name, counterparty: name, paymentMethod: "ACH" };
  }, 1_000);
  // Travel, roughly quarterly — $68,000
  const travelDates = months.filter((_, i) => i % 3 === 2).map(({ y, m }) => at(y, m, 14, 15));
  debit(6_800_000, travelDates, () => ({ type: "CARD_PURCHASE", category: "ENTERTAINMENT", description: pick(["United Airlines", "Marriott Hotels", "Delta Air Lines", "Airbnb", "American Airlines"]), counterparty: "First Meridian debit card" }), 50_000);
  // Taxes: April filing + quarterly estimates — $118,000
  const taxDates: Date[] = [];
  for (let y = 2023; y <= 2026; y++) {
    taxDates.push(at(y, 3, 15, 9));
    taxDates.push(at(y, 5, 15, 9), at(y, 8, 15, 9));
    if (y < 2026) taxDates.push(at(y + 1, 0, 15, 9));
  }
  debit(11_800_000, taxDates.filter((d) => d <= HISTORY_END), (date) => ({
    type: "PAYMENT", category: "OTHER",
    description: date.getMonth() === 3 ? "Federal tax payment — IRS" : "Estimated tax payment",
    counterparty: "U.S. Department of the Treasury", paymentMethod: "ACH",
  }), 50_000);
  // Investment / brokerage transfers on the 16th monthly — $385,000
  debit(38_500_000, months.slice(0, -1).map(({ y, m }) => at(y, m, 16, 10)), () => ({
    type: "TRANSFER_OUT", category: "OTHER", description: "Brokerage transfer — external investment account", counterparty: "External brokerage ••7741", paymentMethod: "ACH",
  }), 100_000);
  // Home / family / large purchases, roughly every 4 months — $86,000
  const largeDates = months.filter((_, i) => i % 4 === 3).map(({ y, m }) => at(y, m, 9, 12));
  debit(8_600_000, largeDates, () => ({
    type: "PAYMENT", category: "HOUSING", description: pick(["Home improvement payment", "Furniture & appliances", "Tuition payment", "Vehicle purchase payment", "Home repair contractor"]), counterparty: "ACH debit", paymentMethod: "ACH",
  }), 50_000);
  // Fees & miscellaneous on the 26th monthly — $15,537.25
  debit(1_553_725, months.slice(0, -1).map(({ y, m }) => at(y, m, 26, 10)), () => ({
    type: "FEE", category: "OTHER", description: pick(["Wire service fee", "Account service charges", "ATM & card fees", "Miscellaneous account fee"]), counterparty: "First Meridian", paymentMethod: "ACH",
  }), 200);

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  /* ------------------------------ verify ------------------------------- */
  let checking = 0;
  let savings = 0;
  let minChecking = Infinity;
  let minSavings = Infinity;
  let laterCredits = 0;
  let externalDebits = 0;
  let internalNet = 0;
  for (const e of events) {
    if (e.account === "CHECKING") {
      checking += e.amount;
      minChecking = Math.min(minChecking, checking);
    } else {
      savings += e.amount;
      minSavings = Math.min(minSavings, savings);
    }
    if (e.internal) internalNet += e.amount;
    else if (e.opening) continue;
    else if (e.amount > 0) laterCredits += e.amount;
    else externalDebits += -e.amount;
  }
  const summary: HistorySummary = {
    openingCredits: OPENING_DEPOSIT_CENTS,
    laterCredits,
    externalDebits,
    internalNet,
    checkingEnding: checking,
    savingsEnding: savings,
    endingTotal: checking + savings,
    transactionCount: events.length,
    firstDate: events[0].date,
    lastDate: events[events.length - 1].date,
    minCheckingBalance: minChecking,
    minSavingsBalance: minSavings,
  };
  if (
    laterCredits !== LATER_CREDITS_CENTS ||
    externalDebits !== EXTERNAL_DEBITS_CENTS ||
    internalNet !== 0 ||
    checking !== CHECKING_ENDING_CENTS ||
    savings !== SAVINGS_ENDING_CENTS ||
    summary.endingTotal !== ENDING_TOTAL_CENTS ||
    minChecking <= 0 ||
    minSavings < 0
  ) {
    throw new Error(`History reconciliation failed: ${JSON.stringify(summary)}`);
  }
  return { events, summary };
}

/* --------------------------- database application -------------------------- */
// Structural (duck-typed) Prisma client so this module works from the app,
// the seed, and CLI scripts without importing a generated client type.

type Db = any;

function derivedAccountNumber(key: string, salt: string): string {
  const rand = mulberry32(hashSeed(`${key}:${salt}`));
  let num = "1";
  for (let i = 0; i < 11; i++) num += String(Math.floor(rand() * 10));
  return num;
}

async function uniqueAccountNumber(db: Db, key: string, salt: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = derivedAccountNumber(key, `${salt}:${attempt}`);
    const existing = await db.account.findUnique({ where: { accountNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Could not allocate an account number");
}

async function ensureAccount(db: Db, user: { id: string; email: string }, type: "CHECKING" | "SAVINGS") {
  const existing = await db.account.findFirst({ where: { userId: user.id, type }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  const created = await db.account.create({
    data: {
      userId: user.id,
      type,
      name: type === "CHECKING" ? "Everyday Checking" : "High-Yield Savings",
      accountNumber: await uniqueAccountNumber(db, user.email, type),
      routingNumber: "021000021",
      balance: 0,
      ...(type === "SAVINGS" ? { apy: 4.25 } : {}),
      createdAt: HISTORY_START,
    },
  });
  if (type === "CHECKING") {
    await db.card.create({
      data: { accountId: created.id, last4: created.accountNumber.slice(-4), brand: "Visa", dailyLimit: 50000 },
    }).catch(() => undefined);
  }
  return created;
}

/**
 * Apply the full 2023-2026 history to one user.
 * - Creates Everyday Checking / High-Yield Savings if the user lacks them.
 * - With `force: true` (backfill/seed) the accounts' transactions are replaced.
 * - Without force (future-user provisioning) it is a no-op for any user who
 *   already has completed activity, so real user transactions are never wiped.
 */
export async function applyUserHistory(
  db: Db,
  user: { id: string; email: string },
  opts: { force?: boolean } = {},
): Promise<HistorySummary & { skipped: boolean }> {
  const checkingAccount = await ensureAccount(db, user, "CHECKING");
  const savingsAccount = await ensureAccount(db, user, "SAVINGS");
  const accounts = { CHECKING: checkingAccount, SAVINGS: savingsAccount };

  if (!opts.force) {
    const existing = await db.transaction.findFirst({
      where: { accountId: { in: [checkingAccount.id, savingsAccount.id] }, status: "COMPLETED" },
      select: { id: true },
    });
    if (existing) {
      const { summary } = generateUserHistory(user.email);
      return { ...summary, skipped: true };
    }
  }

  const { events, summary } = generateUserHistory(user.email);
  const accountIds = [checkingAccount.id, savingsAccount.id];

  await db.$transaction(async (tx: Db) => {
    await tx.transaction.deleteMany({ where: { accountId: { in: accountIds } } });
    await tx.account.update({ where: { id: checkingAccount.id }, data: { createdAt: HISTORY_START, balance: 0 } });
    await tx.account.update({ where: { id: savingsAccount.id }, data: { createdAt: HISTORY_START, balance: 0 } });

    const balances: Record<string, number> = { CHECKING: 0, SAVINGS: 0 };
    const rows = events.map((e) => {
      balances[e.account] += e.amount;
      return {
        accountId: accounts[e.account].id,
        amount: e.amount,
        type: e.type,
        category: e.category,
        description: e.description,
        counterparty: e.counterparty ?? null,
        paymentMethod: e.paymentMethod ?? null,
        status: "COMPLETED",
        balanceAfter: balances[e.account],
        createdAt: e.date,
      };
    });
    for (let i = 0; i < rows.length; i += 400) {
      await tx.transaction.createMany({ data: rows.slice(i, i + 400) });
    }
    await tx.account.update({ where: { id: checkingAccount.id }, data: { balance: balances.CHECKING } });
    await tx.account.update({ where: { id: savingsAccount.id }, data: { balance: balances.SAVINGS } });

    // Keep the canonical bill payees present so bill-pay matches the history.
    for (const payee of [
      { name: "ComEd", category: "UTILITIES", accountMask: "•••• 0481" },
      { name: "Lakeshore Properties", category: "HOUSING", accountMask: "•••• 5519" },
    ]) {
      const found = await tx.billPayee.findFirst({ where: { userId: user.id, name: payee.name } });
      if (!found) await tx.billPayee.create({ data: { userId: user.id, ...payee } });
    }
  });

  return { ...summary, skipped: false };
}

/** Provisioning hook for future users: safe to call on signup/approval. */
export async function ensureUserHistory(db: Db, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return null;
  return applyUserHistory(db, user, { force: false });
}
