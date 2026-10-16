import bcrypt from "bcryptjs";
import { applyUserHistory } from "../src/lib/history";
import { db } from "../src/lib/db";
const DEMO_EMAILS = ["demo@vela.app", "marcus@example.com"] as const;

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
  await db.account.create({
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

  // Full Jan 2023 -> Oct 2026 history: $950,000 opening + $450,000 credits
  // - $1,054,717.25 debits = $345,282.75 (checking $245,282.75 + savings $100,000).
  // Also creates the canonical ComEd / Lakeshore Properties bill payees.
  const amaraSummary = await applyUserHistory(db, amara, { force: true });
  console.log(`  ✓ Amara Okafor — checking ${amaraSummary.checkingEnding}¢, savings ${amaraSummary.savingsEnding}¢, ${amaraSummary.transactionCount} transactions`);

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
  await db.account.create({
    data: {
      userId: marcus.id,
      type: "SAVINGS",
      name: "High-Yield Savings",
      accountNumber: "992847103366",
      routingNumber: "021000021",
      balance: 0,
      apy: 4.25,
    },
  });
  await db.card.create({
    data: { accountId: mChecking.id, last4: "4417", brand: "Visa", dailyLimit: 50000 },
  });
  const marcusSummary = await applyUserHistory(db, marcus, { force: true });
  console.log(`  ✓ Marcus Chen — checking ${marcusSummary.checkingEnding}¢, savings ${marcusSummary.savingsEnding}¢, ${marcusSummary.transactionCount} transactions (marcus@example.com)`);

  console.log("✅ Done. Demo login: demo@vela.app / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
