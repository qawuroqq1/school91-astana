import { Router } from "../lib/router.ts";
import { HttpError, readBody, redirect, send, setCookie, type Ctx } from "../lib/http.ts";
import { escapeHtml, stripTags, truncate } from "../lib/html.ts";
import { RateLimiter } from "../lib/security.ts";
import { publicFormToken, verifyPublicForm } from "../lib/auth.ts";
import { notify } from "../lib/notify.ts";
import { config } from "../config.ts";
import { isoDate, t } from "../i18n/index.ts";
import { DEFAULT_LANG, LANGS, LANG_META, isLang, type Lang } from "../i18n/langs.ts";
import { NEWS_CATEGORIES, SECTIONS, cmsPageKeys, findItem, findSection } from "../site/structure.ts";
import { blog, comments, documents, gallery, messages, news, pages, visits } from "../db/repo.ts";
import { getSettings } from "../db/settings.ts";
import { makeView, type View } from "../views/context.ts";
import { homeView } from "../views/public/home.ts";
import { errorView, pageView, sectionView, sitemapView } from "../views/public/content.ts";
import { newsArchiveView, newsItemView, newsListView, type CommentFormState } from "../views/public/news.ts";
import { blogView, contactsView, galleryView, searchView, type FormState, type SearchHit } from "../views/public/forms.ts";
import { profcomIndexView, profcomPageView } from "../views/public/profcom.ts";

const PER_PAGE = 9;
const formLimiter = new RateLimiter(5, 10 * 60 * 1000);
const commentLimiter = new RateLimiter(6, 10 * 60 * 1000);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse/i;

function view(ctx: Ctx, lang: Lang, rest: string): View {
  return makeView(ctx, lang, rest, publicFormToken(ctx));
}

function langOf(params: Record<string, string>): Lang {
  if (!isLang(params.lang)) throw new HttpError(404);
  return params.lang;
}

function trackVisit(ctx: Ctx): void {
  if (BOT_RE.test(String(ctx.req.headers["user-agent"] || "")) || config.isTest) return;
  const day = isoDate();
  const isNew = ctx.cookies.s91_v !== day;
  if (isNew) setCookie(ctx, "s91_v", day, { maxAge: 86400 * 2 });
  try {
    visits.hit(day, isNew);
  } catch {
    /* statistics must never break the page */
  }
}

function page(ctx: Ctx, body: { value: string }, status = 200): void {
  trackVisit(ctx);
  send(ctx, status, body.value);
}

export function renderError(ctx: Ctx, status: 404 | 500): void {
  const first = ctx.path.split("/")[1];
  const lang = isLang(first) ? first : DEFAULT_LANG;
  const v = view(ctx, lang, "");
  send(ctx, status, errorView(v, status).value);
}

/* ---------------------------------------------------------------- forms */

type Validated = { ok: true; values: Record<string, string> } | { ok: false; values: Record<string, string>; errors: Record<string, string>; notice?: string };

interface Rule {
  name: string;
  required?: boolean;
  max: number;
  email?: boolean;
}

async function validate(ctx: Ctx, lang: Lang, rules: Rule[], needConsent: boolean, limiter: RateLimiter): Promise<Validated> {
  const body = await readBody(ctx);
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const r of rules) {
    const v = (body.fields[r.name] ?? "").trim();
    values[r.name] = v;
    if (r.required && !v) errors[r.name] = t(lang, "form.err.required");
    else if (v.length > r.max) errors[r.name] = t(lang, "form.err.long");
    else if (r.email && v && !EMAIL_RE.test(v)) errors[r.name] = t(lang, "form.err.email");
  }
  if (needConsent && body.fields.consent !== "1") errors.consent = t(lang, "form.err.consent");
  if (!(await verifyPublicForm(ctx))) return { ok: false, values, errors, notice: t(lang, "form.err.expired") };
  // Honeypot or submitted faster than a human can type → pretend success, store nothing.
  const tooFast = Date.now() - Number(body.fields._ts || 0) < 1500;
  if (body.fields.website || tooFast) return { ok: false, values: {}, errors: {}, notice: "__spam__" };
  if (Object.keys(errors).length) return { ok: false, values, errors, notice: t(lang, "form.errors") };
  if (!limiter.take(ctx.ip)) return { ok: false, values, errors, notice: t(lang, "form.err.rate") };
  return { ok: true, values };
}

function toFormState(lang: Lang, r: Validated, successKey: "form.success" | "blog.success" | "comments.moderation" | "pk.join.success"): FormState {
  if (r.ok || r.notice === "__spam__") return { notice: { kind: "success", text: t(lang, successKey) } };
  return { values: r.values, errors: r.errors, notice: r.notice ? { kind: "error", text: r.notice } : undefined };
}

/* --------------------------------------------------------------- search */

/** Flat index used by the static (GitHub Pages) search. */
export function searchIndex(lang: Lang): { type: string; title: string; href: string; text: string; context: string }[] {
  const out: { type: string; title: string; href: string; text: string; context: string }[] = [];
  const pageBodies = new Map(pages.allForLang(lang).map((p) => [p.key, p]));
  for (const s of SECTIONS) for (const it of s.items) {
    if (it.kind === "link") continue;
    const key = `${s.slug}/${it.slug}`;
    const p = pageBodies.get(key);
    out.push({ type: "page", title: it.title[lang] || "", href: `/${lang}/${key}`, text: p ? truncate(stripTags(`${p.lead} ${p.body}`), 2000) : "", context: s.title[lang] || "" });
  }
  for (const n of news.list(lang, { limit: 1000, offset: 0 }).items) out.push({ type: "news", title: n.title, href: `/${lang}/news/${n.slug}`, text: truncate(stripTags(`${n.excerpt} ${n.body}`), 2000), context: "" });
  for (const d of documents.all()) out.push({ type: "doc", title: d.title[lang] || d.title.ru || d.title.kz || d.title.en || d.original_name, href: d.file, text: d.original_name, context: "" });
  return out;
}

function search(v: View, q: string): SearchHit[] {
  const ql = q.toLocaleLowerCase();
  const hits: (SearchHit & { score: number })[] = [];
  const snippetAround = (text: string) => {
    const i = text.toLocaleLowerCase().indexOf(ql);
    if (i < 0) return truncate(text, 180);
    const start = Math.max(0, i - 70);
    return (start ? "…" : "") + truncate(text.slice(start), 200);
  };
  const score = (title: string, text: string) => (title.toLocaleLowerCase().includes(ql) ? 10 : 0) + (text.toLocaleLowerCase().includes(ql) ? 1 : 0);

  // Structure titles (also finds pages that are not filled yet).
  const pageBodies = new Map(pages.allForLang(v.lang).map((p) => [p.key, p]));
  for (const s of SECTIONS) {
    for (const it of s.items) {
      if (it.kind === "link") continue;
      const key = `${s.slug}/${it.slug}`;
      const title = v.l(it.title);
      const p = pageBodies.get(key);
      const text = p ? stripTags(`${p.lead} ${p.body}`) : "";
      const sc = score(title, text);
      if (sc) hits.push({ type: "page", title, href: v.href(key), snippet: text ? snippetAround(text) : "", context: v.l(s.title), score: sc + 1 });
    }
  }
  for (const n of news.list(v.lang, { limit: 500, offset: 0 }).items) {
    const text = stripTags(`${n.excerpt} ${n.body}`);
    const sc = score(n.title, text);
    if (sc) hits.push({ type: "news", title: n.title, href: v.href(`news/${n.slug}`), snippet: snippetAround(text), context: "", score: sc });
  }
  for (const d of documents.all()) {
    const title = v.l(d.title) || d.title.ru || d.title.kz || d.title.en || d.original_name;
    const sc = score(title, d.original_name);
    if (sc) {
      const [sec, slug] = d.page_key.split("/");
      const found = findItem(sec, slug);
      hits.push({ type: "doc", title, href: d.file, snippet: "", context: found ? v.l(found.item.title) : "", score: sc });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 60);
}

/* ------------------------------------------------------------- feeds etc */

function rss(lang: Lang): string {
  const s = getSettings();
  const items = news.list(lang, { limit: 30, offset: 0 }).items;
  const base = config.siteUrl;
  const esc = escapeHtml;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(s.schoolName[lang] || "")}</title>
<link>${base}/${lang}</link>
<description>${esc(s.slogan[lang] || "")}</description>
<language>${LANG_META[lang].htmlLang}</language>
<atom:link href="${base}/${lang}/rss.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (n) => `<item>
<title>${esc(n.title)}</title>
<link>${base}/${lang}/news/${encodeURIComponent(n.slug)}</link>
<guid isPermaLink="true">${base}/${lang}/news/${encodeURIComponent(n.slug)}</guid>
<pubDate>${new Date(n.published_at.replace(" ", "T") + "Z").toUTCString()}</pubDate>
<category>${esc(t(lang, `news.cat.${n.category}` as never))}</category>
<description>${esc(n.excerpt || truncate(stripTags(n.body), 300))}</description>
</item>`,
  )
  .join("\n")}
</channel>
</rss>`;
}

function sitemapXml(): string {
  const base = config.siteUrl;
  const paths = ["", "news", "news/archive", "contacts", "director-blog", "gallery", "sitemap"];
  for (const s of SECTIONS) paths.push(s.slug);
  for (const { key } of cmsPageKeys()) paths.push(key);
  const urls = paths.map(
    (p) => `<url><loc>${base}/kz${p ? "/" + p : ""}</loc>${LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${LANG_META[l].hreflang}" href="${base}/${l}${p ? "/" + p : ""}"/>`).join("")}</url>`,
  );
  // News exist per language: list each translation separately.
  for (const lang of LANGS) {
    for (const n of news.archive(lang)) urls.push(`<url><loc>${base}/${lang}/news/${encodeURIComponent(n.slug)}</loc><lastmod>${n.updated_at.slice(0, 10)}</lastmod></url>`);
  }
  for (const lang of LANGS.filter((l) => l !== "kz")) {
    for (const p of paths) urls.push(`<url><loc>${base}/${lang}${p ? "/" + p : ""}</loc></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>`;
}

function preferredLang(ctx: Ctx): Lang {
  const saved = ctx.cookies.s91_lang;
  if (isLang(saved)) return saved;
  const al = String(ctx.req.headers["accept-language"] || "").toLowerCase();
  for (const part of al.split(",")) {
    const code = part.trim().slice(0, 2);
    if (code === "kk") return "kz";
    if (code === "ru") return "ru";
    if (code === "en") return "en";
  }
  return DEFAULT_LANG;
}

/* --------------------------------------------------------------- routes */

export function publicRoutes(r: Router): void {
  r.get("/", (ctx) => redirect(ctx, `/${preferredLang(ctx)}`, 302));

  r.get("/robots.txt", (ctx) => send(ctx, 200, `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`, "text/plain; charset=utf-8"));
  r.get("/sitemap.xml", (ctx) => send(ctx, 200, sitemapXml(), "application/xml; charset=utf-8"));

  r.get("/:lang", (ctx, p) => {
    const lang = langOf(p);
    setCookie(ctx, "s91_lang", lang, { maxAge: 86400 * 365 });
    page(ctx, homeView(view(ctx, lang, "")));
  });

  r.get("/:lang/rss.xml", (ctx, p) => send(ctx, 200, rss(langOf(p)), "application/rss+xml; charset=utf-8"));

  r.get("/:lang/sitemap", (ctx, p) => page(ctx, sitemapView(view(ctx, langOf(p), "/sitemap"))));

  r.get("/:lang/search", (ctx, p) => {
    const lang = langOf(p);
    const q = (ctx.query.get("q") || "").trim().slice(0, 100);
    const v = view(ctx, lang, "/search");
    page(ctx, searchView(v, q, q.length >= 2 ? search(v, q) : []));
  });

  /* contacts */
  r.get("/:lang/contacts", (ctx, p) => page(ctx, contactsView(view(ctx, langOf(p), "/contacts"))));
  r.post("/:lang/contacts", async (ctx, p) => {
    const lang = langOf(p);
    const res = await validate(
      ctx, lang,
      [
        { name: "name", required: true, max: 120 },
        { name: "email", required: true, max: 160, email: true },
        { name: "phone", max: 40 },
        { name: "subject", max: 200 },
        { name: "message", required: true, max: 5000 },
      ],
      true, formLimiter,
    );
    if (res.ok) {
      const f = res.values;
      messages.create({ name: f.name, email: f.email, phone: f.phone, subject: f.subject, body: f.message, lang, ip: ctx.ip });
      notify(`📩 Новое сообщение с сайта\nОт: ${f.name} <${f.email}>\nТема: ${f.subject || "—"}\n\n${truncate(f.message, 600)}`);
    }
    page(ctx, contactsView(view(ctx, lang, "/contacts"), toFormState(lang, res, "form.success")), res.ok || res.notice === "__spam__" ? 200 : 422);
  });

  /* director blog */
  const blogData = (ctx: Ctx, lang: Lang) => {
    const pg = Math.max(1, Number(ctx.query.get("page")) || 1);
    const { total, items } = blog.published(lang, 10, (pg - 1) * 10);
    return { items, page: pg, pages: Math.max(1, Math.ceil(total / 10)) };
  };
  r.get("/:lang/director-blog", (ctx, p) => {
    const lang = langOf(p);
    page(ctx, blogView(view(ctx, lang, "/director-blog"), blogData(ctx, lang)));
  });
  r.post("/:lang/director-blog", async (ctx, p) => {
    const lang = langOf(p);
    const res = await validate(
      ctx, lang,
      [
        { name: "name", required: true, max: 120 },
        { name: "email", required: true, max: 160, email: true },
        { name: "question", required: true, max: 3000 },
      ],
      true, formLimiter,
    );
    if (res.ok) {
      blog.create({ name: res.values.name, email: res.values.email, question: res.values.question, lang, ip: ctx.ip });
      notify(`❓ Вопрос в блог директора\nОт: ${res.values.name} <${res.values.email}>\n\n${truncate(res.values.question, 600)}`);
    }
    page(ctx, blogView(view(ctx, lang, "/director-blog"), blogData(ctx, lang), toFormState(lang, res, "blog.success")), res.ok || res.notice === "__spam__" ? 200 : 422);
  });

  /* gallery */
  r.get("/:lang/gallery", (ctx, p) => {
    const lang = langOf(p);
    const albums = gallery.albums();
    const loose = gallery.images(undefined, 500).filter((i) => !i.album_id);
    page(ctx, galleryView(view(ctx, lang, "/gallery"), albums, loose));
  });
  r.get("/:lang/gallery/:id", (ctx, p) => {
    const lang = langOf(p);
    const album = gallery.album(Number(p.id));
    if (!album) throw new HttpError(404);
    const v = view(ctx, lang, `/gallery/${album.id}`);
    page(ctx, galleryView(v, [], gallery.images(album.id), { id: album.id, title: v.l(album.title) || album.title.ru || album.title.kz || "" }));
  });

  /* news */
  r.get("/:lang/news", (ctx, p) => {
    const lang = langOf(p);
    const category = (NEWS_CATEGORIES as readonly string[]).includes(ctx.query.get("category") || "") ? ctx.query.get("category")! : "";
    const year = /^\d{4}$/.test(ctx.query.get("year") || "") ? ctx.query.get("year")! : "";
    const pg = Math.max(1, Number(ctx.query.get("page")) || 1);
    const first = pg === 1 ? PER_PAGE + 1 : PER_PAGE; // first page shows a featured card + grid
    const offset = pg === 1 ? 0 : PER_PAGE + 1 + (pg - 2) * PER_PAGE;
    const { total, items } = news.list(lang, { category, year, limit: first, offset });
    const pages = total <= PER_PAGE + 1 ? 1 : 1 + Math.ceil((total - PER_PAGE - 1) / PER_PAGE);
    if (pg > pages && pg > 1) throw new HttpError(404);
    page(ctx, newsListView(view(ctx, lang, "/news"), { items, total, page: pg, pages, category, year, years: news.years(lang) }));
  });
  r.get("/:lang/news/archive", (ctx, p) => {
    const lang = langOf(p);
    page(ctx, newsArchiveView(view(ctx, lang, "/news/archive"), news.archive(lang)));
  });

  const renderNews = (ctx: Ctx, lang: Lang, slug: string, form?: CommentFormState, status = 200) => {
    const item = news.bySlug(slug);
    if (!item) throw new HttpError(404);
    if (!form && ctx.method === "GET" && item.tr[lang]) news.incrementViews(item.id);
    const related = item.tr[lang] ? news.list(lang, { category: item.category, limit: 3, offset: 0, excludeId: item.id }).items : [];
    page(ctx, newsItemView(view(ctx, lang, `/news/${slug}`), item, related, comments.approved(item.id), form), status);
  };
  r.get("/:lang/news/:slug", (ctx, p) => renderNews(ctx, langOf(p), p.slug));
  r.post("/:lang/news/:slug", async (ctx, p) => {
    const lang = langOf(p);
    const item = news.bySlug(p.slug);
    if (!item || !item.allow_comments) throw new HttpError(404);
    const res = await validate(ctx, lang, [{ name: "name", required: true, max: 80 }, { name: "body", required: true, max: 2000 }], false, commentLimiter);
    if (res.ok) {
      comments.create({ news_id: item.id, name: res.values.name, body: res.values.body, lang, ip: ctx.ip });
      notify(`💬 Новый комментарий к «${item.tr[lang]?.title || item.slug}» ожидает модерации`);
    }
    renderNews(ctx, lang, p.slug, toFormState(lang, res, "comments.moderation"), res.ok || res.notice === "__spam__" ? 200 : 422);
  });

  /* trade union: application form */
  r.post("/:lang/profcom/join", async (ctx, p) => {
    const lang = langOf(p);
    const found = findItem("profcom", "join")!;
    const res = await validate(
      ctx, lang,
      [
        { name: "name", required: true, max: 120 },
        { name: "email", required: true, max: 160, email: true },
        { name: "phone", max: 40 },
        { name: "position", max: 160 },
        { name: "message", max: 3000 },
      ],
      true, formLimiter,
    );
    if (res.ok) {
      const f = res.values;
      const body = [f.position ? `Должность: ${f.position}` : "", f.message].filter(Boolean).join("\n\n") || "—";
      messages.create({ name: f.name, email: f.email, phone: f.phone, subject: "Заявка на вступление в профсоюз", body, lang, ip: ctx.ip });
      notify(`🤝 Заявка на вступление в профсоюз\nОт: ${f.name} <${f.email}>${f.phone ? `\nТел.: ${f.phone}` : ""}${f.position ? `\nДолжность: ${f.position}` : ""}`);
    }
    page(ctx, profcomPageView(view(ctx, lang, "/profcom/join"), found.section, found.item, toFormState(lang, res, "pk.join.success")), res.ok || res.notice === "__spam__" ? 200 : 422);
  });

  /* sections and pages (keep last: they match generic paths) */
  r.get("/:lang/:section", (ctx, p) => {
    const lang = langOf(p);
    const section = findSection(p.section);
    if (!section || section.slug === "news") {
      if (section?.slug === "news") return redirect(ctx, `/${lang}/news`, 301);
      throw new HttpError(404);
    }
    const v = view(ctx, lang, `/${section.slug}`);
    page(ctx, section.slug === "profcom" ? profcomIndexView(v, section) : sectionView(v, section));
  });
  r.get("/:lang/:section/:item", (ctx, p) => {
    const lang = langOf(p);
    const found = findItem(p.section, p.item);
    if (!found) throw new HttpError(404);
    if (found.item.kind === "link") return redirect(ctx, `/${lang}/${found.item.href}`, 302);
    const v = view(ctx, lang, `/${p.section}/${p.item}`);
    page(ctx, found.section.slug === "profcom" ? profcomPageView(v, found.section, found.item) : pageView(v, found.section, found.item));
  });
}
