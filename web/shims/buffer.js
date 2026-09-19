/**
 * Enough of Node's Buffer for AuralFM's messaging code, and no more.
 *
 * The desktop modules use Buffer for exactly four things: hex, base64 and UTF-8
 * conversion, and concatenation. A Uint8Array subclass covers all of them, so
 * the bundle does not ship a 20 KB polyfill for methods nothing calls. esbuild
 * injects this wherever the code names `Buffer`.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export class Buffer extends Uint8Array {
  static from(x, encoding) {
    if (typeof x === "string") {
      if (encoding === "hex") {
        const out = new Buffer(x.length >> 1);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(x.substr(i * 2, 2), 16);
        return out;
      }
      if (encoding === "base64") {
        const bin = atob(x);
        const out = new Buffer(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      }
      const bytes = enc.encode(x);
      const out = new Buffer(bytes.length);
      out.set(bytes);
      return out;
    }
    if (x instanceof ArrayBuffer) return new Buffer(new Uint8Array(x));
    const out = new Buffer(x.length);
    out.set(x);
    return out;
  }

  static concat(list) {
    const out = new Buffer(list.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of list) { out.set(b, at); at += b.length; }
    return out;
  }

  toString(encoding = "utf8") {
    if (encoding === "hex") {
      let s = "";
      for (const b of this) s += b.toString(16).padStart(2, "0");
      return s;
    }
    if (encoding === "base64") {
      let bin = "";
      for (const b of this) bin += String.fromCharCode(b);
      return btoa(bin);
    }
    return dec.decode(this);
  }
}
