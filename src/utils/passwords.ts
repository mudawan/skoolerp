// Salted, iterated password hashing using the Web Crypto API (PBKDF2-HMAC-SHA256)
// with pure-JS fallback for environments where crypto.subtle is restricted or unavailable.
//
// Stored format: `pbkdf2$<iterations>$<saltHex>$<hashHex>`

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

// Pure JavaScript SHA-256 fallback implementation for non-secure / restricted contexts
function jsSha256(data: Uint8Array | string): Uint8Array {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const byteLength = bytes.length;
  const bitLength = byteLength * 8;

  const buffer = new Uint8Array((((byteLength + 8) >> 6) + 1) * 64);
  buffer.set(bytes);
  buffer[byteLength] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(buffer.length - 4, bitLength, false);
  view.setUint32(buffer.length - 8, Math.floor(bitLength / 0x100000000), false);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const w = new Uint32Array(64);
  for (let chunk = 0; chunk < buffer.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(chunk + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = hash[0], b = hash[1], c = hash[2], d = hash[3], e = hash[4], f = hash[5], g = hash[6], h = hash[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, hash[i], false);
  return out;
}

function jsHmacSha256(key: Uint8Array | string, data: Uint8Array | string): Uint8Array {
  let keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (keyBytes.length > 64) keyBytes = jsSha256(keyBytes);
  const block = new Uint8Array(64);
  block.set(keyBytes);
  const oKeyPad = new Uint8Array(64);
  const iKeyPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = block[i] ^ 0x5c;
    iKeyPad[i] = block[i] ^ 0x36;
  }
  const inner = new Uint8Array(64 + dataBytes.length);
  inner.set(iKeyPad);
  inner.set(dataBytes, 64);
  const innerHash = jsSha256(inner);
  const outer = new Uint8Array(64 + 32);
  outer.set(oKeyPad);
  outer.set(innerHash, 64);
  return jsSha256(outer);
}

function jsPbkdf2Derive(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  const passBytes = new TextEncoder().encode(password);
  const block1 = new Uint8Array(salt.length + 4);
  block1.set(salt);
  block1[salt.length + 3] = 1; // block index 1
  let u = jsHmacSha256(passBytes, block1);
  const result = new Uint8Array(u);
  for (let i = 1; i < iterations; i++) {
    u = jsHmacSha256(passBytes, u);
    for (let j = 0; j < 32; j++) result[j] ^= u[j];
  }
  return result;
}

async function pbkdf2Derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (globalThis.crypto?.subtle) {
    try {
      const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const bits = await globalThis.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: HASH_ALGO },
        keyMaterial,
        HASH_BITS
      );
      return new Uint8Array(bits);
    } catch {
      // Fall through to pure-JS
    }
  }
  return jsPbkdf2Derive(password, salt, iterations);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Hashes a plaintext password into the storable `pbkdf2$iterations$salt$hash` format. */
export const hashPassword = async (plainPassword: string): Promise<string> => {
  const salt = new Uint8Array(SALT_BYTES);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(salt);
  } else {
    for (let i = 0; i < SALT_BYTES; i++) {
      salt[i] = Math.floor(Math.random() * 256);
    }
  }
  const derived = await pbkdf2Derive(plainPassword, salt, PBKDF2_ITERATIONS);
  return `${FORMAT_TAG}$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
};

/** Verifies a plaintext password against a stored `pbkdf2$...` hash or legacy password. */
export const verifyPassword = async (input: string, stored?: string): Promise<boolean> => {
  if (!stored) return false;
  
  // Direct legacy plaintext match (or demo match)
  if (stored === input || (!stored.startsWith('pbkdf2$') && stored === input)) {
    return true;
  }

  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== FORMAT_TAG) {
    return stored === input;
  }

  const [, iterationsStr, saltHex, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(hashHex);
  if (salt.length !== SALT_BYTES || expected.length === 0) return false;
  
  try {
    const derived = await pbkdf2Derive(input, salt, iterations);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
};

