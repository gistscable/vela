import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dbUrl = "file:./e2e.db";
const dbFile = path.join(root, "prisma", "e2e.db");
const sidecars = [dbFile, `${dbFile}-journal`, `${dbFile}-shm`, `${dbFile}-wal`];
const bin = (name) => path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);

function runSync(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError ?? "no response"}`);
}

const env = {
  ...process.env,
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: dbUrl,
};
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
let server;

try {
  for (const file of sidecars) rmSync(file, { force: true });
  console.log("Creating disposable SQLite E2E database…");
  runSync(bin("prisma"), ["db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"], env);
  runSync(bin("tsx"), ["prisma/seed.ts"], { ...env, NODE_ENV: "development" });
  runSync(process.execPath, ["e2e/seed-admin.mjs"], env);

  console.log(`Starting isolated test server on ${baseUrl}…`);
  server = spawn(bin("next"), ["start", "-H", "0.0.0.0", "-p", String(port)], {
    cwd: root,
    env: { ...env, NODE_ENV: "production", PORT: String(port) },
    stdio: ["ignore", "inherit", "inherit"],
    shell: process.platform === "win32",
  });
  await waitForServer(baseUrl, server);

  runSync(process.execPath, ["e2e/test.mjs"], { ...env, BASE_URL: baseUrl });
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        server.kill("SIGKILL");
        resolve();
      }, 5_000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  for (const file of sidecars) rmSync(file, { force: true });
}
