/**
 * IPC: music cleared for shows, found from the studio.
 *
 * A host is somebody who loves music, not a broadcaster with licences, so the
 * studio's music starts from tracks whose licence already lets anyone play them
 * on the air: Creative Commons Attribution (CC BY), Attribution-ShareAlike
 * (CC BY-SA), CC0 and the public-domain mark. Not the NonCommercial licences
 * (a show is not clearly non-commercial) and not NoDerivatives (talking over a
 * track and fading it into the next may count as changing it).
 *
 * Two open sources, asked only when the host searches, with the search words
 * and nothing else:
 *   - ccMixter (ccmixter.org/api/query), one request;
 *   - the Internet Archive's netlabels collection (archive.org), a search and
 *     then one request per release for its MP3 files.
 *
 * What comes back is a list of tracks with their artist, licence and page, so
 * the show's tracklist can credit them, which the licences require. Playing one
 * goes through studio:openTrack (ipc-app.js), the same checked path as any link.
 */

const { ipcMain, net } = require("electron");
const { validUrl } = require("../safehost");

const UA = { "User-Agent": "AuralFM/0.1 (+https://auralfm.xyz; hello@auralfm.xyz)" };
// A licence ported to a country (…/by/3.0/us/) is the same licence.
const ALLOWED = /creativecommons\.org\/(licenses\/(by|by-sa)\/[\d.]+(\/[a-z]{2})?|publicdomain\/(zero|mark)\/[\d.]+)\/?$/i;
const LICENCE = (url) => {
  const m = String(url || "").match(/licenses\/(by-sa|by)\/([\d.]+)|publicdomain\/(zero|mark)/i);
  if (!m) return "";
  return m[3] ? (m[3].toLowerCase() === "zero" ? "CC0" : "Public domain") : `CC ${m[1].toUpperCase()} ${m[2]}`;
};
const clean = (s, n = 120) => String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const get = async (url) => {
  const res = await net.fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};
const mins = (s) => { const m = String(s || "").match(/^(?:(\d+):)?(\d+):(\d+)$/); return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] : null; };

async function ccmixter(q) {
  const url = `https://ccmixter.org/api/query?f=json&limit=12&lic=by,sa,zero&sort=rank&search=${encodeURIComponent(q)}&search_type=all`;
  const rows = await get(url);
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const file = (r.files || []).find((f) => /\.mp3$/i.test(f.download_url || ""));
    if (!file || !ALLOWED.test(r.license_url || "")) continue;
    if (!validUrl(file.download_url, { schemes: ["https:"] })) continue;
    out.push({
      title: clean(r.upload_name), artist: clean(r.user_real_name || r.user_name),
      licence: LICENCE(r.license_url), licenceUrl: r.license_url, page: r.file_page_url || "",
      src: file.download_url, duration: mins(file.file_format_info?.ps), from: "ccMixter",
    });
  }
  return out;
}

// The search engine refuses a slash inside a pattern, so "?" stands for it: the
// four licences that may go on air, and nothing that only resembles them
// (by-nc, by-nd). ALLOWED checks every answer again.
const LICENCES = ["licenses?by?4.0", "licenses?by?3.0", "licenses?by?2.5", "licenses?by?2.0", "licenses?by-sa?", "publicdomain"].map((p) => `licenseurl:*${p}*`).join(" OR ");

async function archive(q) {
  const query = `collection:netlabels AND mediatype:audio AND (${q.replace(/[^\p{L}\p{N} ]+/gu, " ").trim() || "*"}) AND (${LICENCES})`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=12&output=json`;
  const docs = (await get(url))?.response?.docs || [];
  const out = [];
  await Promise.all(docs.filter((d) => ALLOWED.test(d.licenseurl || "")).slice(0, 4).map(async (d) => {
    try {
      const meta = await get(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`);
      const files = (meta.files || []).filter((f) => /^(VBR MP3|MP3|128Kbps MP3)$/i.test(f.format || "") && /\.mp3$/i.test(f.name || "")).slice(0, 4);
      for (const f of files) {
        const src = `https://archive.org/download/${encodeURIComponent(d.identifier)}/${f.name.split("/").map(encodeURIComponent).join("/")}`;
        out.push({
          title: clean(f.title || f.name.replace(/\.mp3$/i, "")), artist: clean(f.artist || f.creator || (Array.isArray(d.creator) ? d.creator[0] : d.creator)),
          licence: LICENCE(d.licenseurl), licenceUrl: d.licenseurl, page: `https://archive.org/details/${d.identifier}`,
          src, duration: Number.isFinite(+f.length) ? +f.length : mins(f.length), from: "Internet Archive",
        });
      }
    } catch { /* one release that does not answer is not the search failing */ }
  }));
  return out;
}

module.exports = function register() {
  ipcMain.handle("studio:cleared", async (_e, words) => {
    const q = clean(words, 80);
    if (!q) return { tracks: [] };
    const [a, b] = await Promise.allSettled([ccmixter(q), archive(q)]);
    const tracks = [...(a.value || []), ...(b.value || [])].filter((t) => t.title && t.src).slice(0, 24);
    return { tracks, failed: a.status === "rejected" && b.status === "rejected" };
  });
};

// For the audit: which licence addresses may go on air.
module.exports.allowed = (url) => ALLOWED.test(String(url || ""));
