import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export function isPasswordHash(value) {
  return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${HASH_PREFIX}$${salt}$${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, storedValue) {
  if (!storedValue) {
    return false;
  }

  if (!isPasswordHash(storedValue)) {
    return password === storedValue;
  }

  const [, salt, expectedHex] = storedValue.split('$');
  if (!salt || !expectedHex) {
    return false;
  }

  const derived = await scrypt(password, salt, KEY_LENGTH);
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(derived);

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}
