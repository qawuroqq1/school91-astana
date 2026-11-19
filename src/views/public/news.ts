import { html, type SafeHtml, stripTags, truncate } from "../../lib/html.ts";
import { formatDate } from "../../i18n/index.ts";
import { LANGS, LANG_META, type Lang } from "../../i18n/langs.ts";
import { NEWS_CATEGORIES, findSection } from "../../site/structure.ts";
import type { CommentRow, NewsFull, NewsLocalized } from "../../db/repo.ts";
import { icon } from "../icons.ts";
import { layout, pageHero, emptyState, pager, breadcrumbs, splitWords } from "../layout.ts";
import { catLabel, coverFallback, field, formAlert, hiddenTokens, newsCard, richText, IS_STATIC, staticFormNotice } from "./parts.ts";
import type { View } from "../context.ts";

const newsSection = findSection("news")!;

export function newsListView(
  v: View,
  data: { items: NewsLocalized[]; total: number; page: number; pages: number; category: string; year: string; years: { year: string; n: number }[] },
): SafeHtml {
  const title = data.category ? catLabel(v, data.category) : v.l(newsSection.title);
  const qs = (p: { category?: string; year?: string; page?: number }) => {
    const u = new URLSearchParams();
    if (p.category) u.set("category", p.category);
    if (p.year) u.set("year", p.year);
    if (p.page && p.page > 1) u.set("page", String(p.page));
    const s = u.toString();
    return v.href("news") + (s ? `?${s}` : "");
  };
  const [first, ...rest] = data.page === 1 ? data.items : [undefined, ...data.items];
  return layout(
    v,
    { title, description: v.l(newsSection.lead), active: "news" },
    html`${pageHero(v, { title, lead: v.l(newsSection.lead), crumbs: data.category ? [{ label: v.l(newsSection.title), href: v.href("news") }, { label: title }] : [{ label: title }] })}
    <section class="section section--tight">
      <div class="container">
        <div class="toolbar" data-reveal>
          <nav class="chips" aria-label="${v.t("news.filter")}">
            <a class="chip" href="${qs({ year: data.year })}"${!data.category ? html` aria-current="page"` : ""}>${v.t("news.cat.all")}</a>
            ${NEWS_CATEGORIES.map((c) => html`<a class="chip" href="${qs({ category: c, year: data.year })}"${data.category === c ? html` aria-current="page"` : ""}>${catLabel(v, c)}</a>`)}
          </nav>
          ${data.years.length > 1
            ? html`<nav class="chips chips--years" aria-label="${v.t("news.archive")}">
                ${data.years.map((y) => html`<a class="chip chip--ghost" href="${qs({ category: data.category, year: data.year === y.year ? "" : y.year })}"${data.year === y.year ? html` aria-current="page"` : ""}>${y.year}</a>`)}
              </nav>`
            : ""}
        </div>
        ${data.items.length
          ? html`${first ? html`<div class="news-hero-wrap">${newsCard(v, first, "feature")}</div>` : ""}
            <div class="news-grid">${rest.filter(Boolean).map((n, i) => newsCard(v, n!, "default", i))}</div>`
          : emptyState(v.t("news.empty"), "newspaper")}
        ${pager(v, data.page, data.pages, (p) => qs({ category: data.category, year: data.year, page: p }))}
        <p class="center"><a class="link-arrow" href="${v.href("news/archive")}">${icon("layers", "icon icon-sm")} ${v.t("news.archive")}</a></p>
      </div>
    </section>`,
  );
}

export function newsArchiveView(v: View, items: NewsLocalized[]): SafeHtml {
  const byYear = new Map<string, NewsLocalized[]>();
  for (const n of items) {
    const y = n.published_at.slice(0, 4);
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(n);
  }
  const title = v.t("news.archive");
  return layout(
    v,
    { title, active: "news" },
    html`${pageHero(v, { title, lead: v.t("news.archiveLead"), crumbs: [{ label: v.l(newsSection.title), href: v.href("news") }, { label: title }] })}
    <section class="section section--tight">
      <div class="container archive">
        ${items.length
          ? [...byYear].map(
              ([year, list]) => html`<div class="archive__year" data-reveal>
                <h2>${year}</h2>
                <ul>${list.map((n) => html`<li><time datetime="${n.published_at.slice(0, 10)}">${formatDate(v.lang, n.published_at)}</time><a href="${v.href(`news/${n.slug}`)}">${n.title}</a><span class="tag tag--${n.category}">${catLabel(v, n.category)}</span></li>`)}</ul>
              </div>`,
            )
          : emptyState(v.t("news.empty"), "newspaper")}
      </div>
    </section>`,
  );
}

export interface CommentFormState {
  values?: Record<string, string>;
  errors?: Record<string, string>;
  notice?: { kind: "success" | "error"; text: string };
}

export function newsItemView(v: View, n: NewsFull, related: NewsLocalized[], comments: CommentRow[], form: CommentFormState = {}): SafeHtml {
  const available = LANGS.filter((l) => n.tr[l]);
  const tr = n.tr[v.lang];
  const crumbsBase = [{ label: v.l(newsSection.title), href: v.href("news") }];

  if (!tr) {
    // Never mix languages: offer the versions that exist instead.
    return layout(
      v,
      { title: v.t("news.notTranslated"), active: "news", langs: available as Lang[], noindex: true },
      html`${pageHero(v, { title: v.t("news.notTranslated"), crumbs: [...crumbsBase, { label: v.t("news.notTranslated") }] })}
      <section class="section section--tight"><div class="container narrow">
        <div class="notice" data-reveal>
          ${icon("globe", "icon")}
          <div><p>${v.t("news.availableIn")}</p>
          <ul class="chips">${available.map((l) => html`<li><a class="chip" href="${v.href(`news/${n.slug}`, l)}" hreflang="${LANG_META[l].hreflang}" lang="${LANG_META[l].htmlLang}">${LANG_META[l].label}</a></li>`)}</ul></div>
        </div>
        <p><a class="link-arrow" href="${v.href("news")}">${icon("arrowRight", "icon icon-sm")} ${v.t("news.back")}</a></p>
      </div></section>`,
    );
  }

  const description = tr.excerpt || truncate(stripTags(tr.body), 160);
  const ld = {
    "@context": "https://schema.org",
    "@type": n.category === "events" ? "Event" : "NewsArticle",
    headline: tr.title,
    datePublished: n.published_at.replace(" ", "T"),
    dateModified: n.updated_at.replace(" ", "T"),
    inLanguage: LANG_META[v.lang].htmlLang,
    image: n.image ? [v.abs(n.image)] : undefined,
    publisher: { "@type": "EducationalOrganization", name: v.l(v.s.schoolName) },
  };
  return layout(
    v,
    { title: tr.title, description, active: "news", langs: available as Lang[], ogImage: n.image, ogType: "article" },
    html`<article class="article">
      <header class="article__head">
        <div class="container narrow">
          <div class="article__crumbs">${breadcrumbs(v, [...crumbsBase, { label: catLabel(v, n.category), href: v.href(`news?category=${n.category}`) }, { label: tr.title }])}</div>
          <div class="article__meta rise">
            <a class="tag tag--${n.category}" href="${v.href(`news?category=${n.category}`)}">${catLabel(v, n.category)}</a>
            <time datetime="${n.published_at.slice(0, 10)}">${icon("calendar", "icon icon-xs")}${formatDate(v.lang, n.published_at)}</time>
            <span>${icon("eye", "icon icon-xs")}${n.views} ${v.t("news.views")}</span>
          </div>
          <h1 class="article__title split split--load">${splitWords(tr.title)}</h1>
          ${tr.excerpt ? html`<p class="article__lead rise" style="--d:3">${tr.excerpt}</p>` : ""}
          ${n.event_date ? html`<p class="article__event rise" style="--d:4">${icon("calendar", "icon icon-sm")}<strong>${v.t("news.eventDate")}:</strong> ${formatDate(v.lang, n.event_date)}</p>` : ""}
        </div>
      </header>
      <div class="container narrow">
        <figure class="article__cover rise" style="--d:4">
          ${n.image ? html`<img src="${n.image}" alt="" decoding="async" data-reveal-img />` : coverFallback(n.id, n.category)}
        </figure>
        <div class="prose article__body" data-reveal>${richText(tr.body)}</div>
        <script type="application/ld+json">${richText(JSON.stringify(ld).replace(/</g, "\\u003c"))}</script>
        ${n.allow_comments ? commentsBlock(v, n, comments, form) : ""}
        <p class="article__back"><a class="link-arrow" href="${v.href("news")}">${icon("chevronLeft", "icon icon-sm")} ${v.t("news.back")}</a></p>
      </div>
    </article>
    ${related.length
      ? html`<section class="section section--tint"><div class="container">
          <h2 class="section-title section-title--sm" data-reveal>${v.t("news.related")}</h2>
          <div class="news-grid news-grid--3">${related.map((r, i) => newsCard(v, r, "default", i))}</div>
        </div></section>`
      : ""}`,
  );
}

function commentsBlock(v: View, n: NewsFull, comments: CommentRow[], form: CommentFormState): SafeHtml {
  const e = form.errors || {};
  const val = form.values || {};
  return html`<section class="comments" id="comments" aria-labelledby="comments-title">
    <h2 id="comments-title">${icon("message", "icon")}${v.t("comments.title")} <span class="count">${comments.length}</span></h2>
    ${comments.length
      ? html`<ol class="comments__list">${comments.map((c) => html`<li class="comment"><p class="comment__head"><strong>${c.name}</strong><time datetime="${c.created_at}">${formatDate(v.lang, c.created_at, true)}</time></p><p>${c.body}</p></li>`)}</ol>`
      : html`<p class="muted">${v.t("comments.empty")}</p>`}
    ${IS_STATIC() ? staticFormNotice(v) : html`<form class="form card" method="post" action="${v.href(`news/${n.slug}`)}#comments" data-form novalidate>
      ${form.notice ? formAlert(form.notice.kind, form.notice.text) : ""}
      ${hiddenTokens(v)}
      ${field(v, { name: "name", label: v.t("form.name"), required: true, max: 80, value: val.name, error: e.name, autocomplete: "name" })}
      ${field(v, { name: "body", label: v.t("comments.text"), type: "textarea", required: true, max: 2000, value: val.body, error: e.body })}
      <button class="btn btn--primary" type="submit" data-loading-text="${v.t("form.sending")}">${v.t("comments.submit")}</button>
    </form>`}
  </section>`;
}
