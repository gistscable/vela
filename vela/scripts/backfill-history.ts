/**
 * Backfill the Jan 2023 -> Oct 2026 reconciled history for EVERY user.
 *
 * Dry-run by default (prints the per-user verification report, writes nothing):
 *   npx tsx scripts/backfill-history.ts
 * Apply (replaces each user's transaction history):
 *   npx tsx scripts/backfill-history.ts --apply
 * Only one user:
 *   npx tsx scripts/backfill-history.ts --apply --email=demo@vela.app
 *
 * Per user: $950,000 opening + $450,000 credits - $1,054,717.25 debits
 * = $345,282.75 ($245,282.75 checking + $100,000.00 savings).
 */
import { applyUserHistory, generateUserHistory } from "../src/lib/history";
import { db } from "../src/lib/db";
const apply = process.argv.includes("--apply");
const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

async function main() {
  const users = await db.user.findMany({
    where: emailArg ? { email: emailArg } : undefined,
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (users.length === 0) throw new Error("No users matched.");

  console.log(`${apply ? "APPLYING" : "DRY RUN"} — ${users.length} user(s)\n`);
  for (const user of users) {
    if (apply) {
      const s = await applyUserHistory(db, user, { force: true });
      console.log(
        `✓ ${user.email} (${user.role}) tx=${s.transactionCount} opening=${money(s.openingCredits)} credits=${money(s.laterCredits)} debits=${money(s.externalDebits)} checking=${money(s.checkingEnding)} savings=${money(s.savingsEnding)} total=${money(s.endingTotal)} ${s.firstDate.toISOString().slice(0, 10)}..${s.lastDate.toISOString().slice(0, 10)}`,
      );
    } else {
      const { summary: s } = generateUserHistory(user.email);
      console.log(
        `• ${user.email} (${user.role}) tx=${s.transactionCount} opening=${money(s.openingCredits)} credits=${money(s.laterCredits)} debits=${money(s.externalDebits)} checking=${money(s.checkingEnding)} savings=${money(s.savingsEnding)} total=${money(s.endingTotal)} ${s.firstDate.toISOString().slice(0, 10)}..${s.lastDate.toISOString().slice(0, 10)}`,
      );
    }
  }
  if (!apply) console.log("\nNothing written. Re-run with --apply to replace transaction history.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
