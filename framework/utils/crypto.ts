/**
 * Hex-keyed authenticated encryption for the credentials kept in env/.
 *
 *   Key     32 random bytes as 64 hex chars, from $STRING_HEX_SHOPLITE
 *   KDF     HKDF-SHA256 with a fresh 256-bit salt per token -> one-off AES key
 *   Cipher  AES-256-GCM, fresh 96-bit IV, 128-bit auth tag
 *   Token   enc1.<salt>.<iv>.<ciphertext>.<tag>, each part base64url
 *
 * A wrong key or an edited byte throws instead of returning garbage.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export const KEY_ENV_VAR = 'STRING_HEX_SHOPLITE';

const VERSION = 'enc1';
const KEY_BYTES = 32;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_INFO = Buffer.from(`agentic-qa/${VERSION}/aes-256-gcm`, 'utf8');
const AAD = Buffer.from(VERSION, 'utf8');

/** A fresh 256-bit key as hex, from the OS CSPRNG. */
export function generateKey(): string {
  return randomBytes(KEY_BYTES).toString('hex');
}

/** Whether a string looks like a token from {@link encrypt}. */
export function isEncrypted(value: string): boolean {
  return value.trim().startsWith(`${VERSION}.`);
}

/** Encrypt UTF-8 text into an `enc1.…` token. */
export function encrypt(plaintext: string, hexKey: string = keyFromEnv()): string {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(hexKey, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, ...[salt, iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString('base64url'))].join(
      '.',
    );
  } finally {
    key.fill(0);
  }
}

/** Decrypt an `enc1.…` token. Throws on a wrong key, a malformed token or tampering. */
export function decrypt(token: string, hexKey: string = keyFromEnv()): string {
  const parts = token.trim().split('.');
  if (parts.length !== 5 || parts[0] !== VERSION)
    throw new Error(`not an ${VERSION} token (expected ${VERSION}.<salt>.<iv>.<ciphertext>.<tag>)`);
  const [, saltPart, ivPart, ciphertextPart, tagPart] = parts as [string, string, string, string, string];
  const salt = fromBase64Url(saltPart, 'salt', SALT_BYTES);
  const iv = fromBase64Url(ivPart, 'iv', IV_BYTES);
  const ciphertext = fromBase64Url(ciphertextPart, 'ciphertext');
  const tag = fromBase64Url(tagPart, 'tag', TAG_BYTES);

  const key = deriveKey(hexKey, salt);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('decryption failed: wrong key, or the token was corrupted or tampered with');
  } finally {
    key.fill(0);
  }
}

/** The master key from $STRING_HEX_SHOPLITE. */
export function keyFromEnv(): string {
  const value = process.env[KEY_ENV_VAR];
  if (value === undefined || value.trim() === '')
    throw new Error(`$${KEY_ENV_VAR} is not set (the demo key is in README.md, under "Quick start")`);
  return value;
}

function deriveKey(hexKey: string, salt: Buffer): Buffer {
  const master = parseKey(hexKey);
  try {
    return Buffer.from(hkdfSync('sha256', master, salt, HKDF_INFO, KEY_BYTES));
  } finally {
    master.fill(0);
  }
}

/** Exactly 32 bytes of hex; whitespace, a 0x prefix and either case are tolerated. */
function parseKey(hexKey: string): Buffer {
  const normalized = hexKey.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== KEY_BYTES * 2)
    throw new Error(`${KEY_ENV_VAR}: key must be exactly ${KEY_BYTES * 2} hex characters (${KEY_BYTES} bytes)`);
  return Buffer.from(normalized, 'hex');
}

function fromBase64Url(value: string, field: string, expectedBytes?: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`token: ${field} is not valid base64url`);
  const buffer = Buffer.from(value, 'base64url');
  if (expectedBytes !== undefined && buffer.length !== expectedBytes)
    throw new Error(`token: ${field} must be ${expectedBytes} bytes, got ${buffer.length}`);
  return buffer;
}
