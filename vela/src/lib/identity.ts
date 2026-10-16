/**
 * Username / User ID persistence helpers shared by sign-in, enrollment and settings.
 *
 * They take the data layer as a parameter so they can run against the app database or a
 * disposable one in tests, and so this module needs no server-only imports.
 */
import type { Database, User } from "@/lib/db";
import { validateUsername, normalizeUsername } from "@/lib/username";

export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return Boolean(e && (e.code === "P2002" || /UNIQUE constraint failed|duplicate key value/i.test(e.message ?? "")));
}

/**
 * Resolve the person signing in from what they typed.
 *
 *  - Contains "@"  -> email (usernames can never contain "@", so there is no ambiguity).
 *  - Otherwise     -> Username / User ID, then email as a fallback so an older user whose stored
 *                     email has no "@" is not locked out.
 *
 * Existing users who have no username yet are found by email exactly as before.
 */
export async function findUserByLoginIdentifier(db: Pick<Database, "user">, raw: string): Promise<User | null> {
  const identifier = normalizeUsername(raw);
  if (!identifier) return null;
  if (!identifier.includes("@")) {
    const byUsername = await db.user.findUnique({ where: { usernameNormalized: identifier } });
    if (byUsername) return byUsername;
  }
  return db.user.findUnique({ where: { email: identifier } });
}

export async function isUsernameTaken(db: Pick<Database, "user">, normalized: string): Promise<boolean> {
  // An email can never equal a username (usernames have no "@"), but a legacy malformed email can.
  const clash = await db.user.findFirst({ where: { OR: [{ usernameNormalized: normalized }, { email: normalized }] } });
  return Boolean(clash);
}

export type SetUsernameResult = { ok: true; username: string } | { ok: false; error: string };

const UNAVAILABLE = "That Username / User ID is not available. Choose another.";

/** Validate and claim a username for a user who does not have one. Never overwrites an existing one. */
export async function claimUsername(db: Pick<Database, "user">, userId: string, raw: unknown): Promise<SetUsernameResult> {
  const parsed = validateUsername(raw);
  if (!parsed.ok) return parsed;
  const current = await db.user.findUnique({ where: { id: userId } });
  if (!current) return { ok: false, error: "We couldn't find your profile." };
  if (current.usernameNormalized) return { ok: false, error: "Your Username / User ID is already set and cannot be changed here." };
  if (await isUsernameTaken(db, parsed.normalized)) return { ok: false, error: UNAVAILABLE };
  try {
    // Guarded on "still no username" so a concurrent request cannot replace one that was just set.
    const { count } = await db.user.updateMany({
      where: { id: userId, usernameNormalized: null },
      data: { username: parsed.username, usernameNormalized: parsed.normalized },
    });
    if (count !== 1) return { ok: false, error: "Your Username / User ID is already set and cannot be changed here." };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: UNAVAILABLE };
    throw error;
  }
  return { ok: true, username: parsed.username };
}

export { UNAVAILABLE as USERNAME_UNAVAILABLE_MESSAGE };
