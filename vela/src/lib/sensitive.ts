import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM encryption for secrets at rest (TOTP secrets, tokens). */

function key(): Buffer {
  const material = process.env.APP_ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? "first-meridian-dev-encryption-key";
  return createHash("sha256").update(material).digest();
}

export function encryptSensitive(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decryptSensitive(payload: string): string {
  const [iv, tag, data] = payload.split(":");
  if (!iv || !tag || !data) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
