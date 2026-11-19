import { html, attr, raw, type SafeHtml } from "../../lib/html.ts";
import { LANGS, LANG_META, type L10n, type Lang } from "../../i18n/langs.ts";
import type { User } from "../../db/repo.ts";
import { icon } from "../icons.ts";

export interface AdminCtx {
  user: User;
  csrf: string;
  path: string;
  flash?: { kind: "success" | "error"; text: string } | null;
  badges: { messages: number; blog: number; comments: number };
}

const NAV: { href: string; label: string; icon: string; admin?: boolean; badge?: keyof AdminCtx["badges"] }[] = [
  { href: "/admin", label: "Обзор", icon: "chart" },
  { href: "/admin/news", label: "Новости", icon: "newspaper" },
  { href: "/admin/pages", label: "Страницы", icon: "file" },
  { href: "/admin/documents", label: "Документы", icon: "download" },
  { href: "/admin/staff", label: "Сотрудники", icon: "users" },
  { href: "/admin/gallery", label: "Галерея", icon: "image" },
  { href: "/admin/announcements", label: "Объявления", icon: "megaphone" },
  { href: "/admin/messages", label: "Сообщения", icon: "inbox", badge: "messages" },
  { href: "/admin/blog", label: "Блог директора", icon: "message", badge: "blog" },
  { href: "/admin/comments", label: "Комментарии", icon: "quote", badge: "comments" },
  { href: "/admin/translations", label: "Переводы", icon: "globe", admin: true },
  { href: "/admin/settings", label: "Настройки", icon: "settings", admin: true },
  { href: "/admin/users", label: "Пользователи", icon: "user", admin: true },
];

export function adminLayout(a: AdminCtx, title: string, body: SafeHtml, actions?: SafeHtml): SafeHtml {
  return html`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${title} — Админ-панель</title>
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="/css/admin.css?v=20261119" />
<script src="/js/admin.js?v=20261119" defer></script>
</head>
<body class="admin" data-csrf="${a.csrf}">
<a class="skip-link" href="#main">Перейти к содержанию</a>
<aside class="a-side" id="a-side">
  <a class="a-brand" href="/admin"><img src="/img/logo.svg" alt="" width="34" height="34" /><span>Школа №91<small>Панель управления</small></span></a>
  <nav aria-label="Разделы панели">
    <ul>
      ${NAV.filter((n) => !n.admin || a.user.role === "admin").map((n) => {
        const active = n.href === "/admin" ? a.path === "/admin" : a.path.startsWith(n.href);
        const badge = n.badge ? a.badges[n.badge] : 0;
        return html`<li><a href="${n.href}"${attr("aria-current", active ? "page" : false)}>${icon(n.icon, "icon icon-sm")}<span>${n.label}</span>${badge ? html`<b class="badge">${badge}</b>` : ""}</a></li>`;
      })}
    </ul>
  </nav>
  <div class="a-side__foot">
    <a href="/ru" target="_blank" rel="noopener">${icon("external", "icon icon-sm")}<span>Открыть сайт</span></a>
  </div>
</aside>
<div class="a-main">
  <header class="a-top">
    <button class="a-burger" type="button" data-toggle-side aria-controls="a-side" aria-label="Меню">${icon("menu")}</button>
    <h1>${title}</h1>
    <div class="a-top__user">
      <a href="/admin/profile">${icon("user", "icon icon-sm")}<span>${a.user.name}</span><small>${a.user.role === "admin" ? "администратор" : "редактор"}</small></a>
      <form method="post" action="/admin/logout">${csrf(a)}<button class="a-btn a-btn--ghost a-btn--sm" type="submit">${icon("logout", "icon icon-sm")}<span>Выйти</span></button></form>
    </div>
  </header>
  <main id="main" class="a-content">
    ${a.flash ? html`<div class="a-flash a-flash--${a.flash.kind}" role="status">${icon(a.flash.kind === "success" ? "check" : "alert", "icon icon-sm")}${a.flash.text}</div>` : ""}
    ${actions ? html`<div class="a-actions">${actions}</div>` : ""}
    ${body}
  </main>
</div>
</body>
</html>`;
}

export function csrf(a: AdminCtx): SafeHtml {
  return html`<input type="hidden" name="_csrf" value="${a.csrf}" />`;
}

export function input(name: string, label: string, value: string | number | null | undefined, opts: { type?: string; required?: boolean; hint?: string; placeholder?: string; attrs?: string } = {}): SafeHtml {
  return html`<label class="a-field"><span>${label}${opts.required ? html`<b aria-hidden="true">*</b>` : ""}</span>
    <input type="${opts.type || "text"}" name="${name}" value="${value ?? ""}"${attr("required", !!opts.required)}${attr("placeholder", opts.placeholder)}${raw(opts.attrs ? " " + opts.attrs : "")} />
    ${opts.hint ? html`<small>${opts.hint}</small>` : ""}</label>`;
}

export function textarea(name: string, label: string, value: string | null | undefined, opts: { rows?: number; rich?: boolean; hint?: string; required?: boolean } = {}): SafeHtml {
  return html`<label class="a-field"><span>${label}${opts.required ? html`<b aria-hidden="true">*</b>` : ""}</span>
    <textarea name="${name}" rows="${opts.rows || 4}"${attr("class", opts.rich ? "rte" : false)}${attr("required", !!opts.required)}>${value ?? ""}</textarea>
    ${opts.hint ? html`<small>${opts.hint}</small>` : ""}</label>`;
}

export function select(name: string, label: string, value: string, options: [string, string][], opts: { hint?: string } = {}): SafeHtml {
  return html`<label class="a-field"><span>${label}</span><select name="${name}">${options.map(([v, l]) => html`<option value="${v}"${attr("selected", v === value)}>${l}</option>`)}</select>${opts.hint ? html`<small>${opts.hint}</small>` : ""}</label>`;
}

export function checkbox(name: string, label: string, checked: boolean): SafeHtml {
  return html`<label class="a-check"><input type="checkbox" name="${name}" value="1"${attr("checked", checked)} /><span>${label}</span></label>`;
}

/**
 * Tabs KZ / RU / EN around a set of per-language fields.
 * render(lang) returns the fields for that language, named e.g. "title_ru".
 */
export function langTabs(id: string, render: (lang: Lang) => SafeHtml, filled?: (lang: Lang) => boolean): SafeHtml {
  return html`<div class="a-tabs" data-tabs>
    <div class="a-tabs__list" role="tablist">
      ${LANGS.map((l, i) => html`<button type="button" role="tab" id="${id}-tab-${l}" aria-controls="${id}-${l}" aria-selected="${String(i === 1)}" data-tab="${l}">${LANG_META[l].short}${filled ? html`<i class="dot ${filled(l) ? "dot--ok" : "dot--empty"}" title="${filled(l) ? "заполнено" : "не заполнено"}"></i>` : ""}</button>`)}
    </div>
    ${LANGS.map((l, i) => html`<div class="a-tabs__panel" role="tabpanel" id="${id}-${l}" aria-labelledby="${id}-tab-${l}" data-panel="${l}"${i === 1 ? "" : raw(" data-inactive")}><p class="a-tabs__lang">${LANG_META[l].label}</p>${render(l)}</div>`)}
  </div>`;
}

export function l10nInputs(prefix: string, label: string, value: L10n | undefined, opts: { textarea?: boolean; rows?: number } = {}): SafeHtml {
  return html`<fieldset class="a-l10n"><legend>${label}</legend>
    ${LANGS.map((l) =>
      opts.textarea
        ? html`<label class="a-field a-field--inline"><span>${LANG_META[l].short}</span><textarea name="${prefix}_${l}" rows="${opts.rows || 2}">${value?.[l] || ""}</textarea></label>`
        : html`<label class="a-field a-field--inline"><span>${LANG_META[l].short}</span><input type="text" name="${prefix}_${l}" value="${value?.[l] || ""}" /></label>`,
    )}
  </fieldset>`;
}

export function readL10n(fields: Record<string, string>, prefix: string): L10n {
  const out: L10n = {};
  for (const l of LANGS) {
    const v = (fields[`${prefix}_${l}`] || "").trim();
    if (v) out[l] = v;
  }
  return out;
}

export function langDots(langs: string | null | undefined): SafeHtml {
  const set = new Set(String(langs || "").split(","));
  return html`<span class="lang-dots">${LANGS.map((l) => html`<i class="${set.has(l) ? "on" : ""}" title="${LANG_META[l].label}">${LANG_META[l].short}</i>`)}</span>`;
}

export function deleteButton(a: AdminCtx, action: string, label = "Удалить", confirmText = "Удалить безвозвратно?"): SafeHtml {
  return html`<form method="post" action="${action}" class="a-inline" data-confirm="${confirmText}">${csrf(a)}<button class="a-btn a-btn--danger a-btn--sm" type="submit">${icon("trash", "icon icon-sm")}<span>${label}</span></button></form>`;
}

export function emptyRow(cols: number, text: string): SafeHtml {
  return html`<tr><td colspan="${cols}" class="a-empty">${text}</td></tr>`;
}

export function statusPill(status: string): SafeHtml {
  const map: Record<string, [string, string]> = {
    published: ["Опубликовано", "ok"],
    draft: ["Черновик", "muted"],
    new: ["Новое", "warn"],
    read: ["Прочитано", "muted"],
    archived: ["В архиве", "muted"],
    pending: ["На модерации", "warn"],
    approved: ["Одобрено", "ok"],
    rejected: ["Отклонено", "danger"],
    hidden: ["Скрыто", "muted"],
  };
  const [label, cls] = map[status] || [status, "muted"];
  return html`<span class="pill pill--${cls}">${label}</span>`;
}
