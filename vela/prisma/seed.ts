import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const DEMO_EMAILS = ["demo@vela.app", "marcus@example.com"] as const;

// Deterministic PRNG so reseeding produces stable data
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));

type Event = {
  date: Date;
  amount: number; // cents, signed
  type: string;
  category: string;
  description: string;
  counterparty?: string;
};

function daysAgo(n: number, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, between(0, 59), 0, 0);
  return d;
}

const MERCHANTS: Record<string, { name: string; min: number; max: number; type?: string }[]> = {
  FOOD: [
    { name: "Whole Foods Market", min: 2850, max: 14200 },
    { name: "Trader Joe's", min: 2210, max: 9680 },
    { name: "Sweetgreen", min: 1250, max: 2140 },
    { name: "Starbucks", min: 545, max: 875 },
    { name: "Shake Shack", min: 1450, max: 3280 },
    { name: "Domino's Pizza", min: 1890, max: 4210 },
    { name: "Pret A Manger", min: 890, max: 1650 },
    { name: "Joe's Pizza", min: 1100, max: 2400, type: "CARD_PURCHASE" },
    { name: "Doordash", min: 2400, max: 6800, type: "CARD_PURCHASE" },
  ],
  TRANSPORT: [
    { name: "Uber", min: 890, max: 4200, type: "CARD_PURCHASE" },
    { name: "Lyft", min: 750, max: 3800, type: "CARD_PURCHASE" },
    { name: "CTA Ventra", min: 2000, max: 2000 },
    { name: "Shell", min: 3200, max: 6800, type: "CARD_PURCHASE" },
    { name: "SpotHero", min: 1200, max: 3600 },
  ],
  SHOPPING: [
    { name: "Amazon", min: 1599, max: 22800, type: "CARD_PURCHASE" },
    { name: "Target", min: 2250, max: 12600, type: "CARD_PURCHASE" },
    { name: "Uniqlo", min: 3450, max: 12900 },
    { name: "Apple Store", min: 999, max: 24900, type: "CARD_PURCHASE" },
  ],
  ENTERTAINMENT: [
    { name: "AMC Theatres", min: 1600, max: 4200, type: "CARD_PURCHASE" },
    { name: "Spotify", min: 1199, max: 1199 },
    { name: "Netflix", min: 1799, max: 1799 },
    { name: "Steam", min: 999, max: 5999 },
  ],
  HEALTH: [
    { name: "Lakeshore Fitness", min: 2900, max: 2900 },
    { name: "Walgreens", min: 850, max: 4500, type: "CARD_PURCHASE" },
    { name: "CVS Pharmacy", min: 720, max: 3900 },
  ],
};

function randomSpendingEvent(day: number): Event {
  const category = pick(["FOOD", "FOOD", "FOOD", "TRANSPORT", "TRANSPORT", "SHOPPING", "ENTERTAINMENT", "HEALTH"]);
  const merchant = pick(MERCHANTS[category]);
  return {
    date: daysAgo(day, between(8, 21)),
    amount: -between(merchant.min, merchant.max),
    type: merchant.type ?? "PAYMENT",
    category,
    description: merchant.name,
    counterparty: merchant.type === "CARD_PURCHASE" ? "First Meridian card ••8124" : "ACH debit",
  };
}

async function replay(accountId: string, events: Event[], openingBalance: number) {
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  let balance = openingBalance;
  for (const e of events) {
    balance += e.amount;
    await db.transaction.create({
      data: {
        accountId,
        amount: e.amount,
        type: e.type,
        category: e.category,
        description: e.description,
        counterparty: e.counterparty ?? null,
        status: "COMPLETED",
        balanceAfter: balance,
        createdAt: e.date,
      },
    });
  }
  await db.account.update({ where: { id: accountId }, data: { balance } });
  return balance;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seeding is disabled in production. Do not create sample financial records in a live database.");
  }

  const resetDemo = process.argv.includes("--reset");
  const existingDemo = await db.user.findFirst({ where: { email: { in: [...DEMO_EMAILS] } } });
  if (existingDemo && !resetDemo) {
    console.log("Demo seed accounts already exist; leaving all users and data untouched. Use --reset only for a local demo reset.");
    return;
  }

  console.log("🌱 Seeding First Meridian demo accounts…");
  if (resetDemo) {
    // Delete only the two reserved seed identities. Never clear arbitrary users or processor events.
    await db.user.deleteMany({ where: { email: { in: [...DEMO_EMAILS] } } });
  }

  const passwordHash = await bcrypt.hash("demo1234", 10);

  /* ------------------------------ DEMO USER ------------------------------ */
  const amara = await db.user.create({
    data: {
      email: "demo@vela.app",
      passwordHash,
      firstName: "Amara",
      lastName: "Okafor",
      phone: "+1 (312) 555-0192",
    },
  });

  const checking = await db.account.create({
    data: {
      userId: amara.id,
      type: "CHECKING",
      name: "Everyday Checking",
      accountNumber: "184739205614",
      routingNumber: "021000021",
      balance: 0,
    },
  });
  const savings = await db.account.create({
    data: {
      userId: amara.id,
      type: "SAVINGS",
      name: "High-Yield Savings",
      accountNumber: "184739205622",
      routingNumber: "021000021",
      balance: 0,
      apy: 4.25,
    },
  });

  await db.card.create({
    data: { accountId: checking.id, last4: "8124", brand: "Visa", dailyLimit: 50000 },
  });

  await db.billPayee.createMany({
    data: [
      { userId: amara.id, name: "ComEd", category: "UTILITIES", accountMask: "•••• 0481" },
      { userId: amara.id, name: "Lakeshore Properties", category: "HOUSING", accountMask: "•••• 5519" },
    ],
  });

  // ~14 weeks of life
  const checkingEvents: Event[] = [
    { date: daysAgo(100, 9), amount: 420000, type: "DEPOSIT", category: "TRANSFER", description: "Opening deposit", counterparty: "External bank ••1234" },
    { date: daysAgo(100, 14), amount: -500000, type: "TRANSFER_OUT", category: "SAVINGS", description: "Initial savings transfer", counterparty: "To High-Yield Savings" },
  ];
  const savingsEvents: Event[] = [
    { date: daysAgo(100, 14), amount: 500000, type: "TRANSFER_IN", category: "SAVINGS", description: "Initial savings transfer", counterparty: "From Everyday Checking" },
  ];

  // Payroll every 14 days
  for (let d = 98; d > 0; d -= 14) {
    checkingEvents.push({
      date: daysAgo(d, 9),
      amount: 325000,
      type: "DEPOSIT",
      category: "INCOME",
      description: "Payroll — Northstar Labs",
      counterparty: "Northstar Labs Inc.",
    });
  }
  // Rent on the 1st-ish each month
  for (const d of [95, 65, 35, 5]) {
    checkingEvents.push({
      date: daysAgo(d, 8),
      amount: -185000,
      type: "PAYMENT",
      category: "HOUSING",
      description: "Rent — Lakeshore Properties",
      counterparty: "Lakeshore Properties LLC",
    });
  }
  // Monthly utilities + subscriptions + savings sweep
  for (const d of [93, 63, 33, 3]) {
    checkingEvents.push({
      date: daysAgo(d, 10),
      amount: -between(7200, 9600),
      type: "PAYMENT",
      category: "UTILITIES",
      description: "ComEd",
      counterparty: "ComEd",
    });
    checkingEvents.push({
      date: daysAgo(d - 1, 10),
      amount: -between(3800, 5200),
      type: "PAYMENT",
      category: "UTILITIES",
      description: "People Gas",
      counterparty: "People Gas",
    });
    checkingEvents.push({
      date: daysAgo(d - 2, 10),
      amount: -6500,
      type: "PAYMENT",
      category: "UTILITIES",
      description: "Xfinity Internet",
      counterparty: "Comcast",
    });
  }
  for (let d = 90; d > 0; d -= 30) {
    checkingEvents.push({
      date: daysAgo(d, 17),
      amount: -50000,
      type: "TRANSFER_OUT",
      category: "SAVINGS",
      description: "Monthly savings sweep",
      counterparty: "To High-Yield Savings",
    });
    savingsEvents.push({
      date: daysAgo(d, 17),
      amount: 50000,
      type: "TRANSFER_IN",
      category: "SAVINGS",
      description: "Monthly savings sweep",
      counterparty: "From Everyday Checking",
    });
  }
  // Interest accrual in savings
  for (const d of [88, 58, 28]) {
    savingsEvents.push({
      date: daysAgo(d, 6),
      amount: between(980, 2240),
      type: "INTEREST",
      category: "INCOME",
      description: "Interest payment",
      counterparty: "First Meridian Savings",
    });
  }
  // Everyday spending — 2-4 events/day
  for (let day = 99; day > 0; day--) {
    const count = between(1, 4);
    for (let i = 0; i < count; i++) checkingEvents.push(randomSpendingEvent(day));
  }
  // A few transfers to savings mid-month
  for (const d of [75, 45, 15]) {
    checkingEvents.push({
      date: daysAgo(d, 12),
      amount: -25000,
      type: "TRANSFER_OUT",
      category: "SAVINGS",
      description: "Extra savings",
      counterparty: "To High-Yield Savings",
    });
    savingsEvents.push({
      date: daysAgo(d, 12),
      amount: 25000,
      type: "TRANSFER_IN",
      category: "SAVINGS",
      description: "Extra savings",
      counterparty: "From Everyday Checking",
    });
  }

  const checkingBalance = await replay(checking.id, checkingEvents, 0);
  const savingsBalance = await replay(savings.id, savingsEvents, 0);
  console.log(`  ✓ Amara Okafor — checking ${checkingBalance}¢, savings ${savingsBalance}¢`);

  /* ---------------------------- FRIEND (for P2P) ---------------------------- */
  const marcus = await db.user.create({
    data: {
      email: "marcus@example.com",
      passwordHash,
      firstName: "Marcus",
      lastName: "Chen",
    },
  });
  const mChecking = await db.account.create({
    data: {
      userId: marcus.id,
      type: "CHECKING",
      name: "Everyday Checking",
      accountNumber: "992847103355",
      routingNumber: "021000021",
      balance: 0,
    },
  });
  await db.card.create({
    data: { accountId: mChecking.id, last4: "4417", brand: "Visa", dailyLimit: 50000 },
  });
  const marcusEvents: Event[] = [
    { date: daysAgo(60, 10), amount: 250000, type: "DEPOSIT", category: "TRANSFER", description: "Opening deposit", counterparty: "External bank ••5678" },
    { date: daysAgo(56, 9), amount: 280000, type: "DEPOSIT", category: "INCOME", description: "Payroll — Quantum Design Co.", counterparty: "Quantum Design Co." },
    { date: daysAgo(42, 9), amount: 280000, type: "DEPOSIT", category: "INCOME", description: "Payroll — Quantum Design Co.", counterparty: "Quantum Design Co." },
    { date: daysAgo(28, 9), amount: 280000, type: "DEPOSIT", category: "INCOME", description: "Payroll — Quantum Design Co.", counterparty: "Quantum Design Co." },
    { date: daysAgo(14, 9), amount: 280000, type: "DEPOSIT", category: "INCOME", description: "Payroll — Quantum Design Co.", counterparty: "Quantum Design Co." },
  ];
  for (let day = 55; day > 0; day--) {
    if (rand() > 0.55) marcusEvents.push(randomSpendingEvent(day));
  }
  await replay(mChecking.id, marcusEvents, 0);
  console.log(`  ✓ Marcus Chen — P2P test recipient (marcus@example.com)`);

  console.log("✅ Done. Demo login: demo@vela.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
