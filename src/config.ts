import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  root,
  port: int("PORT", 3000),
  host: process.env.HOST || "0.0.0.0",
  /** Public origin, used for canonical URLs, sitemap and RSS. */
  siteUrl: (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(root, "data")),
  get dbFile(): string {
    return process.env.DB_FILE || path.join(this.dataDir, "school.db");
  },
  get uploadsDir(): string {
    return path.join(this.dataDir, "uploads");
  },
  publicDir: path.join(root, "public"),
  /** Secure cookies when served over HTTPS (set COOKIE_SECURE=1 behind a TLS proxy). */
  cookieSecure: process.env.COOKIE_SECURE === "1",
  maxUploadBytes: int("MAX_UPLOAD_MB", 25) * 1024 * 1024,
  adminEmail: process.env.ADMIN_EMAIL || "admin@school91.local",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  sessionDays: int("SESSION_DAYS", 7),
  isTest: process.env.NODE_ENV === "test",
  /** Static export for GitHub Pages: forms are replaced by contact info, search runs in the browser. */
  staticExport: process.env.STATIC_EXPORT === "1",
};
