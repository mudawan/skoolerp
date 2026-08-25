export const sha256Hex = async (text: string): Promise<string> => {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(text);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `fb$${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
};

export const MIN_PASSWORD_LENGTH = 6;

export const verifyPassword = async (
  input: string,
  stored?: string
): Promise<{ ok: boolean; legacyPlaintext: boolean }> => {
  if (!stored) return { ok: false, legacyPlaintext: false };
  const digest = await sha256Hex(input);
  if (digest === stored) return { ok: true, legacyPlaintext: false };
  if (input === stored) return { ok: true, legacyPlaintext: true };
  return { ok: false, legacyPlaintext: false };
};
