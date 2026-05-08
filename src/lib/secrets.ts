import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1:";

function secretKey() {
  const source =
    process.env.WARHORSE_SECRET_KEY ||
    process.env.CLYDESDALE_SECRET_KEY ||
    process.env.WEBHOOK_SIGNING_SECRET ||
    process.env.DATABASE_URL ||
    "warhorse-local-dev-secret";
  return createHash("sha256").update(source).digest();
}

export function encryptSecret(value: string) {
  if (!value || value.startsWith(PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

export function decryptSecret(value?: string | null) {
  if (!value) return undefined;
  if (!value.startsWith(PREFIX)) return value;
  const payload = Buffer.from(value.slice(PREFIX.length), "base64url");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskSecret(value?: string | null) {
  const decrypted = decryptSecret(value);
  if (!decrypted) return "No key saved";
  return `${decrypted.slice(0, 3)}••••••••${decrypted.slice(-4)}`;
}
