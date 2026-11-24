// End-to-end tests: start the real server on a temporary database and exercise it over HTTP.
// Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "school91-test-"));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = "test";
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "CorrectHorse123";

let server: Server;
let base = "";

before(async () => {
  const mod = await import("../src/server.ts");
  server = mod.createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  const { closeDb } = await import("../src/db/index.ts");
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------ helpers */

class Client {
  jar = new Map<string, string>();
  cookieHeader(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res: Response): void {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i);
      const v = pair.slice(i + 1);
      if (/Max-Age=0/.test(c)) this.jar.delete(k);
      else this.jar.set(k, v);
    }
  }
  async req(p: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(base + p, { ...init, redirect: "manual", headers: { ...(init.headers || {}), cookie: this.cookieHeader() } });
    this.store(res);
    return res;
  }
  async get(p: string) {
    const res = await this.req(p);
    return { res, text: await res.text() };
  }
  async post(p: string, fields: Record<string, string> | FormData) {
    const body = fields instanceof FormData ? fields : new URLSearchParams(fields);
    const res = await this.req(p, { method: "POST", body });
    return { res, text: await res.text() };
  }
}

const tokenOf = (html: string, name: string) => new RegExp(`name="${name}" value="([^"]+)"`).exec(html)?.[1] || "";

/* -------------------------------------------------------------- tests */

test("root redirects to a language and every language home renders", async () => {
  const c = new Client();
  const r = await c.req("/", { headers: { "accept-language": "ru-RU,ru;q=0.9" } });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "/ru");
  for (const [lang, htmlLang] of [["kz", "kk"], ["ru", "ru"], ["en", "en"]]) {
    const { res, text } = await c.get(`/${lang}`);
    assert.equal(res.status, 200, lang);
    assert.match(text, new RegExp(`<html lang="${htmlLang}"`));
    assert.match(text, /hreflang="kk"/);
    assert.match(text, /hreflang="x-default"/);
  }
});

test("crawl: every internal link on all three languages opens without errors", async () => {
  const c = new Client();
  const seen = new Set<string>();
  const queue = ["/kz", "/ru", "/en"];
  const failures: string[] = [];
  const CYR = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;
  while (queue.length) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    let { res, text } = await c.get(url);
    if (res.status === 301 || res.status === 302) {
      const loc = res.headers.get("location")!;
      ({ res, text } = await c.get(loc));
    }
    if (res.status !== 200) {
      failures.push(`${url} → ${res.status}`);
      continue;
    }
    if (!/text\/html/.test(res.headers.get("content-type") || "")) continue;
    if (/\b(undefined|NaN|\[object Object\])\b/.test(text.replace(/<script[\s\S]*?<\/script>/g, ""))) failures.push(`${url} contains undefined/NaN`);
    if (/>(nav|news|form|page|home|err)\.[a-zA-Z.]+</.test(text)) failures.push(`${url} shows a raw translation key`);
    // No language mixing on English pages (language switch labels excluded).
    if (url.startsWith("/en")) {
      const visible = text
        .replace(/<nav class="lang-switch[\s\S]*?<\/nav>/g, "")
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<[^>]+>/g, " ");
      const m = CYR.exec(visible);
      if (m) failures.push(`${url} has Cyrillic text near: "${visible.slice(Math.max(0, m.index - 30), m.index + 30).trim()}"`);
    }
    for (const [, href] of text.matchAll(/href="(\/(?:kz|ru|en)[^"#]*)"/g)) {
      const clean = href.replace(/&amp;/g, "&");
      if (!seen.has(clean) && !clean.endsWith(".xml")) queue.push(clean);
    }
  }
  assert.ok(seen.size > 150, `crawled only ${seen.size} pages`);
  assert.deepEqual(failures, []);
});

test("404 page is localized and returns 404", async () => {
  const c = new Client();
  const { res, text } = await c.get("/kz/no-such-page");
  assert.equal(res.status, 404);
  assert.match(text, /Бет табылмады/);
  const en = await c.get("/en/about/nope");
  assert.equal(en.res.status, 404);
  assert.match(en.text, /Page not found/);
});

test("language switch keeps the same page", async () => {
  const c = new Client();
  const { text } = await c.get("/ru/parents/admission");
  assert.match(text, /href="\/kz\/parents\/admission"/);
  assert.match(text, /href="\/en\/parents\/admission"/);
});

test("sitemap.xml, robots.txt and RSS are valid", async () => {
  const c = new Client();
  const sm = await c.get("/sitemap.xml");
  assert.equal(sm.res.status, 200);
  assert.match(sm.text, /<urlset/);
  assert.match(sm.text, /xhtml:link rel="alternate" hreflang="en"/);
  const robots = await c.get("/robots.txt");
  assert.match(robots.text, /Disallow: \/admin/);
  const rss = await c.get("/ru/rss.xml");
  assert.match(rss.text, /<rss version="2.0"/);
  assert.match(rss.text, /Запущен новый сайт школы/);
});

test("search finds pages and news", async () => {
  const c = new Client();
  const { text } = await c.get(`/ru/search?q=${encodeURIComponent("символ")}`);
  assert.match(text, /Государственные символы/);
  const news = await c.get(`/en/search?q=${encodeURIComponent("website")}`);
  assert.match(news.text, /new <mark>website<\/mark> is live/);
});

test("contact form validates, rejects missing token and stores a valid message", async () => {
  const c = new Client();
  const page = await c.get("/ru/contacts");
  const token = tokenOf(page.text, "_token");
  assert.ok(token);
  const ts = String(Date.now() - 10_000);

  const invalid = await c.post("/ru/contacts", { _token: token, _ts: ts, name: "", email: "bad", message: "" });
  assert.equal(invalid.res.status, 422);
  assert.match(invalid.text, /Заполните это поле/);
  assert.match(invalid.text, /корректный адрес/);

  const noToken = await new Client().post("/ru/contacts", { _ts: ts, name: "A", email: "a@b.kz", message: "Hi", consent: "1" });
  assert.equal(noToken.res.status, 422);

  const ok = await c.post("/ru/contacts", { _token: token, _ts: ts, name: "Айгерим", email: "parent@example.kz", phone: "", subject: "Вопрос о приёме", message: "Здравствуйте! Когда начинается приём в 1 класс?", consent: "1" });
  assert.equal(ok.res.status, 200);
  assert.match(ok.text, /Сообщение отправлено/);
});

test("honeypot submissions are silently dropped", async () => {
  const c = new Client();
  const page = await c.get("/en/contacts");
  const r = await c.post("/en/contacts", { _token: tokenOf(page.text, "_token"), _ts: String(Date.now() - 9000), website: "spam.example", name: "Bot", email: "bot@spam.io", message: "buy", consent: "1" });
  assert.equal(r.res.status, 200);
  assert.match(r.text, /Thank you/);
});

test("admin: login, CSRF, news with image, publication, moderation, roles", async () => {
  const admin = new Client();

  const anon = await admin.req("/admin");
  assert.equal(anon.status, 303);
  assert.match(anon.headers.get("location")!, /\/admin\/login/);

  const bad = await admin.post("/admin/login", { email: "admin@test.local", password: "wrong" });
  assert.equal(bad.res.status, 401);

  const good = await admin.post("/admin/login", { email: "admin@test.local", password: "CorrectHorse123" });
  assert.equal(good.res.status, 303);
  const dash = await admin.get("/admin");
  assert.equal(dash.res.status, 200);
  assert.match(dash.text, /Обзор/);
  const csrf = tokenOf(dash.text, "_csrf");
  assert.ok(csrf);

  // The contact message from the previous test is in the inbox.
  const inbox = await admin.get("/admin/messages");
  assert.match(inbox.text, /Айгерим/);

  // CSRF is enforced.
  const noCsrf = await admin.post("/admin/news/new", { title_ru: "X" });
  assert.equal(noCsrf.res.status, 403);

  // Create a news item in RU + KZ only, with a cover image.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGNzYAAIsCBQGcO2vHAAAAAElFTkSuQmCC", "base64");
  const fd = new FormData();
  fd.set("_csrf", csrf);
  fd.set("title_ru", "Олимпиада по математике");
  fd.set("excerpt_ru", "Итоги городской олимпиады");
  fd.set("body_ru", '<p>Текст <script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">ссылка</a></p>');
  fd.set("title_kz", "Математика олимпиадасы");
  fd.set("body_kz", "<p>Мәтін</p>");
  fd.set("status", "published");
  fd.set("category", "achievements");
  fd.set("published_at", "2026-01-15T10:00");
  fd.set("allow_comments", "1");
  fd.set("image", new Blob([png], { type: "image/png" }), "cover.png");
  const created = await admin.post("/admin/news/new", fd);
  assert.equal(created.res.status, 303);
  assert.match(created.res.headers.get("location")!, /\/admin\/news\/\d+/);

  const pub = new Client();
  const list = await pub.get("/ru/news?category=achievements");
  assert.match(list.text, /Олимпиада по математике/);
  const slug = /href="\/ru\/news\/([^"]+)"[^>]*>Олимпиада/.exec(list.text)?.[1];
  assert.ok(slug, "news link found");
  const article = await pub.get(`/ru/news/${slug}`);
  assert.equal(article.res.status, 200);
  assert.doesNotMatch(article.text, /<script>alert/);
  assert.doesNotMatch(article.text, /javascript:alert/);
  assert.doesNotMatch(article.text, /onclick=/);
  assert.match(article.text, /\/uploads\/\d{4}\/\d{2}\/[a-f0-9]+\.png/);
  const img = /\/uploads\/[^"]+\.png/.exec(article.text)![0];
  const imgRes = await pub.req(img);
  assert.equal(imgRes.status, 200);
  assert.equal(imgRes.headers.get("content-type"), "image/png");

  // Not translated into English: no mixed-language page, offers available languages.
  const en = await pub.get(`/en/news/${slug}`);
  assert.equal(en.res.status, 200);
  assert.match(en.text, /has not been published in English/);
  assert.doesNotMatch(en.text, /Олимпиада по математике/);
  // …and it is absent from the English list.
  const enList = await pub.get("/en/news");
  assert.doesNotMatch(enList.text, /Олимпиада/);

  // Comment → pending → approved by admin → visible.
  const token = tokenOf(article.text, "_token");
  const com = await pub.post(`/ru/news/${slug}`, { _token: token, _ts: String(Date.now() - 5000), name: "Ерлан", body: "Поздравляем победителей!" });
  assert.equal(com.res.status, 200);
  assert.match(com.text, /после проверки модератором/);
  assert.doesNotMatch((await pub.get(`/ru/news/${slug}`)).text, /Поздравляем победителей/);
  const mod = await admin.get("/admin/comments");
  const cid = /action="\/admin\/comments\/(\d+)"/.exec(mod.text)![1];
  await admin.post(`/admin/comments/${cid}`, { _csrf: csrf, status: "approved" });
  assert.match((await pub.get(`/ru/news/${slug}`)).text, /Поздравляем победителей/);

  // Page editing.
  const saved = await admin.post(`/admin/pages/edit?key=${encodeURIComponent("about/history")}`, { _csrf: csrf, lead_ru: "", body_ru: "<p>Школа открыта в … году.</p>", lead_kz: "", body_kz: "", lead_en: "", body_en: "" });
  assert.equal(saved.res.status, 303);
  assert.match((await pub.get("/ru/about/history")).text, /Школа открыта в … году/);
  assert.match((await pub.get("/kz/about/history")).text, /Бөлім толтырылуда/);

  // Director's blog: question → answer → published.
  const blogPage = await pub.get("/kz/director-blog");
  await pub.post("/kz/director-blog", { _token: tokenOf(blogPage.text, "_token"), _ts: String(Date.now() - 5000), name: "Әсел", email: "asel@example.kz", question: "Мектеп формасы қандай?", consent: "1" });
  const qList = await admin.get("/admin/blog");
  const qid = /href="\/admin\/blog\/(\d+)"/.exec(qList.text)![1];
  await admin.post(`/admin/blog/${qid}`, { _csrf: csrf, answer: "Мектеп формасы туралы ақпарат сайтта жарияланады.", status: "published" });
  assert.match((await pub.get("/kz/director-blog")).text, /Мектеп формасы қандай/);

  // Editor role: content yes, settings no.
  await admin.post("/admin/users/new", { _csrf: csrf, name: "Редактор", email: "editor@test.local", role: "editor", password: "EditorPass123" });
  const editor = new Client();
  await editor.post("/admin/login", { email: "editor@test.local", password: "EditorPass123" });
  assert.equal((await editor.get("/admin/news")).res.status, 200);
  assert.equal((await editor.get("/admin/settings")).res.status, 403);
  assert.equal((await editor.get("/admin/users")).res.status, 403);

  // Settings update shows up on the site.
  const settings = await admin.get("/admin/settings");
  const form = new FormData();
  form.set("_csrf", tokenOf(settings.text, "_csrf"));
  for (const [k, v] of Object.entries({ shortName_ru: "Школа №91", shortName_kz: "№91 мектеп", shortName_en: "School No. 91", schoolName_ru: "Школа №91 города Астаны", schoolName_kz: "Астана қаласының №91 мектебі", schoolName_en: "School No. 91, Astana", phone: "+7 (7172) 00-00-91", stat_value_0: "1200", stat_label_0_ru: "учеников" })) form.set(k, v);
  const s = await admin.post("/admin/settings", form);
  assert.equal(s.res.status, 303);
  const home = await pub.get("/ru");
  assert.match(home.text, /\+7 \(7172\) 00-00-91/);
  assert.match(home.text, /data-count="1200"/);

  // UI translation override.
  const tr = await admin.get("/admin/translations?q=hero.more");
  await admin.post("/admin/translations", { _csrf: tokenOf(tr.text, "_csrf"), "ru::hero.more": "Узнать больше" });
  assert.match((await pub.get("/ru")).text, /Узнать больше/);

  // Logout ends the session.
  await admin.post("/admin/logout", { _csrf: csrf });
  assert.equal((await admin.req("/admin")).status, 303);
});

test("menu: «О школе» without gallery, «Профком» between budget and official", async () => {
  const c = new Client();
  const { text } = await c.get("/ru");
  const nav = /<nav class="main-nav"[\s\S]*?<\/nav>/.exec(text)![0];
  const order = [...nav.matchAll(/class="main-nav__link[^"]*" href="\/ru\/([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["about", "students", "parents", "teachers", "upbringing", "budget", "profcom", "official", "news"]);
  const about = /id="mega-about"[\s\S]*?<\/ul>/.exec(nav)![0];
  assert.doesNotMatch(about, /gallery|Фотогалерея/);
  for (const t of ["Педагогический совет", "Согласительная комиссия", "Совет по педагогической этике", "Попечительский совет", "История школы", "Школьная форма"]) assert.match(about, new RegExp(t));
  const profcom = /id="mega-profcom"[\s\S]*?<\/ul>/.exec(nav)![0];
  for (const slug of ["chairman", "members", "agreement", "acts", "join", "contacts"]) assert.match(profcom, new RegExp(`/ru/profcom/${slug}"`));
  for (const lang of ["kz", "ru", "en"]) {
    for (const slug of ["", "/chairman", "/members", "/agreement", "/acts", "/join", "/contacts"]) {
      const r = await c.get(`/${lang}/profcom${slug}`);
      assert.equal(r.res.status, 200, `/${lang}/profcom${slug}`);
      assert.match(r.text, /theme-profcom/);
    }
  }
  assert.equal((await c.get("/ru/about/gallery")).res.status, 404);
  assert.equal((await c.get("/ru/gallery")).res.status, 200, "gallery page itself is kept");
});

test("profcom: join application lands in admin inbox; acts catalog shows uploaded documents", async () => {
  const c = new Client();
  const page = await c.get("/ru/profcom/join");
  const r = await c.post("/ru/profcom/join", { _token: tokenOf(page.text, "_token"), _ts: String(Date.now() - 5000), name: "Гульнара", email: "g@example.kz", position: "Учитель математики", message: "", consent: "1" });
  assert.equal(r.res.status, 200);
  assert.match(r.text, /Заявка отправлена/);

  const admin = new Client();
  await admin.post("/admin/login", { email: "admin@test.local", password: "CorrectHorse123" });
  const inbox = await admin.get("/admin/messages");
  assert.match(inbox.text, /Гульнара/);
  assert.match(inbox.text, /Заявка на вступление в профсоюз/);

  const csrf = tokenOf(inbox.text, "_csrf");
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  const fd = new FormData();
  fd.set("_csrf", csrf);
  fd.set("page_key", "profcom/acts");
  fd.set("doc_lang", "ru");
  fd.set("title_ru", "Протокол №1");
  fd.set("doc_date", "2026-02-03");
  fd.set("file", new Blob([pdf], { type: "application/pdf" }), "protocol.pdf");
  assert.equal((await admin.post("/admin/documents?back=/admin/documents", fd)).res.status, 303);
  const acts = await c.get("/ru/profcom/acts");
  assert.match(acts.text, /Протокол №1/);
  assert.match(acts.text, /datetime="2026-02-03"/);
  const file = /href="(\/uploads\/[^"]+\.pdf)"/.exec(acts.text)![1];
  const fr = await c.req(file);
  assert.equal(fr.headers.get("content-type"), "application/pdf");
  assert.doesNotMatch(fr.headers.get("content-security-policy") || "", /sandbox/);

  // Chair added through the staff manager appears on the chair page.
  const st = await admin.post("/admin/staff/new", { _csrf: csrf, grp: "profcom_chair", name_ru: "Тест Председатель", position_ru: "Председатель", sort: "0" });
  assert.equal(st.res.status, 303);
  assert.match((await c.get("/ru/profcom/chairman")).text, /Тест Председатель/);
});

test("uploads reject disguised files", async () => {
  const { storeUpload, UploadError } = await import("../src/lib/uploads.ts");
  assert.throws(() => storeUpload({ field: "f", filename: "evil.png", contentType: "image/png", data: Buffer.from("<script>") }, "image"), UploadError);
  assert.throws(() => storeUpload({ field: "f", filename: "evil.html", contentType: "text/html", data: Buffer.from("<b>") }, "document"), UploadError);
  assert.throws(() => storeUpload({ field: "f", filename: "x.svg", contentType: "image/svg+xml", data: Buffer.from("<svg/>") }, "image"), UploadError);
});
