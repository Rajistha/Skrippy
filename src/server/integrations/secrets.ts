import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Kunci enkripsi diturunkan dari rahasia server yang sudah ada; tidak ada kunci baru untuk dikelola. */
function key(secret: string): Buffer {
  return createHash("sha256").update(`skrippy-integration-secrets:${secret}`).digest();
}

/** AES-256-GCM. Format: base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptSecret(payload: string, secret: string): string {
  const raw = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12), {
    authTagLength: 16,
  });
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** Empat karakter terakhir, satu-satunya bagian kunci yang boleh tampil di UI. */
export const secretHint = (plain: string): string => `…${plain.trim().slice(-4)}`;
