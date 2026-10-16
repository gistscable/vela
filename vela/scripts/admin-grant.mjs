import { PrismaClient } from "@prisma/client";

const email = String(process.argv[2] ?? "").trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin:grant -- user@example.com");
  process.exit(2);
}

const db = new PrismaClient();
try {
  const result = await db.user.updateMany({ where: { email }, data: { role: "ADMIN" } });
  if (result.count !== 1) {
    console.error("No matching account was found. Create the separate admin account first, then run this command again.");
    process.exitCode = 1;
  } else {
    console.log("Admin access enabled for the existing account. The account must sign in again to see the admin page.");
  }
} finally {
  await db.$disconnect();
}
