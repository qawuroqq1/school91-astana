import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.ts";
import type { UploadedFile } from "./http.ts";

export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
export const DOC_EXT = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".rtf", ".txt", ".zip"]);

export const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".rtf": "application/rtf",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".xml": "application/xml; charset=utf-8",
};

/** Checks magic bytes so a renamed executable can't pose as an image. */
function looksLikeImage(buf: Buffer, ext: string): boolean {
  if (ext === ".png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === ".jpg" || ext === ".jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (ext === ".gif") return buf.subarray(0, 3).toString() === "GIF";
  if (ext === ".webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  return false;
}

export function imageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (buf.subarray(0, 3).toString() === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (buf.subarray(0, 4).toString() === "RIFF") {
      const chunk = buf.subarray(12, 16).toString();
      if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

export interface Stored {
  file: string; // public path, e.g. /uploads/2026/11/ab12cd.jpg
  original: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

export class UploadError extends Error {}

export function storeUpload(f: UploadedFile, kind: "image" | "document"): Stored {
  const ext = path.extname(f.filename).toLowerCase();
  const allowed = kind === "image" ? IMAGE_EXT : new Set([...DOC_EXT, ...IMAGE_EXT]);
  if (!allowed.has(ext)) throw new UploadError(`Недопустимый тип файла: ${ext || "без расширения"}`);
  if (f.data.length > config.maxUploadBytes) throw new UploadError("Файл слишком большой");
  if (IMAGE_EXT.has(ext) && !looksLikeImage(f.data, ext)) throw new UploadError("Файл не похож на изображение");
  const now = new Date();
  const sub = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"));
  const dir = path.join(config.uploadsDir, sub);
  fs.mkdirSync(dir, { recursive: true });
  const name = crypto.randomBytes(10).toString("hex") + ext;
  fs.writeFileSync(path.join(dir, name), f.data);
  const size = IMAGE_EXT.has(ext) ? imageSize(f.data) : null;
  return {
    file: `/uploads/${sub.split(path.sep).join("/")}/${name}`,
    original: path.basename(f.filename).slice(0, 200),
    mime: MIME[ext] || "application/octet-stream",
    size: f.data.length,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

export function removeUpload(publicPath: string | null | undefined): void {
  if (!publicPath || !publicPath.startsWith("/uploads/")) return;
  const abs = path.resolve(config.uploadsDir, "." + publicPath.slice("/uploads".length));
  if (!abs.startsWith(config.uploadsDir)) return;
  fs.rm(abs, { force: true }, () => {});
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
