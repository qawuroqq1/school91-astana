import { Router } from "../lib/router.ts";
import { HttpError, readBody, redirect, send, json, type Ctx } from "../lib/http.ts";
import { html } from "../lib/html.ts";
import { RateLimiter, hashPassword, verifyPassword } from "../lib/security.ts";
import { endSession, loadUser, startSession, verifyCsrf, requireUser } from "../lib/auth.ts";
import { storeUpload, UploadError, removeUpload } from "../lib/uploads.ts";
import { LANGS, LANG_META, type Lang } from "../i18n/langs.ts";
import { DICTS } from "../i18n/index.ts";
import type { DictKey } from "../i18n/ru.ts";
import { audit, news, pages, recentAudit, sessions, uiOverrides, users, visits } from "../db/repo.ts";
import { getSettings, saveSettings, type Settings, type Stat, type UsefulLink } from "../db/settings.ts";
import { cmsPageKeys } from "../site/structure.ts";
import { icon } from "../views/icons.ts";
import { csrf, deleteButton, input, l10nInputs, readL10n, select, checkbox } from "../views/admin/ui.ts";
import { adminCtx, flashRedirect, idParam, post, render } from "./admin-kit.ts";
import { contentRoutes } from "./admin-content.ts";

const loginLimiter = new RateLimiter(8, 15 * 60 * 1000);

function loginPage(error = "", email = ""): string {
  return html`<!doctype html><html lang="ru"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" />
<title>Вход — Панель управления</title><link rel="icon" href="/img/favicon.svg" type="image/svg+xml" /><link rel="stylesheet" href="/css/admin.css?v=20261119" /></head>
<body class="a-login">
<main class="a-login__card">
  <img src="/img/logo.svg" alt="" width="56" height="56" />
  <h1>Панель управления</h1>
  <p class="a-muted">Сайт школы №91 г. Астаны</p>
  ${error ? html`<div class="a-flash a-flash--error" role="alert">${icon("alert", "icon icon-sm")}${error}</div>` : ""}
  <form method="post" action="/admin/login">
    ${input("email", "Логин (эл. почта)", email, { type: "email", required: true, attrs: 'autocomplete="username" autofocus' })}
    ${input("password", "Пароль", "", { type: "password", required: true, attrs: 'autocomplete="current-password"' })}
    <button class="a-btn a-btn--primary a-btn--block" type="submit">Войти</button>
  </form>
  <a class="a-muted" href="/">← На сайт</a>
</main></body></html>`.value;
}

/* ------------------------------------------------------------ dashboard */

function dashboard(ctx: Ctx): void {
  const a = adminCtx(ctx);
  const ns = news.stats();
  const days = visits.lastDays(14);
  const totals = visits.totals();
  const max = Math.max(1, ...days.map((d) => d.hits));
  const filled = pages.filled();
  const keys = cmsPageKeys().filter((k) => k.item.kind === "page");
  const fillPct = Math.round((keys.filter((k) => filled.has(k.key)).length / Math.max(1, keys.length)) * 100);
  const today = days.find((d) => d.day === new Date().toISOString().slice(0, 10));
  const card = (label: string, value: string | number, ico: string, href?: string) =>
    html`<a class="a-stat" href="${href || "#"}">${icon(ico, "icon")}<span class="a-stat__v">${value}</span><span class="a-stat__l">${label}</span></a>`;
  render(
    ctx, a, "Обзор",
    html`<div class="a-stats">
      ${card("Посещений сегодня", today?.hits ?? 0, "eye")}
      ${card("Посетителей за 14 дней", days.reduce((s, d) => s + d.visitors, 0), "users")}
      ${card("Опубликовано новостей", ns.published ?? 0, "newspaper", "/admin/news")}
      ${card("Новых сообщений", a.badges.messages, "inbox", "/admin/messages")}
      ${card("Вопросов директору", a.badges.blog, "message", "/admin/blog")}
      ${card("Страниц заполнено", `${fillPct}%`, "file", "/admin/pages")}
    </div>
    <div class="a-grid-2">
      <section class="a-card">
        <h2>Посещаемость за 14 дней</h2>
        ${days.length
          ? html`<div class="a-bars" role="img" aria-label="График посещений">${days.map((d) => html`<div class="a-bar" style="--h:${Math.round((d.hits / max) * 100)}%" title="${d.day}: ${d.hits} просмотров, ${d.visitors} посетителей"><span>${d.hits}</span><small>${d.day.slice(8)}.${d.day.slice(5, 7)}</small></div>`)}</div>`
          : html`<p class="a-muted">Данных пока нет — статистика появится после первых посещений сайта.</p>`}
        <p class="a-muted">Всего за всё время: ${totals.hits} просмотров, ${totals.visitors} посетителей.</p>
      </section>
      <section class="a-card">
        <h2>Популярные публикации</h2>
        <ol class="a-list">${news.top(6).map((n) => html`<li><a href="/admin/news/${n.id}">${n.title}</a><span class="a-muted">${n.views} просм.</span></li>`)}</ol>
        <h2>Последние действия</h2>
        <ol class="a-list a-list--small">${recentAudit(8).map((r) => html`<li><span>${r.name || "—"}: ${r.action} ${r.target}</span><time class="a-muted">${r.created_at.slice(0, 16)}</time></li>`)}</ol>
      </section>
    </div>
    <section class="a-card">
      <h2>Быстрые действия</h2>
      <div class="a-quick">
        <a class="a-btn a-btn--primary" href="/admin/news/new">${icon("plus", "icon icon-sm")} Добавить новость</a>
        <a class="a-btn" href="/admin/pages">${icon("edit", "icon icon-sm")} Редактировать страницы</a>
        <a class="a-btn" href="/admin/documents">${icon("download", "icon icon-sm")} Загрузить документ</a>
        <a class="a-btn" href="/admin/gallery">${icon("image", "icon icon-sm")} Добавить фото</a>
      </div>
    </section>`,
  );
}

/* ------------------------------------------------------------- settings */

function settingsPage(ctx: Ctx): void {
  const a = adminCtx(ctx, "admin");
  const s = getSettings();
  const statRows = [...s.stats, ...Array.from({ length: Math.max(0, 4 - s.stats.length) }, () => ({ value: 0, suffix: "", label: {} }) as Stat)];
  const linkRows = [...s.usefulLinks, ...Array.from({ length: 2 }, () => ({ url: "", title: {} }) as UsefulLink)];
  render(
    ctx, a, "Настройки сайта",
    html`<form class="a-form" method="post" action="/admin/settings" enctype="multipart/form-data">
      ${csrf(a)}
      <section class="a-card"><h2>Школа</h2>
        ${l10nInputs("schoolName", "Полное название", s.schoolName)}
        ${l10nInputs("shortName", "Краткое название (в шапке)", s.shortName)}
        ${l10nInputs("slogan", "Слоган (главная страница)", s.slogan)}
        ${l10nInputs("heroText", "Текст на первом экране", s.heroText, { textarea: true })}
        ${l10nInputs("aboutText", "Блок «О школе» на главной", s.aboutText, { textarea: true, rows: 3 })}
      </section>
      <section class="a-card"><h2>Контакты</h2>
        <p class="a-muted">Пустые поля показываются на сайте как «Уточняется». Указывайте только проверенные данные.</p>
        ${l10nInputs("address", "Адрес", s.address)}
        ${l10nInputs("hours", "Режим работы", s.hours)}
        <div class="a-row">${input("phone", "Телефон", s.phone, { placeholder: "+7 (7172) 00-00-00" })}${input("email", "Эл. почта", s.email, { type: "email" })}</div>
        <div class="a-row">${input("mapLat", "Широта (карта)", s.mapLat, { placeholder: "51.1282" })}${input("mapLng", "Долгота (карта)", s.mapLng, { placeholder: "71.4306" })}</div>
        ${input("gis2Url", "Ссылка на организацию в 2GIS", s.gis2Url, { type: "url" })}
      </section>
      <section class="a-card"><h2>Контакты профкома</h2>
        <p class="a-muted">Показываются на странице «Профком → Контакты профкома». Пустые поля — «Уточняется».</p>
        <div class="a-row">${input("profcomPhone", "Телефон профкома", s.profcomPhone)}${input("profcomEmail", "Эл. почта профкома", s.profcomEmail, { type: "email" })}</div>
        ${l10nInputs("profcomRoom", "Где найти (кабинет, этаж)", s.profcomRoom)}
        ${l10nInputs("profcomHours", "Часы приёма", s.profcomHours)}
      </section>
      <section class="a-card"><h2>Социальные сети</h2>
        <div class="a-row">${input("instagram", "Instagram", s.instagram, { type: "url" })}${input("facebook", "Facebook", s.facebook, { type: "url" })}</div>
        <div class="a-row">${input("youtube", "YouTube", s.youtube, { type: "url" })}${input("telegram", "Telegram", s.telegram, { type: "url" })}</div>
      </section>
      <section class="a-card"><h2>Изображения</h2>
        <div class="a-row">
          <div class="a-field"><span>Фото на первом экране</span>${s.heroImage ? html`<img class="a-thumb" src="${s.heroImage}" alt="" />` : html`<small>Сейчас показывается временная иллюстрация.</small>`}<input type="file" name="heroImage" accept="image/*" />${s.heroImage ? checkbox("heroImage_remove", "Убрать фото", false) : ""}</div>
          <div class="a-field"><span>Логотип (PNG/JPG/WebP, квадратный)</span><img class="a-thumb a-thumb--logo" src="${s.logo || "/img/logo.svg"}" alt="" /><input type="file" name="logo" accept="image/*" />${s.logo ? checkbox("logo_remove", "Вернуть стандартный", false) : ""}</div>
        </div>
      </section>
      <section class="a-card"><h2>Школа в цифрах</h2>
        <p class="a-muted">Публикуйте только подтверждённые показатели. Строки с нулевым значением не показываются.</p>
        ${statRows.map((st, i) => html`<div class="a-row a-row--stat">${input(`stat_value_${i}`, "Значение", st.value || "", { type: "number" })}${input(`stat_suffix_${i}`, "Суффикс", st.suffix || "", { placeholder: "+ или %" })}${l10nInputs(`stat_label_${i}`, "Подпись", st.label)}</div>`)}
      </section>
      <section class="a-card"><h2>Полезные ссылки</h2>
        ${linkRows.map((l, i) => html`<div class="a-row a-row--stat">${input(`link_url_${i}`, "Адрес", l.url, { type: "url" })}${l10nInputs(`link_title_${i}`, "Название", l.title)}</div>`)}
      </section>
      <div class="a-sticky"><button class="a-btn a-btn--primary" type="submit">${icon("check", "icon icon-sm")} Сохранить настройки</button></div>
    </form>`,
  );
}

async function saveSettingsHandler(ctx: Ctx): Promise<void> {
  const { user, f, body } = await post(ctx, "admin");
  const s = getSettings();
  const patch: Partial<Settings> = {};
  for (const k of ["schoolName", "shortName", "slogan", "heroText", "aboutText", "address", "hours", "profcomRoom", "profcomHours"] as const) patch[k] = readL10n(f, k);
  for (const k of ["phone", "email", "instagram", "facebook", "youtube", "telegram", "mapLat", "mapLng", "gis2Url", "profcomPhone", "profcomEmail"] as const) patch[k] = (f[k] || "").trim();
  for (const k of ["mapLat", "mapLng"] as const) if (patch[k] && !Number.isFinite(Number(patch[k]))) patch[k] = "";
  const stats: Stat[] = [];
  for (let i = 0; i < 12; i++) {
    const value = Number(f[`stat_value_${i}`]);
    if (f[`stat_value_${i}`] === undefined) break;
    if (value > 0) stats.push({ value, suffix: (f[`stat_suffix_${i}`] || "").slice(0, 4), label: readL10n(f, `stat_label_${i}`) });
  }
  patch.stats = stats;
  const links: UsefulLink[] = [];
  for (let i = 0; i < 20; i++) {
    if (f[`link_url_${i}`] === undefined) break;
    const url = (f[`link_url_${i}`] || "").trim();
    if (/^https?:\/\//.test(url)) links.push({ url, title: readL10n(f, `link_title_${i}`) });
  }
  patch.usefulLinks = links;
  try {
    for (const key of ["heroImage", "logo"] as const) {
      const file = body.files.find((x) => x.field === key);
      if (file) {
        removeUpload(s[key]);
        patch[key] = storeUpload(file, "image").file;
      } else if (f[`${key}_remove`] === "1") {
        removeUpload(s[key]);
        patch[key] = "";
      }
    }
  } catch (e) {
    if (e instanceof UploadError) return flashRedirect(ctx, "/admin/settings", e.message, "error");
    throw e;
  }
  saveSettings(patch);
  audit(user.id, "изменил настройки");
  flashRedirect(ctx, "/admin/settings", "Настройки сохранены");
}

/* --------------------------------------------------------- translations */

function translationsPage(ctx: Ctx): void {
  const a = adminCtx(ctx, "admin");
  const q = (ctx.query.get("q") || "").toLowerCase();
  const over = new Map(uiOverrides.all().map((o) => [`${o.lang}:${o.key}`, o.value]));
  const keys = (Object.keys(DICTS.ru) as DictKey[]).filter((k) => !q || k.includes(q) || LANGS.some((l) => (over.get(`${l}:${k}`) || DICTS[l][k]).toLowerCase().includes(q)));
  render(
    ctx, a, "Переводы интерфейса",
    html`<section class="a-card">
      <p class="a-muted">Здесь можно изменить любые надписи интерфейса сайта на трёх языках. Пустое поле означает стандартный перевод (показан серым).</p>
      <form class="a-search" method="get">${input("q", "Поиск по ключу или тексту", q)}<button class="a-btn" type="submit">${icon("search", "icon icon-sm")} Найти</button></form>
      <form method="post" action="/admin/translations">
        ${csrf(a)}
        <div class="a-table-wrap"><table class="a-table a-table--tr">
          <thead><tr><th>Ключ</th>${LANGS.map((l) => html`<th>${LANG_META[l].label}</th>`)}</tr></thead>
          <tbody>${keys.map((k) => html`<tr><td><code>${k}</code></td>${LANGS.map((l) => html`<td><textarea name="${l}::${k}" rows="1" placeholder="${DICTS[l][k]}" aria-label="${k} ${LANG_META[l].label}">${over.get(`${l}:${k}`) || ""}</textarea></td>`)}</tr>`)}</tbody>
        </table></div>
        <div class="a-sticky"><button class="a-btn a-btn--primary" type="submit">${icon("check", "icon icon-sm")} Сохранить переводы</button></div>
      </form>
    </section>`,
  );
}

async function saveTranslations(ctx: Ctx): Promise<void> {
  const { user, f } = await post(ctx, "admin");
  const valid = new Set(Object.keys(DICTS.ru));
  for (const [name, value] of Object.entries(f)) {
    const [lang, key] = name.split("::");
    if (!key || !valid.has(key) || !LANGS.includes(lang as Lang)) continue;
    uiOverrides.set(lang as Lang, key, value.trim() === DICTS[lang as Lang][key as DictKey] ? "" : value.trim());
  }
  uiOverrides.load();
  audit(user.id, "изменил переводы интерфейса");
  flashRedirect(ctx, "/admin/translations", "Переводы сохранены");
}

/* ---------------------------------------------------------------- users */

function usersPage(ctx: Ctx): void {
  const a = adminCtx(ctx, "admin");
  render(
    ctx, a, "Пользователи",
    html`<section class="a-card"><div class="a-table-wrap"><table class="a-table">
      <thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Статус</th><th>Последний вход</th><th></th></tr></thead>
      <tbody>${users.list().map(
        (u) => html`<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role === "admin" ? "Администратор" : "Редактор"}</td><td>${u.active ? html`<span class="pill pill--ok">Активен</span>` : html`<span class="pill pill--muted">Отключён</span>`}</td><td>${u.last_login?.slice(0, 16) || "—"}</td><td class="a-right"><a class="a-btn a-btn--sm" href="/admin/users/${u.id}">${icon("edit", "icon icon-sm")} Изменить</a></td></tr>`,
      )}</tbody></table></div></section>
    <section class="a-card"><h2>Роли</h2><ul class="a-muted"><li><b>Администратор</b> — всё, включая настройки, переводы и пользователей.</li><li><b>Редактор</b> — новости, страницы, документы, галерея, сотрудники, объявления, обращения.</li></ul></section>`,
    html`<a class="a-btn a-btn--primary" href="/admin/users/new">${icon("plus", "icon icon-sm")} Добавить пользователя</a>`,
  );
}

function userForm(ctx: Ctx, id?: number): void {
  const a = adminCtx(ctx, "admin");
  const u = id ? users.byId(id) : undefined;
  if (id && !u) throw new HttpError(404);
  render(
    ctx, a, u ? `Пользователь: ${u.name}` : "Новый пользователь",
    html`<form class="a-form a-card" method="post" action="/admin/users/${u ? u.id : "new"}">
      ${csrf(a)}
      <div class="a-row">${input("name", "Имя", u?.name, { required: true })}${input("email", "Логин (эл. почта)", u?.email, { type: "email", required: true, attrs: u ? "readonly" : "" })}</div>
      <div class="a-row">${select("role", "Роль", u?.role || "editor", [["editor", "Редактор"], ["admin", "Администратор"]])}${input("password", u ? "Новый пароль (оставьте пустым, чтобы не менять)" : "Пароль", "", { type: "password", required: !u, hint: "Не короче 10 символов", attrs: 'autocomplete="new-password" minlength="10"' })}</div>
      ${u ? checkbox("active", "Учётная запись активна", !!u.active) : ""}
      <div class="a-form__foot"><button class="a-btn a-btn--primary" type="submit">Сохранить</button><a class="a-btn a-btn--ghost" href="/admin/users">Отмена</a></div>
    </form>
    ${u && u.id !== a.user.id ? deleteButton(a, `/admin/users/${u.id}/delete`, "Удалить пользователя") : ""}`,
  );
}

async function saveUser(ctx: Ctx, id?: number): Promise<void> {
  const { user, f } = await post(ctx, "admin");
  const role = f.role === "admin" ? "admin" : "editor";
  const name = (f.name || "").trim().slice(0, 100);
  const password = f.password || "";
  if (!name) return flashRedirect(ctx, ctx.path, "Укажите имя", "error");
  if (password && password.length < 10) return flashRedirect(ctx, ctx.path, "Пароль должен быть не короче 10 символов", "error");
  if (!id) {
    const email = (f.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return flashRedirect(ctx, ctx.path, "Укажите корректный логин (эл. почту)", "error");
    if (users.byEmail(email)) return flashRedirect(ctx, ctx.path, "Такой пользователь уже существует", "error");
    if (!password) return flashRedirect(ctx, ctx.path, "Укажите пароль", "error");
    const newId = users.create({ email, name, role, password_hash: hashPassword(password) });
    audit(user.id, "создал пользователя", email);
    return flashRedirect(ctx, `/admin/users/${newId}`, "Пользователь создан");
  }
  const target = users.byId(id);
  if (!target) throw new HttpError(404);
  const active = f.active === "1" || target.id === user.id ? 1 : 0;
  const demotingLastAdmin = target.role === "admin" && (role !== "admin" || !active) && users.adminsCount() <= 1;
  if (demotingLastAdmin) return flashRedirect(ctx, ctx.path, "Нельзя отключить или понизить последнего администратора", "error");
  users.update(id, { name, role, active });
  if (password) {
    users.setPassword(id, hashPassword(password));
    sessions.removeForUser(id);
  }
  if (!active) sessions.removeForUser(id);
  audit(user.id, "изменил пользователя", target.email);
  flashRedirect(ctx, `/admin/users/${id}`, "Изменения сохранены");
}

/* -------------------------------------------------------------- profile */

function profilePage(ctx: Ctx): void {
  const a = adminCtx(ctx);
  render(
    ctx, a, "Мой профиль",
    html`<form class="a-form a-card" method="post" action="/admin/profile">
      ${csrf(a)}
      <p>Логин: <b>${a.user.email}</b></p>
      ${input("current", "Текущий пароль", "", { type: "password", required: true, attrs: 'autocomplete="current-password"' })}
      <div class="a-row">${input("password", "Новый пароль", "", { type: "password", required: true, hint: "Не короче 10 символов", attrs: 'autocomplete="new-password" minlength="10"' })}${input("password2", "Повторите новый пароль", "", { type: "password", required: true, attrs: 'autocomplete="new-password"' })}</div>
      <div class="a-form__foot"><button class="a-btn a-btn--primary" type="submit">Сменить пароль</button></div>
    </form>`,
  );
}

async function saveProfile(ctx: Ctx): Promise<void> {
  const { user, f } = await post(ctx);
  if (!verifyPassword(f.current || "", user.password_hash)) return flashRedirect(ctx, "/admin/profile", "Текущий пароль указан неверно", "error");
  if ((f.password || "").length < 10) return flashRedirect(ctx, "/admin/profile", "Новый пароль должен быть не короче 10 символов", "error");
  if (f.password !== f.password2) return flashRedirect(ctx, "/admin/profile", "Пароли не совпадают", "error");
  users.setPassword(user.id, hashPassword(f.password));
  sessions.removeForUser(user.id);
  startSession(ctx, user);
  audit(user.id, "сменил пароль");
  flashRedirect(ctx, "/admin/profile", "Пароль изменён");
}

/* -------------------------------------------------------------- routes */

export function adminError(ctx: Ctx, status: number): void {
  if (status === 401) return redirect(ctx, `/admin/login?next=${encodeURIComponent(ctx.path + ctx.url.search)}`);
  const text: Record<number, string> = { 403: "Недостаточно прав для этого действия.", 404: "Страница не найдена.", 413: "Файл слишком большой.", 500: "Внутренняя ошибка сервера. Подробности записаны в журнал." };
  const user = loadUser(ctx);
  if (user && status !== 500) {
    const a = adminCtx(ctx);
    return render(ctx, a, `Ошибка ${status}`, html`<section class="a-card"><p>${text[status] || "Ошибка запроса."}</p><p><a class="a-btn" href="/admin">На главную панели</a></p></section>`, undefined, status);
  }
  send(ctx, status, `<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="stylesheet" href="/css/admin.css"><body class="a-login"><main class="a-login__card"><h1>Ошибка ${status}</h1><p>${text[status] || "Ошибка запроса."}</p><a href="/admin">Панель управления</a></main></body></html>`);
}

export function adminRoutes(r: Router): void {
  r.get("/admin/login", (ctx) => {
    if (loadUser(ctx)) return redirect(ctx, "/admin");
    send(ctx, 200, loginPage());
  });
  r.post("/admin/login", async (ctx) => {
    const body = await readBody(ctx);
    const email = (body.fields.email || "").trim();
    if (!loginLimiter.take(`${ctx.ip}`)) return send(ctx, 429, loginPage("Слишком много попыток входа. Подождите 15 минут.", email));
    const user = users.byEmail(email);
    // Always run a hash comparison so response time doesn't reveal which logins exist.
    const ok = verifyPassword(body.fields.password || "", user?.password_hash || "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
    if (!user || !ok || !user.active) return send(ctx, 401, loginPage("Неверный логин или пароль.", email));
    loginLimiter.reset(ctx.ip);
    startSession(ctx, user);
    audit(user.id, "вошёл в панель");
    const next = ctx.query.get("next") || "";
    redirect(ctx, next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
  });
  r.post("/admin/logout", async (ctx) => {
    if (loadUser(ctx)) await verifyCsrf(ctx);
    endSession(ctx);
    redirect(ctx, "/admin/login");
  });

  r.get("/admin", dashboard);
  r.get("/admin/settings", settingsPage);
  r.post("/admin/settings", saveSettingsHandler);
  r.get("/admin/translations", translationsPage);
  r.post("/admin/translations", saveTranslations);
  r.get("/admin/users", usersPage);
  r.get("/admin/users/new", (ctx) => userForm(ctx));
  r.post("/admin/users/new", (ctx) => saveUser(ctx));
  r.get("/admin/users/:id", (ctx, p) => userForm(ctx, idParam(p)));
  r.post("/admin/users/:id", (ctx, p) => saveUser(ctx, idParam(p)));
  r.post("/admin/users/:id/delete", async (ctx, p) => {
    const { user } = await post(ctx, "admin");
    const id = idParam(p);
    const target = users.byId(id);
    if (!target) throw new HttpError(404);
    if (target.id === user.id) return flashRedirect(ctx, "/admin/users", "Нельзя удалить собственную учётную запись", "error");
    if (target.role === "admin" && users.adminsCount() <= 1) return flashRedirect(ctx, "/admin/users", "Нельзя удалить последнего администратора", "error");
    users.remove(id);
    audit(user.id, "удалил пользователя", target.email);
    flashRedirect(ctx, "/admin/users", "Пользователь удалён");
  });
  r.get("/admin/profile", profilePage);
  r.post("/admin/profile", saveProfile);

  /* Image upload for the rich-text editor (returns JSON). */
  r.post("/admin/upload-image", async (ctx) => {
    const user = requireUser(ctx);
    await verifyCsrf(ctx);
    const body = await readBody(ctx);
    const file = body.files[0];
    if (!file) return json(ctx, 400, { error: "Файл не выбран" });
    try {
      const stored = storeUpload(file, "image");
      audit(user.id, "загрузил изображение", stored.original);
      json(ctx, 200, { url: stored.file, width: stored.width, height: stored.height });
    } catch (e) {
      if (e instanceof UploadError) return json(ctx, 400, { error: e.message });
      throw e;
    }
  });

  contentRoutes(r);
}
