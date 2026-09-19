#!/usr/bin/env node
/**
 * Serve dist-web/ locally the way here.now will: static files, plus the proxy
 * routes declared in dist-web/.herenow/proxy.json.
 *
 *   node scripts/serve-web.mjs [port]      (default 8765)
 *
 * Routes are read from the same manifest that gets published, so a route that
 * works here is the route here.now receives. Two here.now behaviours are copied
 * on purpose: the manifest itself is never served, and an exact path matches
 * exactly while `/prefix/*` forwards the rest of the path (and the query) to the
 * upstream. Redirects from an upstream are passed back, not followed — if a feed
 * starts redirecting, this server shows it the way a strict proxy would.
 *
 * For local testing only: no caching, no rate limit.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist-web");
const PORT = Number(process.argv[2]) || 8765;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2",
};

const manifest = () => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, ".herenow", "proxy.json"), "utf8")).proxies || {}; }
  catch { return {}; }
};

function route(pathname) {
  const routes = manifest();
  if (routes[pathname]) return { ...routes[pathname], rest: "" };
  for (const [key, r] of Object.entries(routes)) {
    if (key.endsWith("/*") && pathname.startsWith(key.slice(0, -1))) {
      return { ...r, rest: "/" + pathname.slice(key.length - 1) };
    }
  }
  return null;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const r = route(url.pathname);
  if (r) {
    if (req.method !== (r.method || "GET")) { res.writeHead(405).end(); return; }
    try {
      const up = await fetch(r.upstream + r.rest + url.search, { redirect: "manual", headers: r.headers || {} });
      const headers = { "content-type": up.headers.get("content-type") || "application/octet-stream", "cache-control": "no-store" };
      if (up.headers.get("location")) headers.location = up.headers.get("location");
      res.writeHead(up.status, headers).end(Buffer.from(await up.arrayBuffer()));
    } catch (err) {
      res.writeHead(502, { "content-type": "text/plain" }).end(`proxy: ${err.message}`);
    }
    return;
  }
  // The manifest is configuration, never content.
  if (url.pathname.startsWith("/.herenow/")) { res.writeHead(404).end(); return; }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`serve-web: http://localhost:${PORT} (dist-web, proxy routes from .herenow/proxy.json)`));
