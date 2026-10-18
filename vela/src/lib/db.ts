import "server-only";
/**
 * Local data layer.
 *
 * The checked-in Prisma schema is the source of truth for the data model, but
 * this deployment runs against the local SQLite database (prisma/dev.db) and
 * the Prisma query/schema engines cannot be downloaded in this environment.
 * This module therefore implements the subset of the Prisma Client API used
 * by the app (findMany/findFirst/findUnique/create/createMany/update/
 * updateMany/deleteMany/count/$transaction, where/include/select/orderBy/
 * take/skip, increment/decrement) on top of node:sqlite, honouring the same
 * table/column layout Prisma created. On a host where Prisma engines are
 * available, swap this file for `new PrismaClient()` — call sites are
 * Prisma-shaped on purpose.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
// Static import so bundlers (and Netlify's function bundler) can see the
// dependency and resolve the generated client at runtime instead of failing
// with "Cannot find module '.prisma/client/default'". Keep this package in
// next.config.mjs -> serverExternalPackages so it stays a runtime require.
import { PrismaClient } from "@prisma/client";
import { wrapPrismaForMissingSchema } from "@/lib/schema-compat";

export type User = {
  id: string; email: string; username: string | null; usernameNormalized: string | null;
  passwordHash: string; firstName: string; lastName: string;
  phone: string | null; role: string; enrollmentStatus: string;
  enrollmentReviewedById: string | null; enrollmentReviewedAt: Date | null;
  mfaEnabled: boolean; totpSecretEncrypted: string | null; totpLastUsedStep: number | null;
  mfaPendingSecretEncrypted: string | null; mfaPendingExpiresAt: Date | null;
  mfaFailedAttempts: number; mfaLockedUntil: Date | null;
  historyPaused: boolean; historyPausedAt: Date | null; historyPausedById: string | null;
  accessLocked: boolean; lockReason: string | null; lockedById: string | null; lockedAt: Date | null;
  createdAt: Date; updatedAt: Date;
};
export type Card = { id: string; accountId: string; last4: string; brand: string; kind: string; status: string; dailyLimit: number; spentToday: number; creditLimit: number | null; createdAt: Date };
export type ProductApplication = {
  id: string; userId: string; kind: string; productCode: string; status: string;
  linkedAccountId: string | null; nickname: string | null; reviewedById: string | null;
  reviewedAt: Date | null; createdAccountId: string | null; createdCardId: string | null;
  createdAt: Date; user: User;
};
export type BillPayee = { id: string; userId: string; name: string; category: string; accountMask: string | null; encryptedAccountNumber?: string | null; createdAt: Date };
export type BillPayment = { id: string; userId: string; payeeId: string; accountId: string; amount: number; scheduledFor: Date; frequency: string; memo: string | null; status: string; confirmationNumber: string; createdAt: Date; payee: BillPayee; account: Account; user: User };
export type ExternalAccount = { user: User; id: string; userId: string; institutionName: string; nickname: string; accountType: string; accountMask: string; status: string; microdepositAmount1: number | null; microdepositAmount2: number | null; microdepositExpiresAt: Date | null; microdepositAttempts: number; reviewedById: string | null; reviewedAt: Date | null; verifiedAt: Date | null; createdAt: Date };
export type MoneyRequest = { requester: User; recipient: User; account: Account; id: string; requesterId: string; recipientId: string; recipientEmail: string; accountId: string; amount: number; memo: string | null; status: string; reference: string; createdAt: Date; updatedAt: Date; paidAt: Date | null };
export type LinkedBank = { id: string; userId: string; provider: string; plaidItemId: string | null; institutionId: string | null; institutionName: string; encryptedAccessToken: string; accountsJson: string; createdAt: Date };
export type FundingIntent = { id: string; userId: string; accountId: string; amount: number; status: string; provider: string; providerSessionId: string | null; stripePaymentIntentId: string | null; reference: string; createdAt: Date; updatedAt: Date };
export type Payee = { id: string; userId: string; name: string; email: string; createdAt: Date };

export type Delegate<T> = {
  findMany: (args?: any) => Promise<T[]>;
  findFirst: (args?: any) => Promise<T | null>;
  findUnique: (args?: any) => Promise<T | null>;
  findUniqueOrThrow: (args?: any) => Promise<T>;
  count: (args?: any) => Promise<number>;
  create: (args?: any) => Promise<T>;
  createMany: (args?: any) => Promise<{ count: number }>;
  update: (args?: any) => Promise<T>;
  updateMany: (args?: any) => Promise<{ count: number }>;
  delete: (args?: any) => Promise<T | null>;
  deleteMany: (args?: any) => Promise<{ count: number }>;
};

export type Database = {
  user: Delegate<User>; account: Delegate<Account>; transaction: Delegate<Transaction>;
  card: Delegate<Card>; payee: Delegate<Payee>; billPayee: Delegate<BillPayee>;
  billPayment: Delegate<BillPayment>; linkedBank: Delegate<LinkedBank>;
  externalAccount: Delegate<ExternalAccount>; fundingIntent: Delegate<FundingIntent>;
  moneyRequest: Delegate<MoneyRequest>; productApplication: Delegate<ProductApplication>;
  processorEvent: Delegate<{ id: string; provider: string; type: string; createdAt: Date }>;
  $transaction: <T>(fn: (tx: Database) => Promise<T>) => Promise<T>;
  $disconnect: () => Promise<void>;
};

export type Account = {
  id: string; userId: string; type: string; name: string; accountNumber: string;
  routingNumber: string; balance: number; status: string; apy: number | null; createdAt: Date;
  user: User; cards: Card[];
};
export type Transaction = {
  id: string; accountId: string; amount: number; type: string; category: string;
  description: string; counterparty: string | null; paymentMethod: string | null;
  status: string; reference: string | null; balanceAfter: number | null;
  reviewedById: string | null; reviewedAt: Date | null; createdAt: Date;
  account: Account;
};

const DB_PATH = process.env.DATABASE_URL?.startsWith("file:")
  ? path.resolve(process.cwd(), "prisma", process.env.DATABASE_URL.slice(5).replace(/^\.\//, ""))
  : path.resolve(process.cwd(), "prisma/dev.db");

// node:sqlite is loaded lazily (and never on Netlify/Postgres) so bundlers
// and Node 20 runtimes don't fail resolving it at module load.
// `createRequire(import.meta.url)` gives the ESM server bundle a real
// `require` without the `eval("require")` trick, which bundlers cannot
// statically analyse.
const nodeRequire = createRequire(import.meta.url);
let sqlite: any;
function getSqlite(): any {
  if (!sqlite) sqlite = new (nodeRequire("node:sqlite").DatabaseSync)(DB_PATH);
  return sqlite;
}

const DATE_FIELDS = new Set([
  "createdAt", "updatedAt", "scheduledFor", "reviewedAt", "verifiedAt", "paidAt",
  "enrollmentReviewedAt", "mfaPendingExpiresAt", "mfaLockedUntil", "microdepositExpiresAt",
  "historyPausedAt", "lockedAt",
]);
const BOOL_FIELDS = new Set(["mfaEnabled", "historyPaused", "accessLocked"]);
const MODELS: Record<string, string> = {
  user: "User", account: "Account", transaction: "Transaction", card: "Card",
  payee: "Payee", billPayee: "BillPayee", billPayment: "BillPayment",
  linkedBank: "LinkedBank", externalAccount: "ExternalAccount",
  fundingIntent: "FundingIntent", moneyRequest: "MoneyRequest",
  productApplication: "ProductApplication", processorEvent: "ProcessorEvent",
};
/** many-to-one relations: model -> relation -> { fk, target } */
const REL: Record<string, Record<string, { fk: string; target: string }>> = {
  Account: { user: { fk: "userId", target: "User" } },
  Transaction: { account: { fk: "accountId", target: "Account" } },
  Card: { account: { fk: "accountId", target: "Account" } },
  Payee: { user: { fk: "userId", target: "User" } },
  BillPayee: { user: { fk: "userId", target: "User" } },
  BillPayment: {
    user: { fk: "userId", target: "User" },
    payee: { fk: "payeeId", target: "BillPayee" },
    account: { fk: "accountId", target: "Account" },
  },
  LinkedBank: { user: { fk: "userId", target: "User" } },
  ExternalAccount: { user: { fk: "userId", target: "User" } },
  FundingIntent: { user: { fk: "userId", target: "User" }, account: { fk: "accountId", target: "Account" } },
  MoneyRequest: {
    requester: { fk: "requesterId", target: "User" },
    recipient: { fk: "recipientId", target: "User" },
    account: { fk: "accountId", target: "Account" },
  },
  ProductApplication: { user: { fk: "userId", target: "User" } },
};
/** one-to-many relations (for include): model -> relation -> { target, fkOnTarget } */
const REVERSE: Record<string, Record<string, { target: string; fk: string }>> = {
  User: {
    accounts: { target: "Account", fk: "userId" },
    payees: { target: "Payee", fk: "userId" },
    billPayees: { target: "BillPayee", fk: "userId" },
    billPayments: { target: "BillPayment", fk: "userId" },
    linkedBanks: { target: "LinkedBank", fk: "userId" },
    externalAccounts: { target: "ExternalAccount", fk: "userId" },
    productApplications: { target: "ProductApplication", fk: "userId" },
  },
  Account: {
    transactions: { target: "Transaction", fk: "accountId" },
    cards: { target: "Card", fk: "accountId" },
    billPayments: { target: "BillPayment", fk: "accountId" },
  },
  BillPayee: { payments: { target: "BillPayment", fk: "payeeId" } },
};

const tableCols = new Map<string, string[]>();
function cols(table: string): string[] {
  if (!tableCols.has(table)) {
    const rows = getSqlite().prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
    tableCols.set(table, rows.map((r) => r.name));
  }
  return tableCols.get(table)!;
}

function toDbValue(field: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}
function fromDb(table: string, row: Record<string, unknown>): any {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (DATE_FIELDS.has(k) && typeof v === "number") out[k] = new Date(v);
    else if (BOOL_FIELDS.has(k)) out[k] = Boolean(v);
    else out[k] = v;
  }
  return out;
}

function buildWhere(table: string, where: any, params: unknown[], alias = `"${table}"`): string {
  if (!where) return "1=1";
  const parts: string[] = [];
  for (const [key, cond] of Object.entries<any>(where)) {
    if (key === "AND") {
      const list = Array.isArray(cond) ? cond : [cond];
      parts.push(`(${list.map((w) => buildWhere(table, w, params, alias)).join(" AND ")})`);
      continue;
    }
    if (key === "OR") {
      const list = Array.isArray(cond) ? cond : [cond];
      parts.push(`(${list.map((w) => buildWhere(table, w, params, alias)).join(" OR ")})`);
      continue;
    }
    if (key === "NOT") {
      parts.push(`NOT (${buildWhere(table, cond, params, alias)})`);
      continue;
    }
    const rel = REL[table]?.[key];
    if (rel && cond && typeof cond === "object" && !(cond instanceof Date)) {
      const sub: unknown[] = [];
      const subWhere = buildWhere(rel.target, cond, sub, `"${rel.target}"`);
      parts.push(
        `${alias}."${rel.fk}" IN (SELECT "id" FROM "${rel.target}" WHERE ${subWhere.replaceAll(`"${rel.target}"`, `"${rel.target}"`)})`,
      );
      params.push(...sub);
      continue;
    }
    const col = `${alias}."${key}"`;
    if (cond === null) {
      parts.push(`${col} IS NULL`);
    } else if (cond instanceof Date || typeof cond !== "object") {
      params.push(toDbValue(key, cond));
      parts.push(`${col} = ?`);
    } else {
      for (const [op, val] of Object.entries<any>(cond)) {
        if (op === "in" || op === "notIn") {
          const arr = (val as unknown[]).map((v) => toDbValue(key, v));
          if (arr.length === 0) { parts.push(op === "in" ? "0=1" : "1=1"); continue; }
          params.push(...arr);
          parts.push(`${col} ${op === "in" ? "IN" : "NOT IN"} (${arr.map(() => "?").join(",")})`);
        } else if (op === "gte" || op === "lte" || op === "gt" || op === "lt") {
          params.push(toDbValue(key, val));
          parts.push(`${col} ${op === "gte" ? ">=" : op === "lte" ? "<=" : op === "gt" ? ">" : "<"} ?`);
        } else if (op === "contains") {
          params.push(`%${val}%`);
          parts.push(`${col} LIKE ?`);
        } else if (op === "not") {
          params.push(toDbValue(key, val));
          parts.push(`${col} != ?`);
        } else if (op === "equals") {
          params.push(toDbValue(key, val));
          parts.push(`${col} = ?`);
        }
      }
    }
  }
  return parts.length ? parts.join(" AND ") : "1=1";
}

function orderClause(table: string, orderBy: any): string {
  if (!orderBy) return "";
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts: string[] = [];
  for (const item of list) {
    for (const [field, val] of Object.entries<any>(item)) {
      const rel = REL[table]?.[field];
      if (rel && val && typeof val === "object") {
        const [subField, dir] = Object.entries<any>(val)[0];
        parts.push(`(SELECT "${subField}" FROM "${rel.target}" WHERE "${rel.target}"."id" = "${table}"."${rel.fk}") ${String(dir).toUpperCase() === "DESC" ? "DESC" : "ASC"}`);
      } else {
        parts.push(`"${table}"."${field}" ${String(val).toUpperCase() === "DESC" ? "DESC" : "ASC"}`);
      }
    }
  }
  return parts.length ? ` ORDER BY ${parts.join(", ")}` : "";
}

function applySelectInclude(table: string, row: any, args: any): any {
  let out = row;
  if (args?.select) {
    out = {};
    for (const [k, v] of Object.entries<any>(args.select)) {
      if (v === true) out[k] = row[k];
      else if (v && typeof v === "object" && row[k] !== undefined) out[k] = row[k];
    }
  }
  const include = args?.include ?? (args?.select ? Object.fromEntries(Object.entries<any>(args.select).filter(([, v]) => v && typeof v === "object" && ("include" in v || "select" in v))) : undefined);
  if (include) {
    for (const [relName, relArg] of Object.entries<any>(include)) {
      if (!relArg) continue;
      const fkRel = REL[table]?.[relName];
      const nestedArgs = relArg === true ? {} : relArg;
      if (fkRel) {
        const targetRow = findOneRaw(fkRel.target, { id: row[fkRel.fk] });
        out[relName] = targetRow ? applySelectInclude(fkRel.target, targetRow, nestedArgs) : null;
        if (nestedArgs.select && fkRel) {
          const picked: Record<string, unknown> = {};
          for (const k of Object.keys(nestedArgs.select)) if (nestedArgs.select[k]) picked[k] = out[relName]?.[k];
          if (nestedArgs.include) {
            const withInc = applySelectInclude(fkRel.target, targetRow, { include: nestedArgs.include });
            out[relName] = { ...picked, ...Object.fromEntries(Object.keys(nestedArgs.include).map((k) => [k, withInc[k]])) };
          } else out[relName] = picked;
        }
      } else if (REVERSE[table]?.[relName]) {
        const rev = REVERSE[table][relName];
        out[relName] = findManyRaw(rev.target, { where: { [rev.fk]: row.id }, ...nestedArgs });
      }
    }
  }
  return out;
}

function findManyRaw(table: string, args: any = {}): any[] {
  const params: unknown[] = [];
  const sql = `SELECT * FROM "${table}" WHERE ${buildWhere(table, args.where, params)}${orderClause(table, args.orderBy)}${args.take ? ` LIMIT ${Number(args.take)}` : ""}${args.skip ? ` OFFSET ${Number(args.skip)}` : ""}`;
  const rows = (getSqlite().prepare(sql).all(...(params as never[])) as Record<string, unknown>[]).map((r) => fromDb(table, r));
  return rows.map((r) => applySelectInclude(table, r, args));
}
function findOneRaw(table: string, where: any): any | null {
  const rows = findManyRaw(table, { where, take: 1 });
  return rows[0] ?? null;
}

const DEFAULTS: Record<string, Record<string, unknown>> = {
  User: { role: "CUSTOMER", enrollmentStatus: "APPROVED", mfaEnabled: 0, mfaFailedAttempts: 0, historyPaused: 0, accessLocked: 0 },
  Account: { status: "ACTIVE", balance: 0 },
  Transaction: { status: "COMPLETED" },
  Card: { brand: "Visa", kind: "DEBIT", status: "ACTIVE", dailyLimit: 50000, spentToday: 0 },
  ProductApplication: { status: "PENDING_APPROVAL" },
  BillPayee: { category: "OTHER" },
  BillPayment: { frequency: "ONCE", status: "SCHEDULED" },
  ExternalAccount: { status: "PENDING_APPROVAL", microdepositAttempts: 0 },
  FundingIntent: { status: "CREATED", provider: "STRIPE" },
  MoneyRequest: { status: "OPEN" },
  LinkedBank: { provider: "PLAID", accountsJson: "[]" },
};

function insertRow(table: string, data: any): any {
  const available = cols(table);
  const row: Record<string, unknown> = { ...(DEFAULTS[table] ?? {}) };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !(v instanceof Date) && ("create" in (v as any) || "connect" in (v as any))) continue;
    row[k] = v;
  }
  if (available.includes("id") && !row.id) row.id = randomUUID().replace(/-/g, "");
  const now = Date.now();
  if (available.includes("createdAt") && row.createdAt === undefined) row.createdAt = now;
  if (available.includes("updatedAt") && row.updatedAt === undefined) row.updatedAt = now;
  const keys = Object.keys(row).filter((k) => available.includes(k));
  sqlite
    .prepare(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
    .run(...keys.map((k) => toDbValue(k, row[k]) as never));
  return findOneRaw(table, { id: row.id });
}

function updateRows(table: string, where: any, data: any): number {
  const params: unknown[] = [];
  const sets: string[] = [];
  for (const [k, v] of Object.entries<any>(data)) {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("increment" in v) { sets.push(`"${k}" = "${k}" + ?`); params.push(v.increment); continue; }
      if ("decrement" in v) { sets.push(`"${k}" = "${k}" - ?`); params.push(v.decrement); continue; }
      if ("set" in v) { sets.push(`"${k}" = ?`); params.push(toDbValue(k, v.set)); continue; }
      continue;
    }
    sets.push(`"${k}" = ?`);
    params.push(toDbValue(k, v));
  }
  if (cols(table).includes("updatedAt") && !("updatedAt" in data)) {
    sets.push(`"updatedAt" = ?`);
    params.push(Date.now());
  }
  const whereParams: unknown[] = [];
  const whereSql = buildWhere(table, where, whereParams);
  const info = getSqlite().prepare(`UPDATE "${table}" SET ${sets.join(", ")} WHERE ${whereSql}`).run(...[...params, ...whereParams] as never[]);
  return Number(info.changes);
}

function makeModel(table: string) {
  return {
    findMany: async (args: any = {}) => findManyRaw(table, args),
    findFirst: async (args: any = {}) => {
      const rows = findManyRaw(table, { ...args, take: args.take ?? 1 });
      return rows[0] ?? null;
    },
    findUnique: async (args: any = {}) => findOneRaw(table, args.where),
    findUniqueOrThrow: async (args: any = {}) => {
      const row = findOneRaw(table, args.where);
      if (!row) throw new Error(`${table} not found`);
      return row;
    },
    count: async (args: any = {}) => {
      const params: unknown[] = [];
      const row = getSqlite().prepare(`SELECT COUNT(*) AS c FROM "${table}" WHERE ${buildWhere(table, args.where, params)}`).get(...(params as never[])) as { c: number };
      return Number(row.c);
    },
    create: async (args: any = {}) => {
      const row = insertRow(table, args.data);
      return applySelectInclude(table, row, args);
    },
    createMany: async (args: any = {}) => {
      let count = 0;
      for (const d of args.data) { insertRow(table, d); count++; }
      return { count };
    },
    update: async (args: any = {}) => {
      updateRows(table, args.where, args.data);
      const row = findOneRaw(table, args.where);
      return row ? applySelectInclude(table, row, args) : row;
    },
    updateMany: async (args: any = {}) => ({ count: updateRows(table, args.where, args.data) }),
    delete: async (args: any = {}) => {
      const row = findOneRaw(table, args.where);
      const params: unknown[] = [];
      getSqlite().prepare(`DELETE FROM "${table}" WHERE ${buildWhere(table, args.where, params)}`).run(...(params as never[]));
      return row;
    },
    deleteMany: async (args: any = {}) => {
      const params: unknown[] = [];
      const info = getSqlite().prepare(`DELETE FROM "${table}" WHERE ${buildWhere(table, args.where, params)}`).run(...(params as never[]));
      return { count: Number(info.changes) };
    },
  };
}

const client: any = {};
for (const [prop, table] of Object.entries(MODELS)) client[prop] = makeModel(table);
client.$transaction = async (fn: (tx: any) => Promise<unknown>) => {
  getSqlite().exec("BEGIN IMMEDIATE");
  try {
    const result = await fn(client);
    getSqlite().exec("COMMIT");
    return result;
  } catch (e) {
    getSqlite().exec("ROLLBACK");
    throw e;
  }
};
client.$disconnect = async () => undefined;

/**
 * Hosted (Netlify) deployments set DATABASE_PROVIDER=postgresql with
 * Supabase DATABASE_URL/DIRECT_URL: use the real generated Prisma client.
 * Locally, fall back to the SQLite implementation above.
 */
const usePostgres =
  process.env.DATABASE_PROVIDER === "postgresql" ||
  /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "");

function createPrismaClient(): any {
  // The client comes from the static import above so the dependency is
  // visible to the bundler; the wrapper keeps the loosely-typed `Database`
  // surface the rest of the app is written against.
  // Production Postgres may lag the app schema (missing columns/table from
  // the latest release): wrap reads so they retry without the new fields
  // instead of crashing every page. See schema-compat.ts.
  return wrapPrismaForMissingSchema(new PrismaClient());
}

export const db: Database = usePostgres ? createPrismaClient() : (client as Database);
