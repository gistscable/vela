import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// A disposable admin account used only by the isolated E2E database.
const db = new PrismaClient();
try {
  await db.user.create({
    data: {
      email: "e2e-admin@example.test",
      passwordHash: await bcrypt.hash("e2e-admin-pass-82", 10),
      firstName: "E2E",
      lastName: "Administrator",
      role: "ADMIN",
    },
  });
} finally {
  await db.$disconnect();
}
