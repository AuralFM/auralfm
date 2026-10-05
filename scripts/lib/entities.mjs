/**
 * HTML character references, as text.
 *
 * A station's description comes out of its own page's <meta> tags, and a page
 * in Arabic, Russian or Thai often writes every letter as a reference
 * ("&#x62F;&#x627;…"). The first decoder here knew the decimal form and four
 * named ones, so 2,190 stations showed their description as a wall of codes
 * (found 4 Oct 2026 by throwing the catalogue's own worst cases at the phone
 * layout). Decimal, hexadecimal and the named ones a description really uses.
 */
const NAMED = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", bull: "•",
  copy: "©", reg: "®", trade: "™", deg: "°", eacute: "é", egrave: "è", aacute: "á", agrave: "à",
  iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü", ouml: "ö", auml: "ä", szlig: "ß",
  ccedil: "ç", atilde: "ã", otilde: "õ", ecirc: "ê", acirc: "â", ocirc: "ô",
};
const point = (n) => { try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; } catch { return ""; } };

export function decodeEntities(s) {
  if (typeof s !== "string" || !s.includes("&")) return s;
  let out = s;
  // Twice: "&amp;#x62F;" is a reference somebody escaped again.
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => point(parseInt(h, 16)))
      .replace(/&#(\d{1,7});/g, (_, n) => point(+n))
      .replace(/&([a-z]{2,8});/gi, (m, name) => NAMED[name] ?? NAMED[name.toLowerCase()] ?? m);
  }
  // A description cut at a length can end halfway through a reference
  // ("…ال&#x639"): drop the stump rather than print it.
  return out.replace(/&#x?[0-9a-f]{0,6}$/i, "").trimEnd();
}

/** Every string in a profile, decoded, with the spacing tidied. */
export function decodeDeep(v) {
  if (typeof v === "string") return decodeEntities(v);
  if (Array.isArray(v)) return v.map(decodeDeep);
  if (v && typeof v === "object") { for (const k of Object.keys(v)) v[k] = decodeDeep(v[k]); return v; }
  return v;
}
