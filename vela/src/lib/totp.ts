import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 TOTP (Google Authenticator-compatible), 30s step, 6 digits. */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(secret: string): Buffer {
  const text = secret.replace(/[\s-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCodeAt(secret: string, step: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(msg).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export function currentTotpStep(date = new Date()): number {
  return Math.floor(date.getTime() / 1000 / 30);
}

/** Returns the matched step (for replay protection) or null. Window: ±1 step. */
export function verifyTotp(secret: string, code: string, afterStep?: number | null): number | null {
  const cleaned = String(code ?? "").replace(/\D/g, "");
  if (cleaned.length !== 6) return null;
  const now = currentTotpStep();
  for (const step of [now, now - 1, now + 1]) {
    if (afterStep !== null && afterStep !== undefined && step <= afterStep) continue;
    const expected = totpCodeAt(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(cleaned))) return step;
  }
  return null;
}

export function totpProvisioningUri(email: string, secret: string): string {
  const issuer = "First Meridian";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
