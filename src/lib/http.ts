import type { IncomingMessage, ServerResponse } from "node:http";
import { SafeHtml } from "./html.ts";
import { config } from "../config.ts";

export interface UploadedFile {
  field: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface Body {
  fields: Record<string, string>;
  /** Repeated fields (e.g. checkboxes) keep every value here. */
  all: Record<string, string[]>;
  files: UploadedFile[];
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  url: URL;
  path: string;
  query: URLSearchParams;
  cookies: Record<string, string>;
  ip: string;
  /** Free-form per-request state (current user, lang, csrf…). */
  state: Record<string, unknown>;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message = "") {
    super(message || String(status));
    this.status = status;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export interface CookieOpts {
  maxAge?: number;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict";
  path?: string;
}

export function setCookie(ctx: Ctx, name: string, value: string, opts: CookieOpts = {}): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? "/"}`, `SameSite=${opts.sameSite ?? "Lax"}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (config.cookieSecure) parts.push("Secure");
  const prev = ctx.res.getHeader("Set-Cookie");
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  ctx.res.setHeader("Set-Cookie", [...list, parts.join("; ")]);
}

function readRaw(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function addField(body: Body, k: string, v: string): void {
  (body.all[k] ??= []).push(v);
  body.fields[k] = v;
}

function parseMultipart(buf: Buffer, boundary: string, body: Body): void {
  const delim = Buffer.from(`--${boundary}`);
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    pos += delim.length;
    if (buf[pos] === 45 && buf[pos + 1] === 45) break; // "--" closing delimiter
    if (buf[pos] === 13 && buf[pos + 1] === 10) pos += 2;
    const headerEnd = buf.indexOf("\r\n\r\n", pos);
    if (headerEnd === -1) break;
    const headerText = buf.subarray(pos, headerEnd).toString("utf8");
    const next = buf.indexOf(delim, headerEnd + 4);
    if (next === -1) break;
    const content = buf.subarray(headerEnd + 4, next - 2); // strip trailing CRLF
    const disp = /content-disposition:[^\r\n]*/i.exec(headerText)?.[0] ?? "";
    const name = /\bname="([^"]*)"/i.exec(disp)?.[1];
    const filename = /\bfilename="([^"]*)"/i.exec(disp)?.[1];
    const ctype = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() ?? "application/octet-stream";
    if (name !== undefined) {
      if (filename !== undefined) {
        if (filename && content.length) body.files.push({ field: name, filename, contentType: ctype, data: Buffer.from(content) });
      } else {
        addField(body, name, content.toString("utf8"));
      }
    }
    pos = next;
  }
}

export async function readBody(ctx: Ctx): Promise<Body> {
  const cached = ctx.state.body as Body | undefined;
  if (cached) return cached;
  const body: Body = { fields: {}, all: {}, files: [] };
  const type = String(ctx.req.headers["content-type"] || "");
  const isMultipart = type.startsWith("multipart/form-data");
  const buf = await readRaw(ctx.req, isMultipart ? config.maxUploadBytes + 1024 * 1024 : 2 * 1024 * 1024);
  if (isMultipart) {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
    if (!boundary) throw new HttpError(400, "Bad multipart");
    parseMultipart(buf, boundary[1] || boundary[2], body);
  } else if (type.startsWith("application/json")) {
    try {
      const obj = JSON.parse(buf.toString("utf8") || "{}");
      for (const [k, v] of Object.entries(obj)) addField(body, k, String(v ?? ""));
    } catch {
      throw new HttpError(400, "Bad JSON");
    }
  } else {
    for (const [k, v] of new URLSearchParams(buf.toString("utf8"))) addField(body, k, v);
  }
  ctx.state.body = body;
  return body;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "frame-src https://www.openstreetmap.org https://www.youtube-nocookie.com https://www.youtube.com",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; "),
};

export function send(ctx: Ctx, status: number, body: string | Buffer | SafeHtml, type = "text/html; charset=utf-8"): void {
  if (ctx.res.headersSent) return;
  const payload = body instanceof SafeHtml ? body.value : body;
  ctx.res.statusCode = status;
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) ctx.res.setHeader(k, v);
  ctx.res.setHeader("Content-Type", type);
  if (type.startsWith("text/html")) ctx.res.setHeader("Cache-Control", "no-store");
  ctx.res.end(ctx.method === "HEAD" ? undefined : payload);
}

export function redirect(ctx: Ctx, location: string, status = 303): void {
  if (ctx.res.headersSent) return;
  ctx.res.statusCode = status;
  ctx.res.setHeader("Location", location);
  ctx.res.end();
}

export function json(ctx: Ctx, status: number, data: unknown): void {
  send(ctx, status, JSON.stringify(data), "application/json; charset=utf-8");
}

export function clientIp(req: IncomingMessage): string {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}
