// Builds a static copy of the public site for GitHub Pages (or any static hosting).
//   npm run export                         → ./dist for https://<user>.github.io/<repo>/
//   STATIC_BASE="" npm run export          → ./dist served from a domain root
// Forms and the admin panel need the Node server; in the static copy forms are
// replaced by contact info and search runs in the browser from a JSON index.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const BASE = (process.env.STATIC_BASE ?? "/school91-astana").replace(/\/$/, "");
const SITE = (process.env.SITE_URL || "https://qawuroqq1.github.io") + BASE;
const OUT = path.resolve(process.env.OUT_DIR || "dist");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "school91-export-"));
process.env.DATA_DIR = process.env.EXPORT_DATA_DIR || dataDir;
process.env.STATIC_EXPORT = "1";
process.env.STATIC_BASE = BASE;
process.env.SITE_URL = SITE;
process.env.NODE_ENV = "test";

const { createServer } = await import("../src/server.ts");
const { searchIndex } = await import("../src/routes/public.ts");
const { config } = await import("../src/config.ts");
const { LANGS } = await import("../src/i18n/langs.ts");

const server = createServer();
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** "/ru/news?category=events&page=2" → "/ru/news/q-category-events-page-2" */
function routeToDir(url: string): string {
  const u = new URL(url, origin);
  let p = u.pathname.replace(/\/+$/, "") || "";
  if (u.search) {
    const q = [...u.searchParams].map(([k, v]) => `${k}-${v}`).join("-").replace(/[^a-zA-Z0-9-]/g, "_");
    p += `/q-${q}`;
  }
  return p;
}

const isPage = (href: string) => /^\/(kz|ru|en)(\/|$|\?)/.test(href) && !/\.(xml|txt)$/.test(href.split("?")[0]);

function rewrite(html: string): string {
  return html
    .replace(/(href|src|action)="(\/(?!\/)[^"#]*)(#[^"]*)?"/g, (_m, attr: string, url: string, hash = "") => {
      const decoded = url.replace(/&amp;/g, "&");
      if (attr === "action" || isPage(decoded)) return `${attr}="${BASE}${routeToDir(decoded)}/${hash}"`;
      return `${attr}="${BASE}${url}${hash}"`;
    })
    .replace(/url\((['"]?)\/(?!\/)/g, `url($1${BASE}/`);
}

function write(file: string, content: string | Buffer): void {
  const abs = path.join(OUT, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(config.publicDir, OUT, { recursive: true });
if (fs.existsSync(config.uploadsDir)) fs.cpSync(config.uploadsDir, path.join(OUT, "uploads"), { recursive: true });

const queue = ["/kz", "/ru", "/en"];
const seen = new Set<string>();
let pagesWritten = 0;
while (queue.length) {
  const url = queue.shift()!;
  if (seen.has(url)) continue;
  seen.add(url);
  const res = await fetch(origin + url, { redirect: "manual" });
  if (res.status === 301 || res.status === 302) {
    // Section shortcuts like /ru/parents/feedback → write a tiny redirect page.
    const loc = res.headers.get("location")!;
    const target = isPage(loc) ? `${BASE}${routeToDir(loc)}/` : loc;
    write(`${routeToDir(url)}/index.html`, `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${target}"><link rel="canonical" href="${target}"><a href="${target}">${target}</a>`);
    if (isPage(loc)) queue.push(loc);
    continue;
  }
  if (res.status !== 200) {
    console.warn(`skip ${url} → ${res.status}`);
    continue;
  }
  const html = await res.text();
  for (const [, href] of html.matchAll(/href="(\/(?:kz|ru|en)[^"#]*)"/g)) {
    const clean = href.replace(/&amp;/g, "&");
    if (!seen.has(clean) && isPage(clean) && !/\/search\?/.test(clean)) queue.push(clean);
  }
  write(`${routeToDir(url)}/index.html`, rewrite(html));
  pagesWritten++;
}

// Feeds, sitemap, robots, search indexes.
for (const lang of LANGS) {
  write(`${lang}/rss.xml`, await (await fetch(`${origin}/${lang}/rss.xml`)).text());
  write(`search-index-${lang}.json`, JSON.stringify(searchIndex(lang)));
}
write("sitemap.xml", (await (await fetch(`${origin}/sitemap.xml`)).text()).replace(/(<loc>|href=")([^<"]+)/g, (_m, a: string, u: string) => a + (u.endsWith(".xml") ? u : u.replace(/\/?$/, "/"))));
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

// 404 page (GitHub Pages serves /404.html for unknown paths).
write("404.html", rewrite(await (await fetch(`${origin}/kz/__not_found__`)).text()));

// Root: send visitors to their language.
write(
  "index.html",
  `<!doctype html><html lang="kk"><head><meta charset="utf-8"><title>Школа №91 · №91 мектеп · School No. 91</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="${SITE}/kz/">
<meta http-equiv="refresh" content="1; url=${BASE}/kz/">
<script>var l=(navigator.language||"").slice(0,2).toLowerCase();var m={kk:"kz",ru:"ru",en:"en"};var s=document.cookie.match(/s91_lang=(kz|ru|en)/);location.replace("${BASE}/"+((s&&s[1])||m[l]||"kz")+"/");</script>
</head><body style="font-family:system-ui;background:#061224;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0">
<p><a style="color:#7fd0d9" href="${BASE}/kz/">Қазақша</a> · <a style="color:#7fd0d9" href="${BASE}/ru/">Русский</a> · <a style="color:#7fd0d9" href="${BASE}/en/">English</a></p></body></html>`,
);
write(".nojekyll", "");

await new Promise<void>((r) => server.close(() => r()));
const { closeDb } = await import("../src/db/index.ts");
closeDb();
if (!process.env.EXPORT_DATA_DIR) fs.rmSync(dataDir, { recursive: true, force: true });
console.log(`Static site: ${pagesWritten} pages → ${OUT}  (base "${BASE || "/"}", ${SITE})`);
