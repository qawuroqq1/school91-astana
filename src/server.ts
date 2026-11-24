import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { config } from "./config.ts";
import { HttpError, clientIp, parseCookies, redirect, send, type Ctx } from "./lib/http.ts";
import { Router } from "./lib/router.ts";
import { MIME } from "./lib/uploads.ts";
import { db } from "./db/index.ts";
import { seed } from "./db/seed.ts";
import { sessions, uiOverrides } from "./db/repo.ts";
import { publicRoutes, renderError } from "./routes/public.ts";
import { adminRoutes, adminError } from "./routes/admin.ts";

export function buildRouter(): Router {
  const r = new Router();
  adminRoutes(r);
  publicRoutes(r);
  return r;
}

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|rss\+xml)|image\/svg)/;

function serveStatic(ctx: Ctx, baseDir: string, urlPath: string, immutable: boolean): boolean {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return false;
  }
  const abs = path.resolve(baseDir, "." + rel);
  if (!abs.startsWith(baseDir + path.sep)) return false;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(abs).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const res = ctx.res;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (baseDir === config.uploadsDir && !/^image\//.test(type)) {
    // Documents open in the browser but can never run as a page of the site.
    // PDFs skip "sandbox" because browsers refuse to show a sandboxed PDF in the built-in viewer.
    res.setHeader("Content-Security-Policy", type === "application/pdf" ? "default-src 'none'; frame-ancestors 'self'" : "default-src 'none'; sandbox");
  }
  if (ctx.req.headers["if-none-match"] === etag) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  res.setHeader("Content-Type", type);
  const gzip = COMPRESSIBLE.test(type) && /\bgzip\b/.test(String(ctx.req.headers["accept-encoding"] || "")) && stat.size > 1024;
  if (gzip) {
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
  } else {
    res.setHeader("Content-Length", stat.size);
  }
  if (ctx.method === "HEAD") {
    res.end();
    return true;
  }
  const stream = fs.createReadStream(abs);
  (gzip ? stream.pipe(zlib.createGzip()) : stream).pipe(res);
  return true;
}

export function createServer(router = buildRouter()): http.Server {
  db();
  seed();
  uiOverrides.load();
  sessions.purge();

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const ctx: Ctx = {
      req,
      res,
      method: req.method || "GET",
      url,
      path: url.pathname,
      query: url.searchParams,
      cookies: parseCookies(req.headers.cookie),
      ip: clientIp(req),
      state: {},
    };
    const started = Date.now();
    try {
      if (ctx.method === "GET" || ctx.method === "HEAD") {
        if (/^\/(css|js|img|fonts)\//.test(ctx.path) || ctx.path === "/favicon.ico") {
          const p = ctx.path === "/favicon.ico" ? "/img/favicon.svg" : ctx.path;
          if (serveStatic(ctx, config.publicDir, p, ctx.query.has("v"))) return;
        }
        if (ctx.path.startsWith("/uploads/")) {
          if (serveStatic(ctx, config.uploadsDir, ctx.path.slice("/uploads".length), true)) return;
        }
        // Trailing slash → canonical URL without it.
        if (ctx.path.length > 1 && ctx.path.endsWith("/")) return redirect(ctx, ctx.path.replace(/\/+$/, "") + url.search, 301);
      }
      const match = router.match(ctx.method, ctx.path);
      if (!match) throw new HttpError(router.hasPath(ctx.path) ? 405 : 404);
      await match.handler(ctx, match.params);
      if (!res.headersSent && !res.writableEnded) throw new HttpError(404);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(`[${new Date().toISOString()}] ${ctx.method} ${ctx.path}`, err);
      if (res.headersSent) {
        res.end();
        return;
      }
      try {
        if (ctx.path.startsWith("/admin")) adminError(ctx, status);
        else if (status === 404 || status === 500) renderError(ctx, status);
        else send(ctx, status, `<!doctype html><meta charset="utf-8"><title>${status}</title><p>${status}</p>`);
      } catch (e2) {
        console.error("Error page failed", e2);
        send(ctx, 500, "Internal Server Error", "text/plain; charset=utf-8");
      }
    } finally {
      if (!config.isTest && process.env.LOG_REQUESTS === "1") console.log(`${ctx.method} ${ctx.path} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    console.log(`Сайт школы №91 запущен: http://localhost:${config.port}  (админка: /admin)`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
