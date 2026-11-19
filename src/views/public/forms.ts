import { html, type SafeHtml } from "../../lib/html.ts";
import { formatDate } from "../../i18n/index.ts";
import type { BlogRow, ImageRow, AlbumRow } from "../../db/repo.ts";
import { icon } from "../icons.ts";
import { layout, pageHero, emptyState, pager } from "../layout.ts";
import { field, formAlert, hiddenTokens, IS_STATIC, staticFormNotice } from "./parts.ts";
import type { View } from "../context.ts";

export interface FormState {
  values?: Record<string, string>;
  errors?: Record<string, string>;
  notice?: { kind: "success" | "error"; text: string };
}

function consent(v: View, error?: string): SafeHtml {
  return html`<div class="field field--check${error ? " has-error" : ""}">
    <label><input type="checkbox" name="consent" value="1" required${error ? html` aria-invalid="true" aria-describedby="consent-err"` : ""} /> <span>${v.t("form.consent")}</span></label>
    ${error ? html`<p class="field__error" id="consent-err">${icon("alert", "icon icon-xs")}${error}</p>` : ""}
  </div>`;
}

export function contactsView(v: View, form: FormState = {}): SafeHtml {
  const e = form.errors || {};
  const val = form.values || {};
  const socials = (["instagram", "facebook", "youtube", "telegram"] as const).filter((k) => v.s[k]);
  const map = v.s.mapLat && v.s.mapLng;
  const gis = v.s.gis2Url || (v.l(v.s.address) ? `https://2gis.kz/astana/search/${encodeURIComponent(v.l(v.s.address))}` : "");
  const tbd = html`<span class="tbd">${v.t("tbd")}</span>`;
  return layout(
    v,
    { title: v.t("contacts.title"), description: v.t("contacts.lead") },
    html`${pageHero(v, { title: v.t("contacts.title"), lead: v.t("contacts.lead"), crumbs: [{ label: v.t("contacts.title") }] })}
    <section class="section section--tight">
      <div class="container contact-page">
        <div class="contact-page__info">
          <ul class="contact-list" data-reveal>
            <li>${icon("mapPin")}<div><span class="label">${v.t("contacts.address")}</span>${v.l(v.s.address) || tbd}</div></li>
            <li>${icon("phone")}<div><span class="label">${v.t("contacts.phone")}</span>${v.s.phone ? html`<a href="tel:${v.s.phone.replace(/[^\d+]/g, "")}">${v.s.phone}</a>` : tbd}</div></li>
            <li>${icon("mail")}<div><span class="label">${v.t("contacts.email")}</span>${v.s.email ? html`<a href="mailto:${v.s.email}">${v.s.email}</a>` : tbd}</div></li>
            <li>${icon("clock")}<div><span class="label">${v.t("contacts.hours")}</span>${v.l(v.s.hours) || tbd}</div></li>
          </ul>
          ${socials.length
            ? html`<div data-reveal><p class="label">${v.t("contacts.socials")}</p><div class="socials socials--dark">${socials.map((k) => html`<a href="${v.s[k]}" target="_blank" rel="noopener noreferrer" aria-label="${k}">${icon(k)}</a>`)}</div></div>`
            : ""}
          <div class="map-card" data-reveal>
            ${map
              ? html`<iframe title="${v.t("contacts.map")}" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${Number(v.s.mapLng) - 0.006},${Number(v.s.mapLat) - 0.003},${Number(v.s.mapLng) + 0.006},${Number(v.s.mapLat) + 0.003}&layer=mapnik&marker=${v.s.mapLat},${v.s.mapLng}"></iframe>`
              : html`<div class="map-card__placeholder"><img src="/img/map-placeholder.svg" alt="" loading="lazy" /><span class="map-card__pin">${icon("mapPin")}</span></div>`}
            ${gis ? html`<div class="map-card__bar"><span>${v.l(v.s.address)}</span><a class="btn btn--small btn--primary" href="${gis}" target="_blank" rel="noopener noreferrer">${v.t("contacts.route")} ${icon("external", "icon icon-xs")}</a></div>` : ""}
          </div>
        </div>
        ${IS_STATIC() ? html`<div class="form card contact-page__form"><h2 class="form__title">${icon("message", "icon")}${v.t("contacts.form")}</h2>${staticFormNotice(v)}</div>` : html`<form class="form card contact-page__form" method="post" action="${v.href("contacts")}" data-form novalidate data-reveal>
          <h2 class="form__title">${icon("message", "icon")}${v.t("contacts.form")}</h2>
          ${form.notice ? formAlert(form.notice.kind, form.notice.text) : ""}
          ${hiddenTokens(v)}
          <div class="form__row">
            ${field(v, { name: "name", label: v.t("form.name"), required: true, max: 120, value: val.name, error: e.name, autocomplete: "name" })}
            ${field(v, { name: "email", label: v.t("form.email"), type: "email", required: true, max: 160, value: val.email, error: e.email, autocomplete: "email" })}
          </div>
          <div class="form__row">
            ${field(v, { name: "phone", label: v.t("form.phone"), type: "tel", max: 40, value: val.phone, error: e.phone, autocomplete: "tel" })}
            ${field(v, { name: "subject", label: v.t("form.subject"), max: 200, value: val.subject, error: e.subject })}
          </div>
          ${field(v, { name: "message", label: v.t("form.message"), type: "textarea", required: true, max: 5000, value: val.message, error: e.message })}
          ${consent(v, e.consent)}
          <button class="btn btn--primary btn--lg" type="submit" data-loading-text="${v.t("form.sending")}">${v.t("form.send")} ${icon("arrowRight", "icon icon-sm")}</button>
        </form>`}
      </div>
    </section>`,
  );
}

export function blogView(v: View, data: { items: BlogRow[]; page: number; pages: number }, form: FormState = {}): SafeHtml {
  const e = form.errors || {};
  const val = form.values || {};
  return layout(
    v,
    { title: v.t("blog.title"), description: v.t("blog.lead"), active: "official" },
    html`${pageHero(v, { title: v.t("blog.title"), lead: v.t("blog.lead"), crumbs: [{ label: v.t("blog.title") }] })}
    <section class="section section--tight">
      <div class="container blog-layout">
        <div class="blog-layout__list">
          ${data.items.length
            ? html`<ol class="qa-list">${data.items.map(
                (q, i) => html`<li class="qa" data-reveal style="--i:${i}">
                  <div class="qa__q"><span class="qa__label">${v.t("blog.asked")}</span><p>${q.question}</p><p class="qa__meta">${q.name} · ${formatDate(v.lang, q.created_at)}</p></div>
                  <div class="qa__a"><span class="qa__label">${icon("quote", "icon icon-sm")}${v.t("blog.answer")}</span><div class="prose">${q.answer.split(/\n{2,}/).map((p) => html`<p>${p}</p>`)}</div></div>
                </li>`,
              )}</ol>`
            : emptyState(v.t("blog.empty"), "message")}
          ${pager(v, data.page, data.pages, (p) => v.href("director-blog") + (p > 1 ? `?page=${p}` : ""))}
        </div>
        ${IS_STATIC() ? html`<div class="form card blog-layout__form" id="ask"><h2 class="form__title">${icon("message", "icon")}${v.t("blog.ask")}</h2>${staticFormNotice(v)}</div>` : html`<form class="form card blog-layout__form" id="ask" method="post" action="${v.href("director-blog")}#ask" data-form novalidate data-reveal>
          <h2 class="form__title">${icon("message", "icon")}${v.t("blog.ask")}</h2>
          ${form.notice ? formAlert(form.notice.kind, form.notice.text) : ""}
          ${hiddenTokens(v)}
          ${field(v, { name: "name", label: v.t("form.name"), required: true, max: 120, value: val.name, error: e.name, autocomplete: "name" })}
          ${field(v, { name: "email", label: v.t("form.email"), type: "email", required: true, max: 160, value: val.email, error: e.email, autocomplete: "email" })}
          ${field(v, { name: "question", label: v.t("blog.question"), type: "textarea", required: true, max: 3000, value: val.question, error: e.question })}
          ${consent(v, e.consent)}
          <button class="btn btn--primary" type="submit" data-loading-text="${v.t("form.sending")}">${v.t("form.send")}</button>
        </form>`}
      </div>
    </section>`,
  );
}

export interface SearchHit {
  type: "page" | "news" | "doc";
  title: string;
  href: string;
  snippet: string;
  context: string;
}

function highlight(text: string, q: string): SafeHtml {
  if (!q) return html`${text}`;
  const lower = text.toLocaleLowerCase();
  const ql = q.toLocaleLowerCase();
  const parts: SafeHtml[] = [];
  let i = 0;
  let idx: number;
  while ((idx = lower.indexOf(ql, i)) !== -1) {
    parts.push(html`${text.slice(i, idx)}<mark>${text.slice(idx, idx + q.length)}</mark>`);
    i = idx + q.length;
  }
  parts.push(html`${text.slice(i)}`);
  return html`${parts}`;
}

export function searchView(v: View, q: string, hits: SearchHit[]): SafeHtml {
  if (IS_STATIC()) return staticSearchView(v);
  const typeLabel = { page: v.t("search.type.page"), news: v.t("search.type.news"), doc: v.t("search.type.doc") };
  const typeIcon = { page: "file", news: "newspaper", doc: "download" };
  return layout(
    v,
    { title: v.t("search.title"), noindex: true },
    html`${pageHero(v, { title: v.t("search.title"), crumbs: [{ label: v.t("search.title") }] })}
    <section class="section section--tight">
      <div class="container narrow">
        <form class="search-big" action="${v.href("search")}" method="get" role="search" data-reveal>
          ${icon("search", "icon")}
          <input type="search" name="q" value="${q}" placeholder="${v.t("search.placeholder")}" aria-label="${v.t("search.title")}" minlength="2" required />
          <button class="btn btn--primary" type="submit">${v.t("search.submit")}</button>
        </form>
        ${q.length === 0
          ? ""
          : q.length < 2
            ? html`<p class="muted">${v.t("search.short")}</p>`
            : hits.length
              ? html`<p class="search-count" role="status">${v.t("search.results", { n: hits.length })}</p>
                <ol class="hits">${hits.map(
                  (h, i) => html`<li class="hit" data-reveal style="--i:${Math.min(i, 8)}">
                    <span class="hit__type">${icon(typeIcon[h.type], "icon icon-xs")}${typeLabel[h.type]}${h.context ? html` · ${h.context}` : ""}</span>
                    <a class="hit__title" href="${h.href}">${highlight(h.title, q)}</a>
                    ${h.snippet ? html`<p class="hit__snippet">${highlight(h.snippet, q)}</p>` : ""}
                  </li>`,
                )}</ol>`
              : html`<div role="status">${emptyState(v.t("search.none", { q }), "search")}</div>`}
      </div>
    </section>`,
  );
}

export function galleryView(v: View, albums: AlbumRow[], images: ImageRow[], current?: { id: number; title: string }): SafeHtml {
  const title = current ? current.title : v.t("gallery.title");
  return layout(
    v,
    { title, description: v.t("gallery.lead"), active: "about" },
    html`${pageHero(v, {
      title,
      lead: current ? undefined : v.t("gallery.lead"),
      crumbs: current ? [{ label: v.t("gallery.title"), href: v.href("gallery") }, { label: title }] : [{ label: title }],
    })}
    <section class="section section--tight">
      <div class="container">
        ${albums.length > 0 && !current
          ? html`<ul class="albums">${albums
              .filter((a) => a.count > 0)
              .map(
                (a, i) => html`<li data-reveal style="--i:${i}"><a class="album" href="${v.href(`gallery/${a.id}`)}">
                  <span class="album__cover">${a.cover ? html`<img src="${a.cover}" alt="" loading="lazy" />` : icon("image")}</span>
                  <span class="album__title">${v.l(a.title) || a.title.ru || a.title.kz || ""}</span>
                  <span class="album__count">${icon("image", "icon icon-xs")}${a.count}</span>
                </a></li>`,
              )}</ul>`
          : ""}
        ${current ? html`<p><a class="link-arrow" href="${v.href("gallery")}">${icon("chevronLeft", "icon icon-sm")} ${v.t("gallery.all")}</a></p>` : ""}
        ${images.length
          ? html`<ul class="masonry" data-lightbox-group>${images.map(
              (im, i) => html`<li data-reveal style="--i:${i % 9}"><a href="${im.file}" data-lightbox data-caption="${v.l(im.caption)}" aria-label="${v.t("gallery.open")}${v.l(im.caption) ? ": " + v.l(im.caption) : ""}"><img src="${im.file}" alt="${v.l(im.caption)}" loading="lazy" decoding="async"${im.width ? html` width="${im.width}" height="${im.height}"` : ""} /></a></li>`,
            )}</ul>`
          : albums.some((a) => a.count > 0) && !current
            ? ""
            : emptyState(v.t("gallery.empty"), "image")}
      </div>
    </section>`,
  );
}

/** GitHub Pages version: results are computed in the browser from a JSON index. */
function staticSearchView(v: View): SafeHtml {
  return layout(
    v,
    { title: v.t("search.title"), noindex: true },
    html`${pageHero(v, { title: v.t("search.title"), crumbs: [{ label: v.t("search.title") }] })}
    <section class="section section--tight">
      <div class="container narrow">
        <form class="search-big" action="${v.href("search")}" method="get" role="search">
          ${icon("search", "icon")}
          <input type="search" name="q" placeholder="${v.t("search.placeholder")}" aria-label="${v.t("search.title")}" minlength="2" required />
          <button class="btn btn--primary" type="submit">${v.t("search.submit")}</button>
        </form>
        <div data-static-search data-lang="${v.lang}" data-t-results="${v.t("search.results")}" data-t-none="${v.t("search.none")}" data-t-short="${v.t("search.short")}"
          data-t-page="${v.t("search.type.page")}" data-t-news="${v.t("search.type.news")}" data-t-doc="${v.t("search.type.doc")}" aria-live="polite"></div>
      </div>
    </section>`,
  );
}
