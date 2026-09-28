import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class CredentialDecryptionError extends Error {
  constructor() {
    super("Stored credential could not be authenticated with the configured encryption key.");
    this.name = "CredentialDecryptionError";
  }
}

function encryptionKey() {
  const configured = process.env.CLIENT_CREDENTIALS_ENCRYPTION_KEY;
  if (!configured)
    throw new Error("CLIENT_CREDENTIALS_ENCRYPTION_KEY is not configured");
  const key = /^[a-f\d]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.length !== 32)
    throw new Error("Credential encryption key must decode to 32 bytes");
  return key;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(ciphertext: string, iv: string, tag: string) {
  const key = encryptionKey();
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new CredentialDecryptionError();
  }
}

export function encryptCredential(value: string) {
  const encrypted = encryptSecret(value);
  return {
    passwordCiphertext: encrypted.ciphertext,
    passwordIv: encrypted.iv,
    passwordTag: encrypted.tag,
  };
}

export function decryptCredential(ciphertext: string, iv: string, tag: string) {
  return decryptSecret(ciphertext, iv, tag);
}
