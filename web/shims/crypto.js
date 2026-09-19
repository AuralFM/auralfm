/**
 * The four `node:crypto` calls AuralFM's messaging makes, on the browser's own
 * random source and the @noble hashes the desktop app already ships.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { scrypt } from "@noble/hashes/scrypt.js";
import { Buffer } from "./buffer.js";

const bytes = (d) => (typeof d === "string" ? new TextEncoder().encode(d) : d);

export function createHash(alg) {
  if (alg !== "sha256") throw new Error(`crypto shim: ${alg} is not supported`);
  const parts = [];
  return {
    update(d) { parts.push(bytes(d)); return this; },
    digest(encoding) {
      const out = Buffer.from(sha256(Buffer.concat(parts)));
      return encoding ? out.toString(encoding) : out;
    },
  };
}

export function randomBytes(n) {
  const out = new Buffer(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Uniform in [min, max), by rejection — a plain modulo would favour low values. */
export function randomInt(min, max) {
  const range = max - min;
  const limit = Math.floor(0x100000000 / range) * range;
  const u = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(u); while (u[0] >= limit);
  return min + (u[0] % range);
}

export function scryptSync(password, salt, keylen, { N, r, p, maxmem } = {}) {
  return Buffer.from(scrypt(bytes(password), bytes(salt), { N, r, p, dkLen: keylen, maxmem }));
}

export default { createHash, randomBytes, randomInt, scryptSync };
