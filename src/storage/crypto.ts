import type { EncryptedEnvelope } from "../core/types";

export const DEFAULT_KDF_ITERATIONS = 250_000;
// v1 exports use 250k. Bound untrusted imports before WebCrypto starts work.
export const MAX_KDF_ITERATIONS = 1_000_000;

export class InvalidEncryptedPayloadError extends Error {
  constructor() { super("Invalid encrypted DeepRole payload"); this.name = "InvalidEncryptedPayloadError"; }
}

function validateKdf(salt: Uint8Array, iterations: number): void {
  if (salt.byteLength !== 16 || !Number.isInteger(iterations) || iterations < 1 || iterations > MAX_KDF_ITERATIONS) {
    throw new InvalidEncryptedPayloadError();
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  iterations = DEFAULT_KDF_ITERATIONS,
): Promise<CryptoKey> {
  if (!password) throw new Error("Password is required");
  validateKdf(salt, iterations);
  const material = await crypto.subtle.importKey(
    "raw",
    asBuffer(new TextEncoder().encode(password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: asBuffer(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(
  value: unknown,
  password: string,
  iterations = DEFAULT_KDF_ITERATIONS,
): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey(password, salt, iterations);
  return encryptJsonWithKey(value, key, salt, iterations);
}

export async function encryptJsonWithKey(
  value: unknown,
  key: CryptoKey,
  salt: Uint8Array,
  iterations = DEFAULT_KDF_ITERATIONS,
): Promise<EncryptedEnvelope> {
  validateKdf(salt, iterations);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBuffer(iv) },
    key,
    asBuffer(encoded),
  );
  return {
    format: "deeprole-encrypted",
    version: 1,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson<T>(envelope: EncryptedEnvelope, password: string): Promise<T> {
  const decoded = validateEnvelope(envelope);
  const key = await deriveVaultKey(password, decoded.salt, envelope.iterations);
  return decryptDecoded<T>(decoded, key);
}

export async function decryptJsonWithKey<T>(envelope: EncryptedEnvelope, key: CryptoKey): Promise<T> {
  return decryptDecoded<T>(validateEnvelope(envelope), key);
}

async function decryptDecoded<T>(decoded: DecodedEnvelope, key: CryptoKey): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBuffer(decoded.iv) },
    key,
    asBuffer(decoded.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export async function exportKey(key: CryptoKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    asBuffer(base64ToBytes(raw)),
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"],
  );
}

export function decodeSalt(value: string): Uint8Array {
  return base64ToBytes(value);
}

export function encodeSalt(value: Uint8Array): string {
  return bytesToBase64(value);
}

interface DecodedEnvelope { salt: Uint8Array; iv: Uint8Array; ciphertext: Uint8Array }

function validateEnvelope(value: EncryptedEnvelope): DecodedEnvelope {
  if (
    value?.format !== "deeprole-encrypted" ||
    value.version !== 1 ||
    value.algorithm !== "AES-256-GCM" ||
    value.kdf !== "PBKDF2-SHA-256" ||
    typeof value.iv !== "string" || value.iv.length > 32 ||
    typeof value.salt !== "string" || value.salt.length > 48 ||
    typeof value.ciphertext !== "string" ||
    !Number.isInteger(value.iterations) || value.iterations < 1 || value.iterations > MAX_KDF_ITERATIONS
  ) {
    throw new InvalidEncryptedPayloadError();
  }
  try {
    const salt = base64ToBytes(value.salt);
    const iv = base64ToBytes(value.iv);
    const ciphertext = base64ToBytes(value.ciphertext);
    validateKdf(salt, value.iterations);
    if (iv.byteLength !== 12 || ciphertext.byteLength < 16) throw new InvalidEncryptedPayloadError();
    return { salt, iv, ciphertext };
  } catch { throw new InvalidEncryptedPayloadError(); }
}
