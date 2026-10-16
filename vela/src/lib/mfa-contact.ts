/**
 * Masked contact hints for the MFA method-choice screen.
 *
 * These helpers are the only place a registered phone number or email address is turned into
 * something safe to render. The screen receives the returned strings and never the raw values.
 *
 * "Registered" is not "verified": nothing here implies ownership has been confirmed, that a code
 * was sent, or that a destination is ready to receive one.
 */

const BULLETS = "•••";

/** Fewer digits than this and four of them would reveal most of the number. */
export const MIN_PHONE_DIGITS_TO_MASK = 8;

export const NO_PHONE_REGISTERED = "No phone number registered";
export const NO_EMAIL_REGISTERED = "No email address registered";

export type MfaContactHints = {
  /** Last four digits only (rendered as "Phone ending in 1234"); null when no phone can be masked safely. */
  phoneLastFour: string | null;
  /** `j•••@example.com`, or null when no usable email is registered. */
  emailMasked: string | null;
};

/** Last four digits of a phone number, or null if it is missing or too short to mask safely. */
export function phoneLastFour(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS_TO_MASK) return null;
  return digits.slice(-4);
}

/** `j•••@example.com`. A fixed number of bullets avoids leaking the local part's length. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (/\s/.test(trimmed) || !domain.includes(".")) return null;
  const [first] = Array.from(local);
  // A one-character local part would be revealed in full by showing its first character.
  return `${Array.from(local).length > 1 ? first : ""}${BULLETS}@${domain}`;
}

/** Build the masked hints from a user record. Accepts only the two contact fields on purpose. */
export function buildMfaContactHints(contact: { email?: string | null; phone?: string | null }): MfaContactHints {
  return {
    phoneLastFour: phoneLastFour(contact.phone),
    emailMasked: maskEmail(contact.email),
  };
}
