/**
 * Username / User ID rules. Pure and dependency-free so the same code runs in server actions,
 * scripts and tests.
 *
 * The username is a login identifier that is deliberately separate from the internal database
 * `User.id`. Two forms are kept: the spelling the user typed (`username`, for display) and a
 * lower-cased `usernameNormalized` that carries the database unique constraint.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

/** Letters, digits, ".", "_" and "-"; must start and end with a letter or digit. */
const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/** Names that look like system or staff identities and are never handed out at enrollment. */
const RESERVED = new Set([
  "admin", "administrator", "root", "system", "support", "security", "staff", "service",
  "fmb", "null", "undefined", "anonymous", "postmaster", "webmaster",
]);

export type UsernameResult =
  | { ok: true; username: string; normalized: string }
  | { ok: false; error: string };

/** Canonical form used for lookups and the unique index. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: unknown): UsernameResult {
  const username = typeof raw === "string" ? raw.trim() : "";
  if (!username) return { ok: false, error: "Enter a Username / User ID." };
  if (username.includes("@")) {
    return { ok: false, error: "Your Username / User ID cannot contain \"@\". Email addresses are entered separately." };
  }
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return { ok: false, error: `Your Username / User ID must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters.` };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      error: "Use only letters, numbers, periods, underscores and hyphens, starting and ending with a letter or number.",
    };
  }
  const normalized = normalizeUsername(username);
  if (RESERVED.has(normalized)) return { ok: false, error: "That Username / User ID is not available. Choose another." };
  return { ok: true, username, normalized };
}
