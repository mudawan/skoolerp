// Salted, iterated password hashing using the Web Crypto API (PBKDF2-HMAC-SHA256).
//
// Stored format: `pbkdf2$<iterations>$<saltHex>$<hashHex>`
// Self-describing so the iteration count can be raised later without
// invalidating existing hashes — each hash is verified against the
// iteration count embedded in it, not a global constant.
//
// No legacy/plaintext fallback: every account in this build is created
// through hashPassword(), so there is nothing older to stay compatible with.
// crypto.subtle requires a secure context (HTTPS or localhost); if it is
// unavailable we fail loudly rather than silently downgrading to a weaker
// hash.

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const HASH_ALGO = 'SHA-256';
const FORMAT_TAG = 'pbkdf2';

export const MIN_PASSWORD_LENGTH = 6;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function requireSubtleCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'Web Crypto API is unavailable in this context. Password hashing requires a secure ' +
        'context (HTTPS or localhost) — refusing to fall back to a weaker hash.'
    );
  }
  return globalThis.crypto.subtle;
}

async function pbkdf2Derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = requireSubtleCrypto();
  const keyMaterial = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: HASH_ALGO },
    keyMaterial,
    HASH_BITS
  );
  return new Uint8Array(bits);
}

// Constant-time comparison so a mismatch doesn't leak timing info via
// early-exit comparison (defense in depth; the salt/iterations already do
// the heavy lifting against offline attacks).
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Hashes a plaintext password into the storable `pbkdf2$iterations$salt$hash` format. */
export const hashPassword = async (plainPassword: string): Promise<string> => {
  const subtle = requireSubtleCrypto();
  void subtle; // ensures the secure-context check runs before generating a salt
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2Derive(plainPassword, salt, PBKDF2_ITERATIONS);
  return `${FORMAT_TAG}$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
};

/** Verifies a plaintext password against a stored `pbkdf2$...` hash. */
export const verifyPassword = async (input: string, stored?: string): Promise<boolean> => {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== FORMAT_TAG) return false;
  const [, iterationsStr, saltHex, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(hashHex);
  if (salt.length !== SALT_BYTES || expected.length === 0) return false;
  const derived = await pbkdf2Derive(input, salt, iterations);
  return timingSafeEqual(derived, expected);
};
