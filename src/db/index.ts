import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.ts";

let instance: DatabaseSync | null = null;

const MIGRATIONS: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','editor')),
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE pages (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE TABLE page_tr (
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    lang TEXT NOT NULL,
    lead TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (page_id, lang)
  );

  CREATE TABLE news (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'news',
    image TEXT,
    event_date TEXT,
    published_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
    featured INTEGER NOT NULL DEFAULT 0,
    allow_comments INTEGER NOT NULL DEFAULT 1,
    views INTEGER NOT NULL DEFAULT 0,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX news_pub ON news(status, published_at DESC);
  CREATE TABLE news_tr (
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    lang TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (news_id, lang)
  );

  CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    page_key TEXT NOT NULL,
    file TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    doc_lang TEXT NOT NULL,
    title TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX documents_page ON documents(page_key, sort);

  CREATE TABLE gallery_albums (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE gallery_images (
    id INTEGER PRIMARY KEY,
    album_id INTEGER REFERENCES gallery_albums(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '{}',
    width INTEGER,
    height INTEGER,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE staff (
    id INTEGER PRIMARY KEY,
    grp TEXT NOT NULL CHECK (grp IN ('director','administration','teachers')),
    name TEXT NOT NULL,
    position TEXT NOT NULL DEFAULT '{}',
    bio TEXT NOT NULL DEFAULT '{}',
    photo TEXT,
    email TEXT,
    phone TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE announcements (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    link TEXT,
    starts_on TEXT,
    ends_on TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    lang TEXT NOT NULL,
    ip TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE blog_questions (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    lang TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','published','hidden')),
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    answered_at TEXT
  );

  CREATE TABLE comments (
    id INTEGER PRIMARY KEY,
    news_id INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    lang TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE ui_overrides (lang TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (lang, key));

  CREATE TABLE visits (day TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
];

function migrate(db: DatabaseSync): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare("INSERT INTO schema_version (version) VALUES (0)").run();
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.prepare("UPDATE schema_version SET version = ?").run(i + 1);
      db.exec("COMMIT");
      version = i + 1;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

export function db(): DatabaseSync {
  if (instance) return instance;
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  instance = new DatabaseSync(config.dbFile);
  instance.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(instance);
  return instance;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

/** Run fn inside a transaction. */
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
