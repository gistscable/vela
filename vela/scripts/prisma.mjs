import { spawnSync } from "node:child_process";
import path from "node:path";

const provider = process.env.DATABASE_PROVIDER ?? "sqlite";
if (provider !== "sqlite" && provider !== "postgresql") {
  console.error(`Unsupported DATABASE_PROVIDER "${provider}". Use "sqlite" or "postgresql".`);
  process.exit(2);
}

const command = process.argv[2];
if (command === "migrate" && provider !== "postgresql") {
  console.error("The checked-in migration set targets PostgreSQL. Set DATABASE_PROVIDER=postgresql to run migrations; local SQLite uses db:push.");
  process.exit(2);
}

const schema = provider === "postgresql"
  ? "prisma/schema.postgresql.prisma"
  : "prisma/schema.prisma";
const prismaBin = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);
const args = [...process.argv.slice(2), "--schema", schema];
if (process.argv.length < 3) {
  console.error("Usage: node scripts/prisma.mjs <prisma command> [arguments]");
  process.exit(2);
}

const result = spawnSync(prismaBin, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
