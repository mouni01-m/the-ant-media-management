import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Module } from "node:module";
import { dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const sourcePath = fileURLToPath(new URL("../lib/client-credentials.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const credentialModule = new Module(sourcePath);
credentialModule.filename = sourcePath;
credentialModule.paths = Module._nodeModulePaths(dirname(sourcePath));
credentialModule._compile(compiled, sourcePath);
const { CredentialDecryptionError, decryptSecret, encryptSecret } = credentialModule.exports;
const testValue = "non-production-refresh-token-test-value";

function setTestKey() {
  process.env.CLIENT_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
}

function expectDecryptionFailure(payload) {
  assert.throws(
    () => decryptSecret(payload.ciphertext, payload.iv, payload.tag),
    CredentialDecryptionError,
  );
}

test("AES-256-GCM credential round trip", () => {
  setTestKey();
  const payload = encryptSecret(testValue);
  assert.equal(decryptSecret(payload.ciphertext, payload.iv, payload.tag), testValue);
});

test("wrong key is rejected without exposing plaintext", () => {
  setTestKey();
  const payload = encryptSecret(testValue);
  setTestKey();
  expectDecryptionFailure(payload);
});

test("malformed payload is rejected", () => {
  setTestKey();
  expectDecryptionFailure({ ciphertext: "%%%", iv: "%%%", tag: "%%%" });
});

test("missing IV is rejected", () => {
  setTestKey();
  const payload = encryptSecret(testValue);
  expectDecryptionFailure({ ...payload, iv: "" });
});

test("missing authentication tag is rejected", () => {
  setTestKey();
  const payload = encryptSecret(testValue);
  expectDecryptionFailure({ ...payload, tag: "" });
});

test("invalid ciphertext is rejected", () => {
  setTestKey();
  const payload = encryptSecret(testValue);
  const ciphertextBytes = Buffer.from(payload.ciphertext, "base64");
  ciphertextBytes[0] ^= 1;
  const corruptedCiphertext = ciphertextBytes.toString("base64");
  expectDecryptionFailure({ ...payload, ciphertext: corruptedCiphertext });
});

test("missing encryption key remains a configuration error", () => {
  delete process.env.CLIENT_CREDENTIALS_ENCRYPTION_KEY;
  assert.throws(
    () => encryptSecret(testValue),
    /CLIENT_CREDENTIALS_ENCRYPTION_KEY is not configured/,
  );
});
