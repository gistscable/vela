/**
 * Schema-compatibility layer for a database that lags the application schema.
 *
 * Production Postgres was not migrated when the admin-controls / extra-products
 * release shipped, so it is missing:
 *   - `User.historyPaused`, `User.historyPausedAt`, `User.historyPausedById`,
 *     `User.accessLocked`, `User.lockReason`, `User.lockedById`, `User.lockedAt`
 *   - `Card.kind`, `Card.creditLimit`
 *   - the whole `ProductApplication` table
 *
 * Prisma selects every column of a model by default, so a plain
 * `db.user.findUnique(...)` fails with P2022 ("column does not exist") and any
 * `ProductApplication` read fails with P2021 ("table does not exist") — which
 * is what took the dashboard down.
 *
 * `wrapPrismaForMissingSchema` wraps the hosted (Postgres) Prisma client so
 * that *reads* survive that lag:
 *   1. a read that fails with a missing-column error is retried once with an
 *      explicit legacy `select` (every pre-migration scalar field, and the
 *      same for nested relations), with the new fields also stripped from
 *      `where` / `orderBy` / nested selects, and
 *   2. a read of a missing `ProductApplication` table behaves as if the table
 *      existed but were empty (`[]` / `null` / `0`).
 *
 * Retried rows are filled with the schema defaults for the missing fields
 * (`accessLocked: false`, `historyPaused: false`, `kind: "DEBIT"`, …) so
 * callers can keep reading them as booleans/strings.
 *
 * Writes are deliberately *not* masked: creating or updating a row that needs
 * a missing column/table still fails loudly, because silently dropping e.g. an
 * admin lock would be worse than an error. The app therefore keeps working for
 * members on the un-migrated database, while admin actions that genuinely need
 * the new schema keep failing until the migration is applied.
 */

type AnyRecord = Record<string, any>;

/** Fields added by the not-yet-applied migrations, per model. */
export const POST_MIGRATION_FIELDS: Record<string, readonly string[]> = {
  User: [
    "historyPaused",
    "historyPausedAt",
    "historyPausedById",
    "accessLocked",
    "lockReason",
    "lockedById",
    "lockedAt",
  ],
  Card: ["kind", "creditLimit"],
};

/** Scalar fields of every model, in schema order (used to build legacy selects). */
const SCALAR_FIELDS: Record<string, readonly string[]> = {
  User: [
    "id", "email", "username", "usernameNormalized", "passwordHash", "firstName", "lastName",
    "phone", "role", "enrollmentStatus", "enrollmentReviewedById", "enrollmentReviewedAt",
    "mfaEnabled", "totpSecretEncrypted", "totpLastUsedStep", "mfaPendingSecretEncrypted",
    "mfaPendingExpiresAt", "mfaFailedAttempts", "mfaLockedUntil", "historyPaused",
    "historyPausedAt", "historyPausedById", "accessLocked", "lockReason", "lockedById",
    "lockedAt", "createdAt", "updatedAt",
  ],
  Account: ["id", "userId", "type", "name", "accountNumber", "routingNumber", "balance", "status", "apy", "createdAt"],
  Transaction: [
    "id", "accountId", "amount", "type", "category", "description", "counterparty",
    "paymentMethod", "status", "reference", "balanceAfter", "reviewedById", "reviewedAt", "createdAt",
  ],
  Card: ["id", "accountId", "last4", "brand", "kind", "status", "dailyLimit", "spentToday", "creditLimit", "createdAt"],
  ProductApplication: [
    "id", "userId", "kind", "productCode", "status", "linkedAccountId", "nickname",
    "reviewedById", "reviewedAt", "createdAccountId", "createdCardId", "createdAt",
  ],
  Payee: ["id", "userId", "name", "email", "createdAt"],
  BillPayee: ["id", "userId", "name", "category", "accountMask", "encryptedAccountNumber", "createdAt"],
  BillPayment: [
    "id", "userId", "payeeId", "accountId", "amount", "scheduledFor", "frequency", "memo",
    "status", "confirmationNumber", "createdAt",
  ],
  LinkedBank: [
    "id", "userId", "provider", "plaidItemId", "institutionId", "institutionName",
    "encryptedAccessToken", "accountsJson", "createdAt",
  ],
  ExternalAccount: [
    "id", "userId", "institutionName", "nickname", "accountType", "accountMask", "status",
    "microdepositAmount1", "microdepositAmount2", "microdepositExpiresAt",
    "microdepositAttempts", "reviewedById", "reviewedAt", "verifiedAt", "createdAt",
  ],
  FundingIntent: [
    "id", "userId", "accountId", "amount", "status", "provider", "providerSessionId",
    "stripePaymentIntentId", "reference", "createdAt", "updatedAt",
  ],
  MoneyRequest: [
    "id", "requesterId", "recipientId", "recipientEmail", "accountId", "amount", "memo",
    "status", "reference", "createdAt", "updatedAt", "paidAt",
  ],
  ProcessorEvent: ["id", "provider", "type", "createdAt"],
};

/** Relation name -> target model, per model. */
const RELATIONS: Record<string, Record<string, string>> = {
  User: {
    accounts: "Account", payees: "Payee", billPayees: "BillPayee", billPayments: "BillPayment",
    linkedBanks: "LinkedBank", externalAccounts: "ExternalAccount", fundingIntents: "FundingIntent",
    moneyRequestsMade: "MoneyRequest", moneyRequestsReceived: "MoneyRequest",
    productApplications: "ProductApplication",
  },
  Account: {
    user: "User", transactions: "Transaction", cards: "Card", billPayments: "BillPayment",
    fundingIntents: "FundingIntent", moneyRequests: "MoneyRequest",
  },
  Transaction: { account: "Account" },
  Card: { account: "Account" },
  ProductApplication: { user: "User" },
  Payee: { user: "User" },
  BillPayee: { user: "User", payments: "BillPayment" },
  BillPayment: { user: "User", payee: "BillPayee", account: "Account" },
  LinkedBank: { user: "User" },
  ExternalAccount: { user: "User" },
  FundingIntent: { user: "User", account: "Account" },
  MoneyRequest: { requester: "User", recipient: "User", account: "Account" },
  ProcessorEvent: {},
};

/** Prisma delegate property -> model name. */
const DELEGATE_MODELS: Record<string, string> = {
  user: "User",
  account: "Account",
  transaction: "Transaction",
  card: "Card",
  productApplication: "ProductApplication",
  payee: "Payee",
  billPayee: "BillPayee",
  billPayment: "BillPayment",
  linkedBank: "LinkedBank",
  externalAccount: "ExternalAccount",
  fundingIntent: "FundingIntent",
  moneyRequest: "MoneyRequest",
  processorEvent: "ProcessorEvent",
};

/** Schema defaults used to fill fields the old database cannot return. */
const FIELD_DEFAULTS: Record<string, AnyRecord> = {
  User: {
    historyPaused: false, historyPausedAt: null, historyPausedById: null,
    accessLocked: false, lockReason: null, lockedById: null, lockedAt: null,
  },
  Card: { kind: "DEBIT", creditLimit: null },
};

const READ_METHODS = new Set(["findMany", "findFirst", "findUnique", "findUniqueOrThrow", "count"]);
const MAX_RETRIES = 8;

function isPlainObject(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (isPlainObject(value)) {
    const out: AnyRecord = {};
    for (const [key, item] of Object.entries(value)) out[key] = cloneValue(item);
    return out as T;
  }
  return value;
}

function errorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "");
  const err = error as AnyRecord;
  const parts = [typeof err.message === "string" ? err.message : "", typeof err.code === "string" ? err.code : ""];
  if (isPlainObject(err.meta)) {
    for (const value of Object.values(err.meta)) if (typeof value === "string") parts.push(value);
  }
  return parts.join(" ");
}

/** True for Prisma P2021/P2022 and equivalent "column/table does not exist" errors. */
export function isMissingSchemaError(error: unknown): boolean {
  const err = error as AnyRecord | null;
  if (err && (err.code === "P2021" || err.code === "P2022")) return true;
  const text = errorText(error);
  return /does not exist/i.test(text) && /(column|table|relation)/i.test(text);
}

/** True when the error is about a missing table (Prisma P2021) rather than a column. */
export function isMissingTableError(error: unknown): boolean {
  const err = error as AnyRecord | null;
  if (err && err.code === "P2021") return true;
  if (err && err.code === "P2022") return false;
  const text = errorText(error);
  return /does not exist/i.test(text) && /(table|relation)/i.test(text) && !/column/i.test(text);
}

/** Extract the missing column's bare field name (`accessLocked`) from an error, if present. */
export function missingColumnFromError(error: unknown): string | null {
  const err = error as AnyRecord | null;
  // Prisma reports the column in `meta.column` (e.g. "User.accessLocked").
  if (isPlainObject(err?.meta) && typeof err.meta.column === "string") {
    const bare = /([A-Za-z_]\w*)$/.exec(err.meta.column.trim());
    if (bare) return bare[1];
  }
  const match =
    /(?:the\s+)?column\s+`?"?(?:[A-Za-z_][\w]*\.)?([A-Za-z_]\w*)`?"?\s+does not exist/i.exec(errorText(error)) ??
    /column\s+"(?:[^".]+\.)?([^".]+)"/i.exec(errorText(error));
  return match ? match[1] : null;
}

function removedFieldsFor(model: string, extraRemoved: ReadonlySet<string>): Set<string> {
  return new Set([...(POST_MIGRATION_FIELDS[model] ?? []), ...extraRemoved]);
}

function legacySelect(model: string, extraRemoved: ReadonlySet<string>): AnyRecord | null {
  const scalars = SCALAR_FIELDS[model];
  if (!scalars) return null;
  const removed = removedFieldsFor(model, extraRemoved);
  const select: AnyRecord = {};
  for (const field of scalars) if (!removed.has(field)) select[field] = true;
  return select;
}

function sanitizeWhere(where: unknown, model: string, extraRemoved: ReadonlySet<string>): unknown {
  if (!isPlainObject(where)) return cloneValue(where);
  const removed = removedFieldsFor(model, extraRemoved);
  const relations = RELATIONS[model] ?? {};
  const out: AnyRecord = {};
  for (const [key, value] of Object.entries(where)) {
    if (removed.has(key)) continue;
    if ((key === "AND" || key === "OR" || key === "NOT") && (Array.isArray(value) || isPlainObject(value))) {
      const list = Array.isArray(value) ? value : [value];
      const sanitized = list.map((item) => sanitizeWhere(item, model, extraRemoved));
      out[key] = key === "NOT" && !Array.isArray(value) ? sanitized[0] : sanitized;
      continue;
    }
    const target = relations[key];
    if (target && isPlainObject(value)) {
      const wrapperKeys = ["some", "every", "none", "is", "isNot"].filter((k) => k in value);
      if (wrapperKeys.length > 0) {
        const wrapped: AnyRecord = {};
        for (const [innerKey, innerValue] of Object.entries(value)) {
          wrapped[innerKey] = wrapperKeys.includes(innerKey)
            ? sanitizeWhere(innerValue, target, extraRemoved)
            : cloneValue(innerValue);
        }
        out[key] = wrapped;
      } else {
        out[key] = sanitizeWhere(value, target, extraRemoved);
      }
      continue;
    }
    out[key] = cloneValue(value);
  }
  return out;
}

function sanitizeOrderBy(orderBy: unknown, model: string, extraRemoved: ReadonlySet<string>): unknown {
  if (Array.isArray(orderBy)) return orderBy.map((item) => sanitizeOrderBy(item, model, extraRemoved));
  if (!isPlainObject(orderBy)) return cloneValue(orderBy);
  const removed = removedFieldsFor(model, extraRemoved);
  const relations = RELATIONS[model] ?? {};
  const out: AnyRecord = {};
  for (const [key, value] of Object.entries(orderBy)) {
    if (removed.has(key)) continue;
    const target = relations[key];
    out[key] = target && (isPlainObject(value) || Array.isArray(value))
      ? sanitizeOrderBy(value, target, extraRemoved)
      : cloneValue(value);
  }
  return out;
}

/** Sanitize a relation argument (`true` or a nested query-args object) for `target` model rows. */
function sanitizeRelationValue(value: unknown, target: string, extraRemoved: ReadonlySet<string>): unknown {
  if (value === true) {
    const select = legacySelect(target, extraRemoved);
    const hasNewFields = (POST_MIGRATION_FIELDS[target] ?? []).length > 0;
    return hasNewFields && select ? { select } : true;
  }
  if (isPlainObject(value)) return sanitizeModelArgs(value, target, extraRemoved, true);
  return cloneValue(value);
}

/**
 * Clone query args for `model` with every post-migration field removed, and —
 * for row-returning reads — an explicit legacy `select` so Prisma does not ask
 * the old database for columns it does not have.
 */
export function sanitizeArgsForMissingSchema(
  args: unknown,
  model: string,
  extraRemoved: ReadonlySet<string> = new Set(),
  injectSelect = true,
): unknown {
  return sanitizeModelArgs(args, model, extraRemoved, injectSelect);
}

function sanitizeModelArgs(
  args: unknown,
  model: string,
  extraRemoved: ReadonlySet<string>,
  injectSelect: boolean,
): unknown {
  if (!isPlainObject(args)) return cloneValue(args);
  const removed = removedFieldsFor(model, extraRemoved);
  const relations = RELATIONS[model] ?? {};
  const out: AnyRecord = {};

  for (const [key, value] of Object.entries(args)) {
    if (key === "select" && isPlainObject(value)) {
      const select: AnyRecord = {};
      for (const [field, fieldValue] of Object.entries(value)) {
        if (removed.has(field)) continue;
        const target = relations[field];
        select[field] = target ? sanitizeRelationValue(fieldValue, target, extraRemoved) : cloneValue(fieldValue);
      }
      out.select = select;
    } else if (key === "include" && isPlainObject(value)) {
      const include: AnyRecord = {};
      for (const [field, fieldValue] of Object.entries(value)) {
        if (!fieldValue) continue;
        const target = relations[field];
        include[field] = target ? sanitizeRelationValue(fieldValue, target, extraRemoved) : cloneValue(fieldValue);
      }
      out.include = include;
    } else if (key === "where") {
      out.where = sanitizeWhere(value, model, extraRemoved);
    } else if (key === "orderBy") {
      out.orderBy = sanitizeOrderBy(value, model, extraRemoved);
    } else if (key === "distinct") {
      const fields = Array.isArray(value) ? value.filter((f) => typeof f !== "string" || !removed.has(f)) : value;
      if (typeof fields !== "string" || !removed.has(fields)) out.distinct = cloneValue(fields);
    } else if (key === "data" && isPlainObject(value)) {
      const data: AnyRecord = {};
      for (const [field, fieldValue] of Object.entries(value)) if (!removed.has(field)) data[field] = cloneValue(fieldValue);
      out.data = data;
    } else {
      out[key] = cloneValue(value);
    }
  }

  if (injectSelect && !out.select) {
    const select = legacySelect(model, extraRemoved);
    if (select) {
      // Prisma rejects `select` + `include` together: fold the includes into
      // the select (each already sanitized for its target model above).
      if (isPlainObject(out.include)) {
        for (const [field, fieldValue] of Object.entries(out.include)) select[field] = fieldValue;
        delete out.include;
      }
      out.select = select;
    }
  }
  return out;
}

/** Fill schema defaults for fields the old database could not return. */
export function withSchemaDefaults<T>(value: T, model: string): T {
  if (Array.isArray(value)) return value.map((item) => withSchemaDefaults(item, model)) as T;
  if (!isPlainObject(value)) return value;
  const out: AnyRecord = { ...value };
  // Only full rows (they carry `id`) get defaults; partial selects stay partial
  // unless they are the top-level rows handled by the caller.
  if ("id" in out) {
    for (const [field, fallback] of Object.entries(FIELD_DEFAULTS[model] ?? {})) {
      if (!(field in out)) out[field] = fallback;
    }
  }
  const relations = RELATIONS[model] ?? {};
  for (const [field, target] of Object.entries(relations)) {
    if (field in out) out[field] = withSchemaDefaults(out[field], target);
  }
  return out as T;
}

function emptyResultFor(method: string): unknown {
  if (method === "findMany") return [];
  if (method === "count") return 0;
  return null; // findFirst / findUnique / findUniqueOrThrow: no rows to give
}

function wrapDelegate<T extends object>(delegate: T, model: string, delegateName: string): T {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string" || !READ_METHODS.has(prop)) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      const method = prop;
      return async (...args: unknown[]) => {
        try {
          return withSchemaDefaults(await value.apply(target, args), model);
        } catch (error) {
          if (!isMissingSchemaError(error)) throw error;
          if (isMissingTableError(error)) {
            if (model === "ProductApplication" || delegateName === "productApplication") {
              return emptyResultFor(method);
            }
            throw error;
          }
          // Missing column(s): retry without the post-migration fields. Loop
          // because a different (e.g. nested or not-yet-listed) column may be
          // reported on the next attempt; each pass removes at least the field
          // named by the latest error in addition to the known new fields.
          const extraRemoved = new Set<string>();
          let lastError: unknown = error;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const field = missingColumnFromError(lastError);
            if (field) extraRemoved.add(field);
            const sanitized = sanitizeModelArgs(args[0], model, extraRemoved, method !== "count");
            const retryArgs = args.length > 0 ? [sanitized, ...args.slice(1)] : [sanitized];
            try {
              return withSchemaDefaults(await value.apply(target, retryArgs), model);
            } catch (retryError) {
              if (!isMissingSchemaError(retryError)) throw retryError;
              if (isMissingTableError(retryError)) {
                if (model === "ProductApplication" || delegateName === "productApplication") {
                  return emptyResultFor(method);
                }
                throw retryError;
              }
              const nextField = missingColumnFromError(retryError);
              if (nextField && extraRemoved.has(nextField) && attempt > 0 && nextField === field) throw retryError;
              lastError = retryError;
            }
          }
          throw lastError;
        }
      };
    },
  });
}

/**
 * Wrap a Prisma-like client so reads tolerate a database that is missing the
 * post-migration columns/table described above. Non-read methods, `$transaction`
 * callbacks (whose transaction client is wrapped in turn) and everything else
 * pass through untouched.
 */
export function wrapPrismaForMissingSchema<T>(client: T): T {
  if (!client || typeof client !== "object") return client;
  const wrappedDelegates = new Map<string, unknown>();
  return new Proxy(client as AnyRecord, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "$transaction" && typeof value === "function") {
        return async (...args: unknown[]) => {
          if (typeof args[0] === "function") {
            const callback = args[0] as (tx: unknown) => unknown;
            return value.apply(target, [(tx: unknown) => callback(wrapPrismaForMissingSchema(tx)), ...args.slice(1)]);
          }
          return value.apply(target, args);
        };
      }
      if (typeof prop === "string" && prop in DELEGATE_MODELS && value && typeof value === "object") {
        if (!wrappedDelegates.has(prop)) {
          wrappedDelegates.set(prop, wrapDelegate(value as object, DELEGATE_MODELS[prop], prop));
        }
        return wrappedDelegates.get(prop);
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as T;
}
