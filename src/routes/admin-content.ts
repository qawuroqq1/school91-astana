import { Router } from "../lib/router.ts";
import { HttpError, type Ctx, type UploadedFile } from "../lib/http.ts";
import { html, sanitizeRichText, type SafeHtml } from "../lib/html.ts";
import { slugify } from "../lib/security.ts";
import { storeUpload, removeUpload, humanSize, UploadError } from "../lib/uploads.ts";
import { LANGS, LANG_META, type L10n, type Lang } from "../i18n/langs.ts";
import { NEWS_CATEGORIES, SECTIONS, cmsPageKeys, findItem } from "../site/structure.ts";
import { announcements, audit, blog, comments, documents, gallery, messages, news, pages, staff, type NewsTr, type StaffRow } from "../db/repo.ts";
import { icon } from "../views/icons.ts";
import { csrf, deleteButton, emptyRow, input, langDots, langTabs, l10nInputs, readL10n, select, checkbox, statusPill, textarea } from "../views/admin/ui.ts";
import { adminCtx, flashRedirect, idParam, int, post, render } from "./admin-kit.ts";

const CAT_LABEL: Record<string, string> = { news: "Новости", events: "Мероприятия", announcements: "Объявления", achievements: "Достижения" };
const GROUP_LABEL: Record<string, string> = { director: "Директор", administration: "Администрация", teachers: "Педагоги", profcom_chair: "Председатель профкома", profcom: "Члены профкома" };
const GROUP_OPTIONS: [string, string][] = Object.entries(GROUP_LABEL);
const isoDateOrNull = (v: string | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v! : null);

function pageKeyOptions(): [string, string][] {
  return cmsPageKeys().map(({ key, section, item }) => [key, `${section.title.ru} → ${item.title.ru}`]);
}
function pageLabel(key: string): string {
  const [s, i] = key.split("/");
  const f = findItem(s, i);
  return f ? `${f.section.title.ru} → ${f.item.title.ru}` : key;
}
function withUploadErrors(ctx: Ctx, back: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof UploadError) return flashRedirect(ctx, back, e.message, "error");
    throw e;
  }
}

/* ================================================================= NEWS */

function newsList(ctx: Ctx): void {
  const a = adminCtx(ctx);
  const q = ctx.query.get("q") || "";
  const status = ctx.query.get("status") || "";
  const category = ctx.query.get("category") || "";
  const rows = news.adminList({ q, status, category });
  render(
    ctx, a, "Новости",
    html`<section class="a-card">
      <form class="a-filters" method="get">
        ${input("q", "Поиск по заголовку", q)}
        ${select("status", "Статус", status, [["", "Все"], ["published", "Опубликованные"], ["draft", "Черновики"]])}
        ${select("category", "Категория", category, [["", "Все"], ...NEWS_CATEGORIES.map((c) => [c, CAT_LABEL[c]] as [string, string])])}
        <button class="a-btn" type="submit">${icon("search", "icon icon-sm")} Показать</button>
      </form>
      <div class="a-table-wrap"><table class="a-table">
        <thead><tr><th>Заголовок</th><th>Категория</th><th>Языки</th><th>Дата</th><th>Статус</th><th>Просм.</th><th></th></tr></thead>
        <tbody>${rows.length
          ? rows.map((n) => {
              const titles = Object.fromEntries(String(n.titles || "").split("\u0001").filter(Boolean).map((x) => [x.slice(0, 2), x.slice(3)]));
              return html`<tr>
                <td><a href="/admin/news/${n.id}"><b>${titles.ru || titles.kz || titles.en || n.slug}</b></a>${n.featured ? html` <span class="pill pill--accent">Главная</span>` : ""}</td>
                <td>${CAT_LABEL[n.category] || n.category}</td><td>${langDots(n.langs)}</td><td>${n.published_at.slice(0, 16)}</td><td>${statusPill(n.status)}</td><td>${n.views}</td>
                <td class="a-right"><a class="a-btn a-btn--sm" href="/admin/news/${n.id}">${icon("edit", "icon icon-sm")} Изменить</a></td></tr>`;
            })
          : emptyRow(7, "Публикаций не найдено")}</tbody>
      </table></div>
    </section>`,
    html`<a class="a-btn a-btn--primary" href="/admin/news/new">${icon("plus", "icon icon-sm")} Добавить новость</a>`,
  );
}

function newsForm(ctx: Ctx, id?: number): void {
  const a = adminCtx(ctx);
  const n = id ? news.byId(id) : undefined;
  if (id && !n) throw new HttpError(404);
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  render(
    ctx, a, n ? "Редактирование публикации" : "Новая публикация",
    html`<form class="a-form" method="post" action="/admin/news/${n ? n.id : "new"}" enctype="multipart/form-data">
      ${csrf(a)}
      <div class="a-grid-main">
        <section class="a-card">
          <h2>Текст</h2>
          <p class="a-muted">Заполните языки, на которых публикуется материал. Публикация показывается только на тех языках, где указан заголовок — языки на одной странице не смешиваются.</p>
          ${langTabs(
            "news",
            (l) => html`${input(`title_${l}`, "Заголовок", n?.tr[l]?.title)}${textarea(`excerpt_${l}`, "Краткое описание (для карточки и поисковиков)", n?.tr[l]?.excerpt, { rows: 2 })}${textarea(`body_${l}`, "Текст публикации", n?.tr[l]?.body, { rows: 14, rich: true })}`,
            n ? (l) => !!n.tr[l] : undefined,
          )}
        </section>
        <aside class="a-stack">
          <section class="a-card">
            <h2>Публикация</h2>
            ${select("status", "Статус", n?.status || "draft", [["draft", "Черновик"], ["published", "Опубликовано"]])}
            ${input("published_at", "Дата публикации", (n?.published_at || now).replace(" ", "T").slice(0, 16), { type: "datetime-local", required: true })}
            ${select("category", "Категория", n?.category || "news", NEWS_CATEGORIES.map((c) => [c, CAT_LABEL[c]] as [string, string]))}
            ${input("event_date", "Дата мероприятия (для анонсов)", n?.event_date || "", { type: "date" })}
            ${input("slug", "Адрес (slug)", n?.slug || "", { hint: "Латиницей. Если оставить пустым — создастся из заголовка.", attrs: 'pattern="[a-z0-9-]*"' })}
            ${checkbox("featured", "Закрепить как главную новость", !!n?.featured)}
            ${checkbox("allow_comments", "Разрешить комментарии (с модерацией)", n ? !!n.allow_comments : true)}
          </section>
          <section class="a-card">
            <h2>Обложка</h2>
            ${n?.image ? html`<img class="a-thumb a-thumb--wide" src="${n.image}" alt="" />${checkbox("image_remove", "Удалить обложку", false)}` : html`<p class="a-muted">Без обложки показывается аккуратный графический фон.</p>`}
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp" />
          </section>
          <div class="a-sticky a-sticky--side">
            <button class="a-btn a-btn--primary a-btn--block" type="submit">${icon("check", "icon icon-sm")} Сохранить</button>
            ${n?.status === "published" ? html`<a class="a-btn a-btn--ghost a-btn--block" href="/${LANGS.find((l) => n.tr[l]) || "ru"}/news/${n.slug}" target="_blank" rel="noopener">${icon("external", "icon icon-sm")} Открыть на сайте</a>` : ""}
          </div>
        </aside>
      </div>
    </form>
    ${n ? deleteButton(a, `/admin/news/${n.id}/delete`, "Удалить публикацию") : ""}`,
  );
}

async function saveNews(ctx: Ctx, id?: number): Promise<void> {
  const { user, f, body } = await post(ctx);
  const existing = id ? news.byId(id) : undefined;
  if (id && !existing) throw new HttpError(404);
  const tr: Partial<Record<Lang, NewsTr>> = {};
  for (const l of LANGS) {
    const title = (f[`title_${l}`] || "").trim().slice(0, 300);
    if (title) tr[l] = { title, excerpt: (f[`excerpt_${l}`] || "").trim().slice(0, 600), body: sanitizeRichText(f[`body_${l}`] || "") };
  }
  const back = id ? `/admin/news/${id}` : "/admin/news/new";
  if (!Object.keys(tr).length) return flashRedirect(ctx, back, "Укажите заголовок хотя бы на одном языке", "error");
  let slug = slugify(f.slug || tr.ru?.title || tr.kz?.title || tr.en?.title || "news");
  if (news.slugExists(slug, id || 0)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  let image = existing?.image ?? null;
  const file = body.files.find((x) => x.field === "image");
  try {
    if (file) {
      removeUpload(image);
      image = storeUpload(file, "image").file;
    } else if (f.image_remove === "1") {
      removeUpload(image);
      image = null;
    }
  } catch (e) {
    if (e instanceof UploadError) return flashRedirect(ctx, back, e.message, "error");
    throw e;
  }
  const published = (f.published_at || "").replace("T", " ");
  const savedId = news.save(
    {
      id,
      slug,
      category: (NEWS_CATEGORIES as readonly string[]).includes(f.category) ? f.category : "news",
      image,
      event_date: /^\d{4}-\d{2}-\d{2}$/.test(f.event_date || "") ? f.event_date : null,
      published_at: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(published) ? published.slice(0, 16) + ":00" : new Date().toISOString().slice(0, 19).replace("T", " "),
      status: f.status === "published" ? "published" : "draft",
      featured: f.featured === "1" ? 1 : 0,
      allow_comments: f.allow_comments === "1" ? 1 : 0,
    },
    tr,
    user.id,
  );
  audit(user.id, id ? "изменил новость" : "добавил новость", tr.ru?.title || tr.kz?.title || slug);
  flashRedirect(ctx, `/admin/news/${savedId}`, "Публикация сохранена");
}

/* ================================================================ PAGES */

function pagesList(ctx: Ctx): void {
  const a = adminCtx(ctx);
  const rows = new Map<string, Set<string>>();
  for (const l of LANGS) for (const p of pages.allForLang(l)) (rows.get(p.key) ?? rows.set(p.key, new Set()).get(p.key)!).add(l);
  const docCounts = new Map<string, number>();
  for (const d of documents.all()) docCounts.set(d.page_key, (docCounts.get(d.page_key) || 0) + 1);
  render(
    ctx, a, "Страницы сайта",
    html`<p class="a-muted">Структура разделов фиксирована (одинакова на всех языках). Нажмите на страницу, чтобы отредактировать текст и прикрепить документы.</p>
    ${SECTIONS.filter((s) => s.items.some((i) => i.kind !== "link")).map(
      (s) => html`<section class="a-card"><h2>${icon(s.icon, "icon icon-sm")} ${s.title.ru}</h2>
        <div class="a-table-wrap"><table class="a-table"><thead><tr><th>Страница</th><th>Тип</th><th>Заполнено</th><th>Документы</th><th></th></tr></thead><tbody>
        ${s.items.filter((i) => i.kind !== "link").map((it) => {
          const key = `${s.slug}/${it.slug}`;
          return html`<tr><td><a href="/admin/pages/edit?key=${encodeURIComponent(key)}"><b>${it.title.ru}</b></a><br /><small class="a-muted">/${key}</small></td>
            <td>${it.kind === "staff" ? html`Сотрудники <a href="/admin/staff">(${GROUP_LABEL[it.staffGroup || ""] || ""})</a>` : "Текст"}</td>
            <td>${langDots([...(rows.get(key) || [])].join(","))}</td><td>${docCounts.get(key) || 0}</td>
            <td class="a-right"><a class="a-btn a-btn--sm" href="/admin/pages/edit?key=${encodeURIComponent(key)}">${icon("edit", "icon icon-sm")} Редактировать</a></td></tr>`;
        })}
        </tbody></table></div></section>`,
    )}`,
  );
}

function pageForm(ctx: Ctx): void {
  const a = adminCtx(ctx);
  const key = ctx.query.get("key") || "";
  const [s, i] = key.split("/");
  const found = findItem(s, i);
  if (!found || found.item.kind === "link") throw new HttpError(404);
  const content = pages.get(key);
  const docs = documents.forPage(key);
  render(
    ctx, a, `Страница: ${found.item.title.ru}`,
    html`<form class="a-form" method="post" action="/admin/pages/edit?key=${encodeURIComponent(key)}">
      ${csrf(a)}
      <section class="a-card">
        <p class="a-muted">${found.section.title.ru} → ${found.item.title.ru}. ${found.item.kind === "staff" ? "Список сотрудников редактируется в разделе «Сотрудники»; здесь можно добавить вводный текст." : ""} Если текст на языке не заполнен, посетитель увидит пометку «Раздел наполняется».</p>
        ${langTabs(
          "page",
          (l) => html`${textarea(`lead_${l}`, "Подзаголовок (необязательно)", content?.tr[l]?.lead, { rows: 2 })}${textarea(`body_${l}`, "Текст страницы", content?.tr[l]?.body, { rows: 18, rich: true })}`,
          (l) => !!content?.tr[l]?.body,
        )}
      </section>
      <div class="a-sticky">
        <button class="a-btn a-btn--primary" type="submit">${icon("check", "icon icon-sm")} Сохранить страницу</button>
        ${LANGS.map((l) => html`<a class="a-btn a-btn--ghost" href="/${l}/${key}" target="_blank" rel="noopener">${icon("external", "icon icon-sm")} ${LANG_META[l].short}</a>`)}
      </div>
    </form>
    <section class="a-card">
      <h2>Документы на странице</h2>
      ${docsTable(a, docs, `/admin/pages/edit?key=${encodeURIComponent(key)}`)}
      ${docUploadForm(a, key, `/admin/pages/edit?key=${encodeURIComponent(key)}`)}
    </section>`,
  );
}

async function savePage(ctx: Ctx): Promise<void> {
  const { user, f } = await post(ctx);
  const key = ctx.query.get("key") || "";
  const [s, i] = key.split("/");
  if (!findItem(s, i)) throw new HttpError(404);
  const tr: Partial<Record<Lang, { lead: string; body: string }>> = {};
  for (const l of LANGS) tr[l] = { lead: (f[`lead_${l}`] || "").trim().slice(0, 400), body: sanitizeRichText(f[`body_${l}`] || "").trim() };
  pages.save(key, tr, user.id);
  audit(user.id, "изменил страницу", pageLabel(key));
  flashRedirect(ctx, `/admin/pages/edit?key=${encodeURIComponent(key)}`, "Страница сохранена");
}

/* ============================================================ DOCUMENTS */

function docsTable(a: ReturnType<typeof adminCtx>, docs: ReturnType<typeof documents.all>, back: string, showPage = false): SafeHtml {
  return html`<div class="a-table-wrap"><table class="a-table">
    <thead><tr><th>Название</th>${showPage ? html`<th>Страница</th>` : ""}<th>Язык документа</th><th>Файл</th><th></th></tr></thead>
    <tbody>${docs.length
      ? docs.map(
          (d) => html`<tr><td><b>${d.title.ru || d.title.kz || d.title.en || d.original_name}</b>${langDots(Object.keys(d.title).join(","))}</td>${showPage ? html`<td>${pageLabel(d.page_key)}</td>` : ""}
            <td>${LANG_META[d.doc_lang as Lang]?.label || d.doc_lang}</td>
            <td><a href="${d.file}" target="_blank" rel="noopener">${d.original_name}</a><br /><small class="a-muted">${humanSize(d.size)}</small></td>
            <td class="a-right"><a class="a-btn a-btn--sm" href="/admin/documents/${d.id}?back=${encodeURIComponent(back)}">${icon("edit", "icon icon-sm")}</a> ${deleteButton(a, `/admin/documents/${d.id}/delete?back=${encodeURIComponent(back)}`, "")}</td></tr>`,
        )
      : emptyRow(showPage ? 5 : 4, "Документов пока нет")}</tbody></table></div>`;
}

function docUploadForm(a: ReturnType<typeof adminCtx>, pageKey: string | null, back: string): SafeHtml {
  return html`<form class="a-form a-upload" method="post" action="/admin/documents?back=${encodeURIComponent(back)}" enctype="multipart/form-data">
    ${csrf(a)}
    <h3>${icon("plus", "icon icon-sm")} Загрузить документ</h3>
    <div class="a-row">
      ${pageKey ? html`<input type="hidden" name="page_key" value="${pageKey}" />` : select("page_key", "Страница", "", pageKeyOptions())}
      ${select("doc_lang", "Язык документа", "ru", LANGS.map((l) => [l, LANG_META[l].label] as [string, string]), { hint: "Если перевода нет — не создавайте фиктивный: посетитель увидит пометку о языке оригинала." })}
    </div>
    ${l10nInputs("title", "Название документа (на языках, где он доступен)", {})}
    ${input("doc_date", "Дата документа (необязательно; например, дата приказа или протокола)", "", { type: "date" })}
    <label class="a-field"><span>Файлы (PDF, DOC/DOCX, XLS/XLSX, PPT, JPG/PNG…) — можно несколько</span><input type="file" name="file" multiple required /></label>
    <button class="a-btn a-btn--primary" type="submit">${icon("download", "icon icon-sm")} Загрузить</button>
  </form>`;
}

function documentsPage(ctx: Ctx): void {
  const a = adminCtx(ctx);
  render(ctx, a, "Документы", html`<section class="a-card">${docUploadForm(a, null, "/admin/documents")}</section><section class="a-card"><h2>Все документы</h2>${docsTable(a, documents.all(), "/admin/documents", true)}</section>`);
}

async function uploadDocs(ctx: Ctx): Promise<void> {
  const { user, f, body } = await post(ctx);
  const back = safeBack(ctx.query.get("back"), "/admin/documents");
  const key = f.page_key || "";
  const [s, i] = key.split("/");
  if (!findItem(s, i)) return flashRedirect(ctx, back, "Выберите страницу", "error");
  const files = body.files.filter((x) => x.field === "file");
  if (!files.length) return flashRedirect(ctx, back, "Выберите файл", "error");
  const lang = LANGS.includes(f.doc_lang as Lang) ? f.doc_lang : "ru";
  const baseTitle = readL10n(f, "title");
  withUploadErrors(ctx, back, () => {
    for (const file of files) {
      const st = storeUpload(file, "document");
      const title: L10n = Object.keys(baseTitle).length && files.length === 1 ? baseTitle : { [lang]: st.original.replace(/\.[^.]+$/, "") };
      documents.create({ page_key: key, file: st.file, original_name: st.original, mime: st.mime, size: st.size, doc_lang: lang, title, sort: 0, doc_date: isoDateOrNull(f.doc_date) });
      audit(user.id, "загрузил документ", st.original);
    }
    flashRedirect(ctx, back, files.length > 1 ? `Загружено файлов: ${files.length}` : "Документ загружен");
  });
}

function safeBack(back: string | null, fallback: string): string {
  return back && back.startsWith("/admin") && !back.startsWith("//") ? back : fallback;
}

function documentForm(ctx: Ctx, id: number): void {
  const a = adminCtx(ctx);
  const d = documents.byId(id);
  if (!d) throw new HttpError(404);
  const back = safeBack(ctx.query.get("back"), "/admin/documents");
  render(
    ctx, a, "Документ",
    html`<form class="a-form a-card" method="post" action="/admin/documents/${d.id}?back=${encodeURIComponent(back)}">
      ${csrf(a)}
      <p>Файл: <a href="${d.file}" target="_blank" rel="noopener">${d.original_name}</a> (${humanSize(d.size)})</p>
      <div class="a-row">${select("page_key", "Страница", d.page_key, pageKeyOptions())}${select("doc_lang", "Язык документа", d.doc_lang, LANGS.map((l) => [l, LANG_META[l].label] as [string, string]))}</div>
      ${l10nInputs("title", "Название", d.title)}
      <div class="a-row">${input("doc_date", "Дата документа", d.doc_date || "", { type: "date" })}${input("sort", "Порядок (меньше — выше)", d.sort, { type: "number" })}</div>
      <div class="a-form__foot"><button class="a-btn a-btn--primary" type="submit">Сохранить</button><a class="a-btn a-btn--ghost" href="${back}">Назад</a></div>
    </form>`,
  );
}

/* ================================================================ STAFF */

function staffList(ctx: Ctx): void {
  const a = adminCtx(ctx);
  const rows = staff.all();
  render(
    ctx, a, "Сотрудники",
    html`<section class="a-card"><p class="a-muted">Используется на страницах «Директор школы», «Администрация», «Педагогический состав», «Председатель профкома» и «Члены профкома». Добавляйте только реальные данные сотрудников с их согласия.</p>
      <div class="a-table-wrap"><table class="a-table"><thead><tr><th></th><th>ФИО</th><th>Должность</th><th>Группа</th><th>Порядок</th><th></th></tr></thead><tbody>
      ${rows.length
        ? rows.map(
            (p) => html`<tr><td>${p.photo ? html`<img class="a-avatar" src="${p.photo}" alt="" />` : html`<span class="a-avatar a-avatar--empty">${icon("user", "icon icon-sm")}</span>`}</td>
              <td><a href="/admin/staff/${p.id}"><b>${p.name.ru || p.name.kz || p.name.en}</b></a></td><td>${p.position.ru || p.position.kz || ""}</td><td>${GROUP_LABEL[p.grp]}</td><td>${p.sort}</td>
              <td class="a-right"><a class="a-btn a-btn--sm" href="/admin/staff/${p.id}">${icon("edit", "icon icon-sm")} Изменить</a></td></tr>`,
          )
        : emptyRow(6, "Сотрудники ещё не добавлены")}
      </tbody></table></div></section>`,
    html`<a class="a-btn a-btn--primary" href="/admin/staff/new">${icon("plus", "icon icon-sm")} Добавить сотрудника</a>`,
  );
}

function staffForm(ctx: Ctx, id?: number): void {
  const a = adminCtx(ctx);
  const p = id ? staff.byId(id) : undefined;
  if (id && !p) throw new HttpError(404);
  render(
    ctx, a, p ? "Сотрудник" : "Новый сотрудник",
    html`<form class="a-form a-card" method="post" action="/admin/staff/${p ? p.id : "new"}" enctype="multipart/form-data">
      ${csrf(a)}
      <div class="a-row">${select("grp", "Группа", p?.grp || (ctx.query.get("grp") || "teachers"), GROUP_OPTIONS)}${input("sort", "Порядок", p?.sort ?? 0, { type: "number" })}</div>
      ${l10nInputs("name", "ФИО", p?.name)}
      ${l10nInputs("position", "Должность / предмет", p?.position)}
      ${langTabs("bio", (l) => textarea(`bio_${l}`, "Краткая информация (образование, стаж, достижения)", p?.bio[l], { rows: 6, rich: true }))}
      <div class="a-row">${input("email", "Эл. почта (необязательно)", p?.email, { type: "email" })}${input("phone", "Телефон (необязательно)", p?.phone)}</div>
      <div class="a-field"><span>Фото</span>${p?.photo ? html`<img class="a-thumb" src="${p.photo}" alt="" />${checkbox("photo_remove", "Удалить фото", false)}` : ""}<input type="file" name="photo" accept="image/*" /></div>
      <div class="a-form__foot"><button class="a-btn a-btn--primary" type="submit">Сохранить</button><a class="a-btn a-btn--ghost" href="/admin/staff">Отмена</a></div>
    </form>
    ${p ? deleteButton(a, `/admin/staff/${p.id}/delete`) : ""}`,
  );
}

async function saveStaff(ctx: Ctx, id?: number): Promise<void> {
  const { user, f, body } = await post(ctx);
  const existing = id ? staff.byId(id) : undefined;
  if (id && !existing) throw new HttpError(404);
  const name = readL10n(f, "name");
  const back = id ? `/admin/staff/${id}` : "/admin/staff/new";
  if (!Object.keys(name).length) return flashRedirect(ctx, back, "Укажите ФИО", "error");
  const bio: L10n = {};
  for (const l of LANGS) {
    const b = sanitizeRichText(f[`bio_${l}`] || "").trim();
    if (b) bio[l] = b;
  }
  let photo = existing?.photo ?? null;
  const file = body.files.find((x) => x.field === "photo");
  withUploadErrors(ctx, back, () => {
    if (file) {
      removeUpload(photo);
      photo = storeUpload(file, "image").file;
    } else if (f.photo_remove === "1") {
      removeUpload(photo);
      photo = null;
    }
    const grp = (f.grp in GROUP_LABEL ? f.grp : "teachers") as StaffRow["grp"];
    const saved = staff.save({ id, grp, name, position: readL10n(f, "position"), bio, photo, email: (f.email || "").trim() || null, phone: (f.phone || "").trim() || null, sort: int(f.sort) });
    audit(user.id, id ? "изменил сотрудника" : "добавил сотрудника", name.ru || name.kz || "");
    flashRedirect(ctx, `/admin/staff/${saved}`, "Сохранено");
  });
}

/* ============================================================== GALLERY */

function galleryPage(ctx: Ctx): void {
  const a = adminCtx(ctx);
  const albums = gallery.albums();
  render(
    ctx, a, "Фотогалерея",
    html`<section class="a-card"><h2>Альбомы</h2>
      <ul class="a-albums">${albums.map((al) => html`<li><a href="/admin/gallery/${al.id}">${al.cover ? html`<img src="${al.cover}" alt="" />` : html`<span class="a-albums__empty">${icon("image")}</span>`}<b>${al.title.ru || al.title.kz || "Без названия"}</b><small>${al.count} фото</small></a></li>`)}</ul>
      ${albums.length ? "" : html`<p class="a-muted">Альбомов пока нет.</p>`}
    </section>
    <form class="a-form a-card" method="post" action="/admin/gallery">
      ${csrf(a)}<h2>${icon("plus", "icon icon-sm")} Новый альбом</h2>
      ${l10nInputs("title", "Название альбома", {})}
      <button class="a-btn a-btn--primary" type="submit">Создать альбом</button>
    </form>`,
  );
}

function albumPage(ctx: Ctx, id: number): void {
  const a = adminCtx(ctx);
  const al = gallery.album(id);
  if (!al) throw new HttpError(404);
  const imgs = gallery.images(id);
  render(
    ctx, a, `Альбом: ${al.title.ru || al.title.kz || ""}`,
    html`<form class="a-form a-card a-upload" method="post" action="/admin/gallery/${id}/upload" enctype="multipart/form-data">
      ${csrf(a)}<h2>${icon("plus", "icon icon-sm")} Добавить фотографии</h2>
      <label class="a-field a-drop"><span>Выберите или перетащите изображения (JPG, PNG, WebP; до 25 МБ каждое)</span><input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple required /></label>
      <button class="a-btn a-btn--primary" type="submit">Загрузить</button>
    </form>
    <form class="a-form a-card" method="post" action="/admin/gallery/${id}">
      ${csrf(a)}
      <h2>Фотографии (${imgs.length})</h2>
      ${l10nInputs("title", "Название альбома", al.title)}
      ${input("sort", "Порядок альбома", al.sort, { type: "number" })}
      <ul class="a-photos">${imgs.map(
        (im) => html`<li><img src="${im.file}" alt="" loading="lazy" />
          ${l10nInputs(`cap_${im.id}`, "Подпись", im.caption)}
          <div class="a-row">${input(`sort_${im.id}`, "Порядок", im.sort, { type: "number" })}${checkbox(`del_${im.id}`, "Удалить", false)}</div></li>`,
      )}</ul>
      <div class="a-sticky"><button class="a-btn a-btn--primary" type="submit">${icon("check", "icon icon-sm")} Сохранить</button><a class="a-btn a-btn--ghost" href="/admin/gallery">К альбомам</a></div>
    </form>
    ${deleteButton(a, `/admin/gallery/${id}/delete`, "Удалить альбом со всеми фото")}`,
  );
}

/* ======================================================== ANNOUNCEMENTS */

function annList(ctx: Ctx): void {
  const a = adminCtx(ctx);
  render(
    ctx, a, "Объявления",
    html`<section class="a-card"><p class="a-muted">Активное объявление показывается в верхней полосе сайта и в блоке «Объявления» на главной.</p>
      <div class="a-table-wrap"><table class="a-table"><thead><tr><th>Текст</th><th>Период</th><th>Статус</th><th></th></tr></thead><tbody>
      ${announcements.all().map(
        (x) => html`<tr><td>${x.text.ru || x.text.kz || x.text.en}</td><td>${x.starts_on || "…"} — ${x.ends_on || "…"}</td><td>${x.active ? html`<span class="pill pill--ok">Активно</span>` : html`<span class="pill pill--muted">Выключено</span>`}</td>
          <td class="a-right"><a class="a-btn a-btn--sm" href="/admin/announcements/${x.id}">${icon("edit", "icon icon-sm")} Изменить</a></td></tr>`,
      )}</tbody></table></div></section>`,
    html`<a class="a-btn a-btn--primary" href="/admin/announcements/new">${icon("plus", "icon icon-sm")} Добавить объявление</a>`,
  );
}

function annForm(ctx: Ctx, id?: number): void {
  const a = adminCtx(ctx);
  const x = id ? announcements.byId(id) : undefined;
  if (id && !x) throw new HttpError(404);
  render(
    ctx, a, x ? "Объявление" : "Новое объявление",
    html`<form class="a-form a-card" method="post" action="/admin/announcements/${x ? x.id : "new"}">
      ${csrf(a)}
      ${l10nInputs("text", "Текст объявления", x?.text, { textarea: true })}
      ${input("link", "Ссылка «Подробнее» (необязательно)", x?.link, { placeholder: "/ru/news/... или https://..." })}
      <div class="a-row">${input("starts_on", "Показывать с", x?.starts_on, { type: "date" })}${input("ends_on", "Показывать по", x?.ends_on, { type: "date" })}</div>
      ${checkbox("active", "Активно", x ? !!x.active : true)}
      <div class="a-form__foot"><button class="a-btn a-btn--primary" type="submit">Сохранить</button><a class="a-btn a-btn--ghost" href="/admin/announcements">Отмена</a></div>
    </form>
    ${x ? deleteButton(a, `/admin/announcements/${x.id}/delete`) : ""}`,
  );
}

/* ============================================================= MESSAGES */

function messagesPage(ctx: Ctx): void {
  const a = adminCtx(ctx);
  const status = ctx.query.get("status") || "";
  const rows = messages.list(status || undefined);
  render(
    ctx, a, "Сообщения с сайта",
    html`<section class="a-card">
      <nav class="a-chips">${[["", "Входящие"], ["new", "Новые"], ["archived", "Архив"]].map(([v, l]) => html`<a href="/admin/messages${v ? `?status=${v}` : ""}"${status === v ? html` aria-current="page"` : ""}>${l}</a>`)}</nav>
      <div class="a-table-wrap"><table class="a-table"><thead><tr><th>От кого</th><th>Тема</th><th>Язык</th><th>Дата</th><th>Статус</th><th></th></tr></thead><tbody>
      ${rows.length
        ? rows.map((m) => html`<tr class="${m.status === "new" ? "is-new" : ""}"><td><b>${m.name}</b><br /><small>${m.email}</small></td><td>${m.subject || m.body.slice(0, 60)}</td><td>${m.lang.toUpperCase()}</td><td>${m.created_at.slice(0, 16)}</td><td>${statusPill(m.status)}</td><td class="a-right"><a class="a-btn a-btn--sm" href="/admin/messages/${m.id}">Открыть</a></td></tr>`)
        : emptyRow(6, "Сообщений нет")}
      </tbody></table></div></section>`,
  );
}

function messagePage(ctx: Ctx, id: number): void {
  const a = adminCtx(ctx);
  const m = messages.byId(id);
  if (!m) throw new HttpError(404);
  if (m.status === "new") {
    messages.setStatus(id, "read");
    a.badges.messages = Math.max(0, a.badges.messages - 1);
  }
  render(
    ctx, a, "Сообщение",
    html`<section class="a-card a-message">
      <dl class="a-dl"><dt>От</dt><dd>${m.name}</dd><dt>Эл. почта</dt><dd><a href="mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.subject || "Обращение на сайт школы"))}">${m.email}</a></dd>${m.phone ? html`<dt>Телефон</dt><dd><a href="tel:${m.phone}">${m.phone}</a></dd>` : ""}<dt>Тема</dt><dd>${m.subject || "—"}</dd><dt>Дата</dt><dd>${m.created_at}</dd><dt>Язык</dt><dd>${m.lang.toUpperCase()}</dd></dl>
      <div class="a-message__body">${m.body.split("\n").map((line) => html`${line}<br />`)}</div>
      <div class="a-form__foot">
        <a class="a-btn a-btn--primary" href="mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.subject || "Обращение на сайт школы"))}">${icon("mail", "icon icon-sm")} Ответить по почте</a>
        <form method="post" action="/admin/messages/${m.id}/status" class="a-inline">${csrf(a)}<input type="hidden" name="status" value="${m.status === "archived" ? "read" : "archived"}" /><button class="a-btn" type="submit">${m.status === "archived" ? "Вернуть во входящие" : "В архив"}</button></form>
        ${deleteButton(a, `/admin/messages/${m.id}/delete`)}
      </div>
    </section>`,
  );
}

/* ================================================================= BLOG */

function blogPage(ctx: Ctx): void {
  const a = adminCtx(ctx);
  render(
    ctx, a, "Блог директора",
    html`<section class="a-card"><p class="a-muted">Вопросы сначала поступают сюда. На сайте вопрос и ответ появляются только после публикации.</p>
      <div class="a-table-wrap"><table class="a-table"><thead><tr><th>Вопрос</th><th>Автор</th><th>Язык</th><th>Дата</th><th>Статус</th><th></th></tr></thead><tbody>
      ${blog.list().map((q) => html`<tr class="${q.status === "new" ? "is-new" : ""}"><td>${q.question.slice(0, 120)}${q.question.length > 120 ? "…" : ""}</td><td>${q.name}<br /><small>${q.email}</small></td><td>${q.lang.toUpperCase()}</td><td>${q.created_at.slice(0, 16)}</td><td>${statusPill(q.status)}</td><td class="a-right"><a class="a-btn a-btn--sm" href="/admin/blog/${q.id}">Ответить</a></td></tr>`)}
      </tbody></table></div></section>`,
  );
}

function blogItem(ctx: Ctx, id: number): void {
  const a = adminCtx(ctx);
  const q = blog.byId(id);
  if (!q) throw new HttpError(404);
  render(
    ctx, a, "Вопрос директору",
    html`<form class="a-form a-card" method="post" action="/admin/blog/${q.id}">
      ${csrf(a)}
      <dl class="a-dl"><dt>Автор</dt><dd>${q.name} (<a href="mailto:${q.email}">${q.email}</a>)</dd><dt>Язык</dt><dd>${LANG_META[q.lang as Lang]?.label || q.lang}</dd><dt>Дата</dt><dd>${q.created_at}</dd></dl>
      <blockquote class="a-quote">${q.question}</blockquote>
      ${textarea("answer", "Ответ директора (будет опубликован вместе с вопросом)", q.answer, { rows: 8 })}
      ${select("status", "Статус", q.status, [["new", "Не опубликован (новый)"], ["published", "Опубликовать на сайте"], ["hidden", "Скрыть"]])}
      <p class="a-muted">Имя автора будет показано на сайте; эл. почта — нет.</p>
      <div class="a-form__foot"><button class="a-btn a-btn--primary" type="submit">Сохранить</button><a class="a-btn a-btn--ghost" href="/admin/blog">Назад</a></div>
    </form>
    ${deleteButton(a, `/admin/blog/${q.id}/delete`)}`,
  );
}

/* ============================================================= COMMENTS */

function commentsPage(ctx: Ctx): void {
  const a = adminCtx(ctx);
  const rows = comments.list();
  render(
    ctx, a, "Комментарии",
    html`<section class="a-card"><div class="a-table-wrap"><table class="a-table"><thead><tr><th>Комментарий</th><th>Публикация</th><th>Дата</th><th>Статус</th><th></th></tr></thead><tbody>
      ${rows.length
        ? rows.map(
            (c) => html`<tr class="${c.status === "pending" ? "is-new" : ""}"><td><b>${c.name}</b><br />${c.body}</td><td><a href="/${c.lang}/news/${c.news_slug}" target="_blank" rel="noopener">${c.news_slug}</a></td><td>${c.created_at.slice(0, 16)}</td><td>${statusPill(c.status)}</td>
              <td class="a-right a-nowrap">
                ${c.status !== "approved" ? html`<form method="post" action="/admin/comments/${c.id}" class="a-inline">${csrf(a)}<input type="hidden" name="status" value="approved" /><button class="a-btn a-btn--sm a-btn--ok" type="submit">${icon("check", "icon icon-sm")} Одобрить</button></form>` : ""}
                ${c.status !== "rejected" ? html`<form method="post" action="/admin/comments/${c.id}" class="a-inline">${csrf(a)}<input type="hidden" name="status" value="rejected" /><button class="a-btn a-btn--sm" type="submit">Отклонить</button></form>` : ""}
                ${deleteButton(a, `/admin/comments/${c.id}/delete`, "")}
              </td></tr>`,
          )
        : emptyRow(5, "Комментариев нет")}
      </tbody></table></div></section>`,
  );
}

/* =============================================================== ROUTES */

export function contentRoutes(r: Router): void {
  r.get("/admin/news", newsList);
  r.get("/admin/news/new", (ctx) => newsForm(ctx));
  r.post("/admin/news/new", (ctx) => saveNews(ctx));
  r.get("/admin/news/:id", (ctx, p) => newsForm(ctx, idParam(p)));
  r.post("/admin/news/:id", (ctx, p) => saveNews(ctx, idParam(p)));
  r.post("/admin/news/:id/delete", async (ctx, p) => {
    const { user } = await post(ctx);
    const n = news.byId(idParam(p));
    if (!n) throw new HttpError(404);
    removeUpload(n.image);
    news.remove(n.id);
    audit(user.id, "удалил новость", n.slug);
    flashRedirect(ctx, "/admin/news", "Публикация удалена");
  });

  r.get("/admin/pages", pagesList);
  r.get("/admin/pages/edit", pageForm);
  r.post("/admin/pages/edit", savePage);

  r.get("/admin/documents", documentsPage);
  r.post("/admin/documents", uploadDocs);
  r.get("/admin/documents/:id", (ctx, p) => documentForm(ctx, idParam(p)));
  r.post("/admin/documents/:id", async (ctx, p) => {
    const { user, f } = await post(ctx);
    const d = documents.byId(idParam(p));
    if (!d) throw new HttpError(404);
    const [s, i] = (f.page_key || "").split("/");
    documents.update(d.id, {
      page_key: findItem(s, i) ? f.page_key : d.page_key,
      doc_lang: LANGS.includes(f.doc_lang as Lang) ? f.doc_lang : d.doc_lang,
      title: readL10n(f, "title"),
      sort: int(f.sort),
      doc_date: isoDateOrNull(f.doc_date),
    });
    audit(user.id, "изменил документ", d.original_name);
    flashRedirect(ctx, safeBack(ctx.query.get("back"), "/admin/documents"), "Документ сохранён");
  });
  r.post("/admin/documents/:id/delete", async (ctx, p) => {
    const { user } = await post(ctx);
    const d = documents.byId(idParam(p));
    if (!d) throw new HttpError(404);
    removeUpload(d.file);
    documents.remove(d.id);
    audit(user.id, "удалил документ", d.original_name);
    flashRedirect(ctx, safeBack(ctx.query.get("back"), "/admin/documents"), "Документ удалён");
  });

  r.get("/admin/staff", staffList);
  r.get("/admin/staff/new", (ctx) => staffForm(ctx));
  r.post("/admin/staff/new", (ctx) => saveStaff(ctx));
  r.get("/admin/staff/:id", (ctx, p) => staffForm(ctx, idParam(p)));
  r.post("/admin/staff/:id", (ctx, p) => saveStaff(ctx, idParam(p)));
  r.post("/admin/staff/:id/delete", async (ctx, p) => {
    const { user } = await post(ctx);
    const s = staff.byId(idParam(p));
    if (!s) throw new HttpError(404);
    removeUpload(s.photo);
    staff.remove(s.id);
    audit(user.id, "удалил сотрудника", s.name.ru || "");
    flashRedirect(ctx, "/admin/staff", "Сотрудник удалён");
  });

  r.get("/admin/gallery", galleryPage);
  r.post("/admin/gallery", async (ctx) => {
    const { user, f } = await post(ctx);
    const title = readL10n(f, "title");
    if (!Object.keys(title).length) return flashRedirect(ctx, "/admin/gallery", "Укажите название альбома", "error");
    const id = gallery.saveAlbum({ title, sort: 0 });
    audit(user.id, "создал альбом", title.ru || title.kz || "");
    flashRedirect(ctx, `/admin/gallery/${id}`, "Альбом создан — добавьте фотографии");
  });
  r.get("/admin/gallery/:id", (ctx, p) => albumPage(ctx, idParam(p)));
  r.post("/admin/gallery/:id", async (ctx, p) => {
    const { user, f } = await post(ctx);
    const id = idParam(p);
    const al = gallery.album(id);
    if (!al) throw new HttpError(404);
    gallery.saveAlbum({ id, title: readL10n(f, "title"), sort: int(f.sort) });
    for (const im of gallery.images(id)) {
      if (f[`del_${im.id}`] === "1") {
        removeUpload(im.file);
        gallery.removeImage(im.id);
      } else {
        gallery.updateImage(im.id, readL10n(f, `cap_${im.id}`), int(f[`sort_${im.id}`]));
      }
    }
    audit(user.id, "изменил альбом", al.title.ru || "");
    flashRedirect(ctx, `/admin/gallery/${id}`, "Альбом сохранён");
  });
  r.post("/admin/gallery/:id/upload", async (ctx, p) => {
    const { user, body } = await post(ctx);
    const id = idParam(p);
    if (!gallery.album(id)) throw new HttpError(404);
    const files: UploadedFile[] = body.files.filter((x) => x.field === "photos");
    if (!files.length) return flashRedirect(ctx, `/admin/gallery/${id}`, "Выберите изображения", "error");
    withUploadErrors(ctx, `/admin/gallery/${id}`, () => {
      for (const file of files) {
        const st = storeUpload(file, "image");
        gallery.addImage({ album_id: id, file: st.file, caption: {}, width: st.width, height: st.height });
      }
      audit(user.id, "загрузил фото", `${files.length} шт.`);
      flashRedirect(ctx, `/admin/gallery/${id}`, `Загружено фото: ${files.length}`);
    });
  });
  r.post("/admin/gallery/:id/delete", async (ctx, p) => {
    const { user } = await post(ctx);
    const id = idParam(p);
    for (const im of gallery.images(id)) removeUpload(im.file);
    gallery.removeAlbum(id);
    audit(user.id, "удалил альбом", String(id));
    flashRedirect(ctx, "/admin/gallery", "Альбом удалён");
  });

  r.get("/admin/announcements", annList);
  r.get("/admin/announcements/new", (ctx) => annForm(ctx));
  const saveAnn = async (ctx: Ctx, id?: number) => {
    const { user, f } = await post(ctx);
    const text = readL10n(f, "text");
    if (!Object.keys(text).length) return flashRedirect(ctx, ctx.path, "Укажите текст объявления", "error");
    const link = (f.link || "").trim();
    const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);
    const saved = announcements.save({ id, text, link: /^(https?:\/\/|\/)/.test(link) ? link : null, starts_on: date(f.starts_on), ends_on: date(f.ends_on), active: f.active === "1" ? 1 : 0 });
    audit(user.id, id ? "изменил объявление" : "добавил объявление");
    flashRedirect(ctx, `/admin/announcements/${saved}`, "Объявление сохранено");
  };
  r.post("/admin/announcements/new", (ctx) => saveAnn(ctx));
  r.get("/admin/announcements/:id", (ctx, p) => annForm(ctx, idParam(p)));
  r.post("/admin/announcements/:id", (ctx, p) => saveAnn(ctx, idParam(p)));
  r.post("/admin/announcements/:id/delete", async (ctx, p) => {
    const { user } = await post(ctx);
    announcements.remove(idParam(p));
    audit(user.id, "удалил объявление");
    flashRedirect(ctx, "/admin/announcements", "Объявление удалено");
  });

  r.get("/admin/messages", messagesPage);
  r.get("/admin/messages/:id", (ctx, p) => messagePage(ctx, idParam(p)));
  r.post("/admin/messages/:id/status", async (ctx, p) => {
    const { f } = await post(ctx);
    const id = idParam(p);
    messages.setStatus(id, ["new", "read", "archived"].includes(f.status) ? f.status : "read");
    flashRedirect(ctx, `/admin/messages/${id}`, "Статус обновлён");
  });
  r.post("/admin/messages/:id/delete", async (ctx, p) => {
    const { user } = await post(ctx);
    messages.remove(idParam(p));
    audit(user.id, "удалил сообщение");
    flashRedirect(ctx, "/admin/messages", "Сообщение удалено");
  });

  r.get("/admin/blog", blogPage);
  r.get("/admin/blog/:id", (ctx, p) => blogItem(ctx, idParam(p)));
  r.post("/admin/blog/:id", async (ctx, p) => {
    const { user, f } = await post(ctx);
    const id = idParam(p);
    if (!blog.byId(id)) throw new HttpError(404);
    const answer = (f.answer || "").trim().slice(0, 8000);
    const status = ["new", "published", "hidden"].includes(f.status) ? f.status : "new";
    if (status === "published" && !answer) return flashRedirect(ctx, `/admin/blog/${id}`, "Чтобы опубликовать, напишите ответ", "error");
    blog.answer(id, answer, status);
    audit(user.id, "ответил в блоге директора", `#${id}`);
    flashRedirect(ctx, `/admin/blog/${id}`, status === "published" ? "Ответ опубликован" : "Сохранено");
  });
  r.post("/admin/blog/:id/delete", async (ctx, p) => {
    const { user } = await post(ctx);
    blog.remove(idParam(p));
    audit(user.id, "удалил вопрос блога");
    flashRedirect(ctx, "/admin/blog", "Вопрос удалён");
  });

  r.get("/admin/comments", commentsPage);
  r.post("/admin/comments/:id", async (ctx, p) => {
    const { user, f } = await post(ctx);
    comments.setStatus(idParam(p), f.status === "approved" ? "approved" : "rejected");
    audit(user.id, f.status === "approved" ? "одобрил комментарий" : "отклонил комментарий");
    flashRedirect(ctx, "/admin/comments", "Готово");
  });
  r.post("/admin/comments/:id/delete", async (ctx, p) => {
    const { user } = await post(ctx);
    comments.remove(idParam(p));
    audit(user.id, "удалил комментарий");
    flashRedirect(ctx, "/admin/comments", "Комментарий удалён");
  });
}
