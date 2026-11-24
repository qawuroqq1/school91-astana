import { db } from "./index.ts";
import { LANGS, parseL10n, type L10n, type Lang } from "../i18n/langs.ts";
import { setOverrides } from "../i18n/index.ts";
import type { Dict } from "../i18n/ru.ts";
import type { StaffGroup } from "../site/structure.ts";

type Row = Record<string, unknown>;
const all = <T>(sql: string, ...params: (string | number | null)[]): T[] => db().prepare(sql).all(...params) as T[];
const get = <T>(sql: string, ...params: (string | number | null)[]): T | undefined => db().prepare(sql).get(...params) as T | undefined;
const run = (sql: string, ...params: (string | number | null)[]) => db().prepare(sql).run(...params);

/* ------------------------------------------------------------------ users */

export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "editor";
  password_hash: string;
  active: number;
  created_at: string;
  last_login: string | null;
}

export const users = {
  count: () => get<{ n: number }>("SELECT COUNT(*) n FROM users")!.n,
  byEmail: (email: string) => get<User>("SELECT * FROM users WHERE email = ?", email.trim()),
  byId: (id: number) => get<User>("SELECT * FROM users WHERE id = ?", id),
  list: () => all<User>("SELECT * FROM users ORDER BY role, name"),
  create: (u: { email: string; name: string; role: string; password_hash: string }) =>
    Number(run("INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)", u.email.trim(), u.name, u.role, u.password_hash).lastInsertRowid),
  update: (id: number, u: { name: string; role: string; active: number }) => run("UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?", u.name, u.role, u.active, id),
  setPassword: (id: number, hash: string) => run("UPDATE users SET password_hash = ? WHERE id = ?", hash, id),
  touchLogin: (id: number) => run("UPDATE users SET last_login = datetime('now') WHERE id = ?", id),
  remove: (id: number) => run("DELETE FROM users WHERE id = ?", id),
  adminsCount: () => get<{ n: number }>("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1")!.n,
};

export const sessions = {
  create: (idHash: string, userId: number, csrf: string, expiresAt: number) =>
    run("INSERT INTO sessions (id_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)", idHash, userId, csrf, expiresAt),
  find: (idHash: string) =>
    get<{ id_hash: string; user_id: number; csrf: string; expires_at: number }>("SELECT * FROM sessions WHERE id_hash = ? AND expires_at > ?", idHash, Date.now()),
  remove: (idHash: string) => run("DELETE FROM sessions WHERE id_hash = ?", idHash),
  removeForUser: (userId: number) => run("DELETE FROM sessions WHERE user_id = ?", userId),
  purge: () => run("DELETE FROM sessions WHERE expires_at <= ?", Date.now()),
};

export function audit(userId: number | null, action: string, target = ""): void {
  run("INSERT INTO audit_log (user_id, action, target) VALUES (?, ?, ?)", userId, action, target);
}

export function recentAudit(limit = 15) {
  return all<{ action: string; target: string; created_at: string; name: string | null }>(
    "SELECT a.action, a.target, a.created_at, u.name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?",
    limit,
  );
}

/* ------------------------------------------------------------------ pages */

export interface PageContent {
  key: string;
  updated_at: string;
  tr: Partial<Record<Lang, { lead: string; body: string }>>;
}

export const pages = {
  ensure(key: string): number {
    const row = get<{ id: number }>("SELECT id FROM pages WHERE key = ?", key);
    if (row) return row.id;
    return Number(run("INSERT INTO pages (key) VALUES (?)", key).lastInsertRowid);
  },
  get(key: string): PageContent | undefined {
    const page = get<{ id: number; key: string; updated_at: string }>("SELECT id, key, updated_at FROM pages WHERE key = ?", key);
    if (!page) return undefined;
    const tr: PageContent["tr"] = {};
    for (const r of all<{ lang: Lang; lead: string; body: string }>("SELECT lang, lead, body FROM page_tr WHERE page_id = ?", page.id)) tr[r.lang] = { lead: r.lead, body: r.body };
    return { key: page.key, updated_at: page.updated_at, tr };
  },
  save(key: string, tr: Partial<Record<Lang, { lead: string; body: string }>>, userId: number | null): void {
    const id = pages.ensure(key);
    for (const lang of LANGS) {
      const v = tr[lang];
      if (!v) continue;
      run(
        "INSERT INTO page_tr (page_id, lang, lead, body) VALUES (?, ?, ?, ?) ON CONFLICT(page_id, lang) DO UPDATE SET lead = excluded.lead, body = excluded.body",
        id, lang, v.lead, v.body,
      );
    }
    run("UPDATE pages SET updated_at = datetime('now'), updated_by = ? WHERE id = ?", userId, id);
  },
  filled(): Set<string> {
    return new Set(all<{ key: string }>("SELECT DISTINCT p.key FROM pages p JOIN page_tr t ON t.page_id = p.id WHERE t.body <> ''").map((r) => r.key));
  },
  allForLang(lang: Lang) {
    return all<{ key: string; lead: string; body: string; updated_at: string }>(
      "SELECT p.key, t.lead, t.body, p.updated_at FROM pages p JOIN page_tr t ON t.page_id = p.id WHERE t.lang = ? AND t.body <> ''",
      lang,
    );
  },
};

/* ------------------------------------------------------------------- news */

export interface NewsRow {
  id: number;
  slug: string;
  category: string;
  image: string | null;
  event_date: string | null;
  published_at: string;
  status: "draft" | "published";
  featured: number;
  allow_comments: number;
  views: number;
  updated_at: string;
}
export interface NewsTr {
  title: string;
  excerpt: string;
  body: string;
}
export type NewsLocalized = NewsRow & NewsTr & { lang: Lang };
export type NewsFull = NewsRow & { tr: Partial<Record<Lang, NewsTr>> };

const PUBLISHED = "n.status = 'published' AND n.published_at <= datetime('now', '+6 hours')";

export const news = {
  list(lang: Lang, opts: { category?: string; year?: string; limit: number; offset: number; excludeId?: number }) {
    const where = [PUBLISHED, "t.lang = ?"];
    const params: (string | number)[] = [lang];
    if (opts.category) {
      where.push("n.category = ?");
      params.push(opts.category);
    }
    if (opts.year) {
      where.push("substr(n.published_at, 1, 4) = ?");
      params.push(opts.year);
    }
    if (opts.excludeId) {
      where.push("n.id <> ?");
      params.push(opts.excludeId);
    }
    const base = `FROM news n JOIN news_tr t ON t.news_id = n.id WHERE ${where.join(" AND ")}`;
    const total = get<{ n: number }>(`SELECT COUNT(*) n ${base}`, ...params)!.n;
    const items = all<NewsLocalized>(
      `SELECT n.*, t.title, t.excerpt, t.body, t.lang ${base} ORDER BY n.featured DESC, n.published_at DESC, n.id DESC LIMIT ? OFFSET ?`,
      ...params, opts.limit, opts.offset,
    );
    return { total, items };
  },
  latest(lang: Lang, limit: number, category?: string) {
    return news.list(lang, { category, limit, offset: 0 }).items;
  },
  upcomingEvents(lang: Lang, limit: number) {
    return all<NewsLocalized>(
      `SELECT n.*, t.title, t.excerpt, t.body, t.lang FROM news n JOIN news_tr t ON t.news_id = n.id
       WHERE ${PUBLISHED} AND t.lang = ? AND n.category = 'events' AND n.event_date >= date('now')
       ORDER BY n.event_date ASC LIMIT ?`,
      lang, limit,
    );
  },
  years(lang: Lang) {
    return all<{ year: string; n: number }>(
      `SELECT substr(n.published_at, 1, 4) year, COUNT(*) n FROM news n JOIN news_tr t ON t.news_id = n.id WHERE ${PUBLISHED} AND t.lang = ? GROUP BY year ORDER BY year DESC`,
      lang,
    );
  },
  archive(lang: Lang) {
    return all<NewsLocalized>(
      `SELECT n.*, t.title, t.excerpt, '' body, t.lang FROM news n JOIN news_tr t ON t.news_id = n.id WHERE ${PUBLISHED} AND t.lang = ? ORDER BY n.published_at DESC`,
      lang,
    );
  },
  /** Public lookup: returns the article and the languages it exists in. */
  bySlug(slug: string): NewsFull | undefined {
    const row = get<NewsRow>(`SELECT n.* FROM news n WHERE n.slug = ? AND ${PUBLISHED}`, slug);
    return row ? { ...row, tr: news.translations(row.id) } : undefined;
  },
  byId(id: number): NewsFull | undefined {
    const row = get<NewsRow>("SELECT * FROM news WHERE id = ?", id);
    return row ? { ...row, tr: news.translations(row.id) } : undefined;
  },
  translations(id: number): Partial<Record<Lang, NewsTr>> {
    const tr: Partial<Record<Lang, NewsTr>> = {};
    for (const r of all<NewsTr & { lang: Lang }>("SELECT lang, title, excerpt, body FROM news_tr WHERE news_id = ?", id)) tr[r.lang] = { title: r.title, excerpt: r.excerpt, body: r.body };
    return tr;
  },
  incrementViews: (id: number) => run("UPDATE news SET views = views + 1 WHERE id = ?", id),
  slugExists: (slug: string, exceptId = 0) => !!get("SELECT 1 FROM news WHERE slug = ? AND id <> ?", slug, exceptId),
  adminList(filter: { q?: string; status?: string; category?: string }) {
    const where: string[] = ["1 = 1"];
    const params: string[] = [];
    if (filter.status) {
      where.push("n.status = ?");
      params.push(filter.status);
    }
    if (filter.category) {
      where.push("n.category = ?");
      params.push(filter.category);
    }
    if (filter.q) {
      where.push("EXISTS (SELECT 1 FROM news_tr x WHERE x.news_id = n.id AND x.title LIKE ?)");
      params.push(`%${filter.q}%`);
    }
    return all<NewsRow & { titles: string; langs: string }>(
      `SELECT n.*, (SELECT group_concat(lang || ':' || title, '\u0001') FROM news_tr WHERE news_id = n.id) titles,
              (SELECT group_concat(lang) FROM news_tr WHERE news_id = n.id) langs
       FROM news n WHERE ${where.join(" AND ")} ORDER BY n.published_at DESC, n.id DESC LIMIT 300`,
      ...params,
    );
  },
  save(data: Omit<NewsRow, "id" | "views" | "updated_at"> & { id?: number }, tr: Partial<Record<Lang, NewsTr>>, userId: number | null): number {
    let id = data.id ?? 0;
    if (id) {
      run(
        `UPDATE news SET slug=?, category=?, image=?, event_date=?, published_at=?, status=?, featured=?, allow_comments=?, updated_at=datetime('now') WHERE id=?`,
        data.slug, data.category, data.image, data.event_date, data.published_at, data.status, data.featured, data.allow_comments, id,
      );
    } else {
      id = Number(
        run(
          `INSERT INTO news (slug, category, image, event_date, published_at, status, featured, allow_comments, author_id) VALUES (?,?,?,?,?,?,?,?,?)`,
          data.slug, data.category, data.image, data.event_date, data.published_at, data.status, data.featured, data.allow_comments, userId,
        ).lastInsertRowid,
      );
    }
    for (const lang of LANGS) {
      const v = tr[lang];
      if (v && v.title.trim()) {
        run(
          "INSERT INTO news_tr (news_id, lang, title, excerpt, body) VALUES (?,?,?,?,?) ON CONFLICT(news_id, lang) DO UPDATE SET title=excluded.title, excerpt=excluded.excerpt, body=excluded.body",
          id, lang, v.title.trim(), v.excerpt, v.body,
        );
      } else {
        run("DELETE FROM news_tr WHERE news_id = ? AND lang = ?", id, lang);
      }
    }
    return id;
  },
  remove: (id: number) => run("DELETE FROM news WHERE id = ?", id),
  stats: () => get<{ total: number; published: number; drafts: number }>(
    "SELECT COUNT(*) total, SUM(status='published') published, SUM(status='draft') drafts FROM news",
  )!,
  top: (limit: number) => all<{ id: number; slug: string; views: number; title: string }>(
    `SELECT n.id, n.slug, n.views, COALESCE((SELECT title FROM news_tr WHERE news_id=n.id AND lang='ru'), (SELECT title FROM news_tr WHERE news_id=n.id LIMIT 1)) title
     FROM news n WHERE n.status='published' ORDER BY n.views DESC LIMIT ?`,
    limit,
  ),
};

/* -------------------------------------------------------------- documents */

export interface DocumentRow {
  id: number;
  page_key: string;
  file: string;
  original_name: string;
  mime: string;
  size: number;
  doc_lang: string;
  title: L10n;
  sort: number;
  created_at: string;
  doc_date: string | null;
}
const mapDoc = (r: Row): DocumentRow => ({ ...(r as unknown as DocumentRow), title: parseL10n(r.title as string) });

export const documents = {
  forPage: (key: string) => all<Row>("SELECT * FROM documents WHERE page_key = ? ORDER BY sort, COALESCE(doc_date, created_at) DESC, id DESC", key).map(mapDoc),
  all: () => all<Row>("SELECT * FROM documents ORDER BY page_key, sort, id DESC").map(mapDoc),
  byId: (id: number) => {
    const r = get<Row>("SELECT * FROM documents WHERE id = ?", id);
    return r ? mapDoc(r) : undefined;
  },
  create: (d: Omit<DocumentRow, "id" | "created_at">) =>
    Number(
      run(
        "INSERT INTO documents (page_key, file, original_name, mime, size, doc_lang, title, sort, doc_date) VALUES (?,?,?,?,?,?,?,?,?)",
        d.page_key, d.file, d.original_name, d.mime, d.size, d.doc_lang, JSON.stringify(d.title), d.sort, d.doc_date,
      ).lastInsertRowid,
    ),
  update: (id: number, d: { page_key: string; doc_lang: string; title: L10n; sort: number; doc_date: string | null }) =>
    run("UPDATE documents SET page_key=?, doc_lang=?, title=?, sort=?, doc_date=? WHERE id=?", d.page_key, d.doc_lang, JSON.stringify(d.title), d.sort, d.doc_date, id),
  remove: (id: number) => run("DELETE FROM documents WHERE id = ?", id),
  count: () => get<{ n: number }>("SELECT COUNT(*) n FROM documents")!.n,
};

/* ------------------------------------------------------------------ staff */

export interface StaffRow {
  id: number;
  grp: StaffGroup;
  name: L10n;
  position: L10n;
  bio: L10n;
  photo: string | null;
  email: string | null;
  phone: string | null;
  sort: number;
}
const mapStaff = (r: Row): StaffRow => ({
  ...(r as unknown as StaffRow),
  name: parseL10n(r.name as string),
  position: parseL10n(r.position as string),
  bio: parseL10n(r.bio as string),
});

export const staff = {
  byGroup: (grp: string) => all<Row>("SELECT * FROM staff WHERE grp = ? ORDER BY sort, id", grp).map(mapStaff),
  all: () => all<Row>("SELECT * FROM staff ORDER BY CASE grp WHEN 'director' THEN 0 WHEN 'administration' THEN 1 WHEN 'teachers' THEN 2 WHEN 'profcom_chair' THEN 3 ELSE 4 END, sort, id").map(mapStaff),
  byId: (id: number) => {
    const r = get<Row>("SELECT * FROM staff WHERE id = ?", id);
    return r ? mapStaff(r) : undefined;
  },
  save(s: Omit<StaffRow, "id"> & { id?: number }): number {
    const args = [s.grp, JSON.stringify(s.name), JSON.stringify(s.position), JSON.stringify(s.bio), s.photo, s.email, s.phone, s.sort] as const;
    if (s.id) {
      run("UPDATE staff SET grp=?, name=?, position=?, bio=?, photo=?, email=?, phone=?, sort=? WHERE id=?", ...args, s.id);
      return s.id;
    }
    return Number(run("INSERT INTO staff (grp, name, position, bio, photo, email, phone, sort) VALUES (?,?,?,?,?,?,?,?)", ...args).lastInsertRowid);
  },
  remove: (id: number) => run("DELETE FROM staff WHERE id = ?", id),
};

/* ---------------------------------------------------------------- gallery */

export interface AlbumRow {
  id: number;
  title: L10n;
  sort: number;
  count: number;
  cover: string | null;
}
export interface ImageRow {
  id: number;
  album_id: number | null;
  file: string;
  caption: L10n;
  width: number | null;
  height: number | null;
  sort: number;
}
const mapImg = (r: Row): ImageRow => ({ ...(r as unknown as ImageRow), caption: parseL10n(r.caption as string) });

export const gallery = {
  albums: () =>
    all<Row>(
      `SELECT a.*, (SELECT COUNT(*) FROM gallery_images i WHERE i.album_id = a.id) count,
              (SELECT file FROM gallery_images i WHERE i.album_id = a.id ORDER BY sort, id LIMIT 1) cover
       FROM gallery_albums a ORDER BY a.sort, a.id DESC`,
    ).map((r) => ({ ...(r as unknown as AlbumRow), title: parseL10n(r.title as string) })),
  album: (id: number) => {
    const r = get<Row>("SELECT * FROM gallery_albums WHERE id = ?", id);
    return r ? { id: r.id as number, title: parseL10n(r.title as string), sort: r.sort as number } : undefined;
  },
  images: (albumId?: number, limit = 500) =>
    (albumId
      ? all<Row>("SELECT * FROM gallery_images WHERE album_id = ? ORDER BY sort, id LIMIT ?", albumId, limit)
      : all<Row>("SELECT * FROM gallery_images ORDER BY id DESC LIMIT ?", limit)
    ).map(mapImg),
  image: (id: number) => {
    const r = get<Row>("SELECT * FROM gallery_images WHERE id = ?", id);
    return r ? mapImg(r) : undefined;
  },
  saveAlbum: (a: { id?: number; title: L10n; sort: number }) => {
    if (a.id) {
      run("UPDATE gallery_albums SET title=?, sort=? WHERE id=?", JSON.stringify(a.title), a.sort, a.id);
      return a.id;
    }
    return Number(run("INSERT INTO gallery_albums (title, sort) VALUES (?, ?)", JSON.stringify(a.title), a.sort).lastInsertRowid);
  },
  removeAlbum: (id: number) => run("DELETE FROM gallery_albums WHERE id = ?", id),
  addImage: (i: { album_id: number | null; file: string; caption: L10n; width: number | null; height: number | null }) =>
    Number(
      run("INSERT INTO gallery_images (album_id, file, caption, width, height) VALUES (?,?,?,?,?)", i.album_id, i.file, JSON.stringify(i.caption), i.width, i.height)
        .lastInsertRowid,
    ),
  updateImage: (id: number, caption: L10n, sort: number) => run("UPDATE gallery_images SET caption=?, sort=? WHERE id=?", JSON.stringify(caption), sort, id),
  removeImage: (id: number) => run("DELETE FROM gallery_images WHERE id = ?", id),
  imagesCount: () => get<{ n: number }>("SELECT COUNT(*) n FROM gallery_images")!.n,
};

/* ---------------------------------------------------------- announcements */

export interface AnnouncementRow {
  id: number;
  text: L10n;
  link: string | null;
  starts_on: string | null;
  ends_on: string | null;
  active: number;
}
const mapAnn = (r: Row): AnnouncementRow => ({ ...(r as unknown as AnnouncementRow), text: parseL10n(r.text as string) });

export const announcements = {
  current: () =>
    all<Row>(
      `SELECT * FROM announcements WHERE active = 1 AND (starts_on IS NULL OR starts_on = '' OR starts_on <= date('now'))
       AND (ends_on IS NULL OR ends_on = '' OR ends_on >= date('now')) ORDER BY id DESC`,
    ).map(mapAnn),
  all: () => all<Row>("SELECT * FROM announcements ORDER BY id DESC").map(mapAnn),
  byId: (id: number) => {
    const r = get<Row>("SELECT * FROM announcements WHERE id = ?", id);
    return r ? mapAnn(r) : undefined;
  },
  save: (a: Omit<AnnouncementRow, "id"> & { id?: number }) => {
    const args = [JSON.stringify(a.text), a.link, a.starts_on, a.ends_on, a.active] as const;
    if (a.id) {
      run("UPDATE announcements SET text=?, link=?, starts_on=?, ends_on=?, active=? WHERE id=?", ...args, a.id);
      return a.id;
    }
    return Number(run("INSERT INTO announcements (text, link, starts_on, ends_on, active) VALUES (?,?,?,?,?)", ...args).lastInsertRowid);
  },
  remove: (id: number) => run("DELETE FROM announcements WHERE id = ?", id),
};

/* --------------------------------------------------------------- messages */

export interface MessageRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  body: string;
  lang: string;
  status: "new" | "read" | "archived";
  created_at: string;
}

export const messages = {
  create: (m: { name: string; email: string; phone: string; subject: string; body: string; lang: string; ip: string }) =>
    Number(run("INSERT INTO messages (name, email, phone, subject, body, lang, ip) VALUES (?,?,?,?,?,?,?)", m.name, m.email, m.phone, m.subject, m.body, m.lang, m.ip).lastInsertRowid),
  list: (status?: string) =>
    status ? all<MessageRow>("SELECT * FROM messages WHERE status = ? ORDER BY id DESC LIMIT 500", status) : all<MessageRow>("SELECT * FROM messages WHERE status <> 'archived' ORDER BY id DESC LIMIT 500"),
  byId: (id: number) => get<MessageRow>("SELECT * FROM messages WHERE id = ?", id),
  setStatus: (id: number, status: string) => run("UPDATE messages SET status = ? WHERE id = ?", status, id),
  remove: (id: number) => run("DELETE FROM messages WHERE id = ?", id),
  unread: () => get<{ n: number }>("SELECT COUNT(*) n FROM messages WHERE status = 'new'")!.n,
};

/* ----------------------------------------------------------- director blog */

export interface BlogRow {
  id: number;
  name: string;
  email: string;
  question: string;
  answer: string;
  lang: string;
  status: "new" | "published" | "hidden";
  created_at: string;
  answered_at: string | null;
}

export const blog = {
  create: (q: { name: string; email: string; question: string; lang: string; ip: string }) =>
    Number(run("INSERT INTO blog_questions (name, email, question, lang, ip) VALUES (?,?,?,?,?)", q.name, q.email, q.question, q.lang, q.ip).lastInsertRowid),
  published: (lang: Lang, limit: number, offset: number) => {
    const total = get<{ n: number }>("SELECT COUNT(*) n FROM blog_questions WHERE status = 'published' AND lang = ?", lang)!.n;
    const items = all<BlogRow>("SELECT * FROM blog_questions WHERE status = 'published' AND lang = ? ORDER BY answered_at DESC, id DESC LIMIT ? OFFSET ?", lang, limit, offset);
    return { total, items };
  },
  list: () => all<BlogRow>("SELECT * FROM blog_questions ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, id DESC LIMIT 500"),
  byId: (id: number) => get<BlogRow>("SELECT * FROM blog_questions WHERE id = ?", id),
  answer: (id: number, answer: string, status: string) =>
    run("UPDATE blog_questions SET answer = ?, status = ?, answered_at = CASE WHEN ? <> '' THEN datetime('now') ELSE answered_at END WHERE id = ?", answer, status, answer, id),
  remove: (id: number) => run("DELETE FROM blog_questions WHERE id = ?", id),
  pending: () => get<{ n: number }>("SELECT COUNT(*) n FROM blog_questions WHERE status = 'new'")!.n,
};

/* --------------------------------------------------------------- comments */

export interface CommentRow {
  id: number;
  news_id: number;
  name: string;
  body: string;
  lang: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export const comments = {
  create: (c: { news_id: number; name: string; body: string; lang: string; ip: string }) =>
    Number(run("INSERT INTO comments (news_id, name, body, lang, ip) VALUES (?,?,?,?,?)", c.news_id, c.name, c.body, c.lang, c.ip).lastInsertRowid),
  approved: (newsId: number) => all<CommentRow>("SELECT * FROM comments WHERE news_id = ? AND status = 'approved' ORDER BY id", newsId),
  list: (status?: string) =>
    all<CommentRow & { news_slug: string }>(
      `SELECT c.*, n.slug news_slug FROM comments c JOIN news n ON n.id = c.news_id ${status ? "WHERE c.status = ?" : ""} ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END, c.id DESC LIMIT 500`,
      ...(status ? [status] : []),
    ),
  setStatus: (id: number, status: string) => run("UPDATE comments SET status = ? WHERE id = ?", status, id),
  remove: (id: number) => run("DELETE FROM comments WHERE id = ?", id),
  pending: () => get<{ n: number }>("SELECT COUNT(*) n FROM comments WHERE status = 'pending'")!.n,
};

/* ------------------------------------------------------- ui translations */

export const uiOverrides = {
  load(): void {
    const next: Record<Lang, Partial<Dict>> = { kz: {}, ru: {}, en: {} };
    for (const r of all<{ lang: Lang; key: keyof Dict; value: string }>("SELECT lang, key, value FROM ui_overrides")) {
      if (next[r.lang]) next[r.lang][r.key] = r.value;
    }
    setOverrides(next);
  },
  all: () => all<{ lang: Lang; key: string; value: string }>("SELECT lang, key, value FROM ui_overrides"),
  set(lang: Lang, key: string, value: string): void {
    if (value.trim()) run("INSERT INTO ui_overrides (lang, key, value) VALUES (?,?,?) ON CONFLICT(lang, key) DO UPDATE SET value = excluded.value", lang, key, value);
    else run("DELETE FROM ui_overrides WHERE lang = ? AND key = ?", lang, key);
  },
};

/* ----------------------------------------------------------------- visits */

export const visits = {
  hit(day: string, newVisitor: boolean): void {
    run(
      "INSERT INTO visits (day, hits, visitors) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET hits = hits + 1, visitors = visitors + excluded.visitors",
      day, newVisitor ? 1 : 0,
    );
  },
  lastDays: (n: number) => all<{ day: string; hits: number; visitors: number }>("SELECT * FROM visits WHERE day >= date('now', ?) ORDER BY day", `-${n - 1} days`),
  totals: () => get<{ hits: number; visitors: number }>("SELECT COALESCE(SUM(hits),0) hits, COALESCE(SUM(visitors),0) visitors FROM visits")!,
};
