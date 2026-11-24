import { html, type SafeHtml, stripTags, truncate } from "../../lib/html.ts";
import { formatDate } from "../../i18n/index.ts";
import { SECTIONS, type SiteItem, type SiteSection } from "../../site/structure.ts";
import { documents, pages, staff, type StaffRow } from "../../db/repo.ts";
import { icon } from "../icons.ts";
import { layout, pageHero, emptyState, splitWords } from "../layout.ts";
import { docList, richText } from "./parts.ts";
import type { View } from "../context.ts";

function itemHref(v: View, s: SiteSection, it: SiteItem): string {
  return v.href(it.kind === "link" ? it.href : `${s.slug}/${it.slug}`);
}

export function sectionView(v: View, section: SiteSection): SafeHtml {
  const filled = pages.filled();
  return layout(
    v,
    { title: v.l(section.title), description: v.l(section.lead), active: section.slug },
    html`${pageHero(v, { title: v.l(section.title), lead: v.l(section.lead), crumbs: [{ label: v.l(section.title) }], kicker: v.t("page.sectionPages"), icon: section.icon })}
    <section class="section section--tight">
      <div class="container">
        ${section.cards ? infoCards(v, section, filled) : html`<ul class="tile-grid" role="list">
          ${section.items.map((it, i) => {
            const key = `${section.slug}/${it.slug}`;
            const status = it.kind === "page" ? (filled.has(key) ? "ok" : "pending") : "link";
            return html`<li data-reveal style="--i:${i}">
              <a class="tile" href="${itemHref(v, section, it)}">
                <span class="tile__num">${String(i + 1).padStart(2, "0")}</span>
                <span class="tile__title">${v.l(it.title)}</span>
                <span class="tile__foot">
                  ${status === "pending" ? html`<span class="tile__status">${v.t("tbd")}</span>` : html`<span></span>`}
                  ${icon(it.kind === "link" ? "arrowUpRight" : "arrowRight", "icon icon-sm")}
                </span>
              </a>
            </li>`;
          })}
        </ul>`}
      </div>
    </section>`,
  );
}

function infoCards(v: View, section: SiteSection, filled: Set<string>): SafeHtml {
  return html`<ul class="info-cards" role="list">
    ${section.items.map((it, i) => {
      const key = `${section.slug}/${it.slug}`;
      const pending = it.kind === "page" && !filled.has(key);
      return html`<li data-reveal style="--i:${Math.min(i, 8)}">
        <a class="info-card" href="${itemHref(v, section, it)}">
          <span class="info-card__icon">${icon(it.icon || section.icon)}</span>
          <span class="info-card__title">${v.l(it.title)}</span>
          ${it.lead ? html`<span class="info-card__text">${v.l(it.lead)}</span>` : ""}
          <span class="info-card__foot">
            <span class="info-card__more">${v.t("card.open")}${icon("arrowRight", "icon icon-sm")}</span>
            ${pending ? html`<span class="tile__status">${v.t("tbd")}</span>` : ""}
          </span>
        </a>
      </li>`;
    })}
  </ul>`;
}

function sideNav(v: View, section: SiteSection, current: string): SafeHtml {
  return html`<nav class="side-nav" aria-label="${v.t("page.inSection")}">
    <p class="side-nav__title">${icon(section.icon, "icon icon-sm")}<a href="${v.href(section.slug)}">${v.l(section.title)}</a></p>
    <ul>
      ${section.items.map(
        (it) => html`<li><a href="${itemHref(v, section, it)}"${it.slug === current && it.kind !== "link" ? html` aria-current="page"` : ""}>${v.l(it.title)}</a></li>`,
      )}
    </ul>
  </nav>`;
}

function staffCard(v: View, p: StaffRow, i: number, big = false): SafeHtml {
  const name = v.l(p.name) || p.name.ru || p.name.kz || p.name.en || "";
  return html`<article class="person${big ? " person--big" : ""}" data-reveal style="--i:${i}">
    <div class="person__photo">
      ${p.photo ? html`<img src="${p.photo}" alt="${name}" loading="lazy" decoding="async" />` : html`<span class="person__initials" aria-hidden="true">${icon("user")}</span>`}
    </div>
    <div class="person__body">
      <h3 class="person__name">${name}</h3>
      ${v.l(p.position) ? html`<p class="person__pos">${v.l(p.position)}</p>` : ""}
      ${v.l(p.bio) ? html`<div class="person__bio prose">${richText(v.l(p.bio))}</div>` : ""}
      ${p.email || p.phone
        ? html`<p class="person__contacts">${p.email ? html`<a href="mailto:${p.email}">${icon("mail", "icon icon-xs")}${p.email}</a>` : ""}${p.phone ? html`<a href="tel:${p.phone.replace(/[^\d+]/g, "")}">${icon("phone", "icon icon-xs")}${p.phone}</a>` : ""}</p>`
        : ""}
    </div>
  </article>`;
}

export function pageView(v: View, section: SiteSection, item: SiteItem): SafeHtml {
  const key = `${section.slug}/${item.slug}`;
  const content = pages.get(key);
  const tr = content?.tr[v.lang];
  const docs = documents.forPage(key);
  const people = item.kind === "staff" && item.staffGroup ? staff.byGroup(item.staffGroup) : [];
  const title = v.l(item.title);
  const hasBody = !!tr?.body?.trim();
  const description = tr?.lead || (hasBody ? truncate(stripTags(tr!.body), 160) : v.l(section.lead));

  let main: SafeHtml;
  if (item.kind === "staff") {
    main = html`
      ${tr?.body ? html`<div class="prose" data-reveal>${richText(tr.body)}</div>` : ""}
      ${people.length
        ? html`<div class="people${item.staffGroup === "director" ? " people--single" : ""}">${people.map((p, i) => staffCard(v, p, i, item.staffGroup === "director"))}</div>`
        : emptyState(v.t("staff.empty"), "users")}`;
  } else {
    main = hasBody ? html`<div class="prose" data-reveal>${richText(tr!.body)}</div>` : emptyState(v.t("page.pending"), "file");
  }

  return layout(
    v,
    { title, description, active: section.slug },
    html`${pageHero(v, { title, lead: tr?.lead, crumbs: [{ label: v.l(section.title), href: v.href(section.slug) }, { label: title }] })}
    <section class="section section--tight">
      <div class="container page-layout">
        <aside class="page-layout__side">${sideNav(v, section, item.slug)}</aside>
        <article class="page-layout__main">
          ${main}
          ${docList(v, docs)}
          ${content && (hasBody || docs.length) ? html`<p class="updated">${icon("clock", "icon icon-xs")}${v.t("page.updated")}: ${formatDate(v.lang, content.updated_at)}</p>` : ""}
        </article>
      </div>
    </section>`,
  );
}

export function sitemapView(v: View): SafeHtml {
  return layout(
    v,
    { title: v.t("sitemap.title") },
    html`${pageHero(v, { title: v.t("sitemap.title"), crumbs: [{ label: v.t("sitemap.title") }] })}
    <section class="section section--tight">
      <div class="container sitemap">
        ${SECTIONS.map(
          (s, i) => html`<div class="sitemap__col" data-reveal style="--i:${i}">
            <h2><a href="${v.href(s.slug)}">${icon(s.icon, "icon icon-sm")}${v.l(s.title)}</a></h2>
            <ul>${s.items.map((it) => html`<li><a href="${itemHref(v, s, it)}">${v.l(it.title)}</a></li>`)}</ul>
          </div>`,
        )}
        <div class="sitemap__col" data-reveal>
          <h2>${icon("layers", "icon icon-sm")}${v.t("footer.info")}</h2>
          <ul>
            <li><a href="${v.href("contacts")}">${v.t("contacts.title")}</a></li>
            <li><a href="${v.href("director-blog")}">${v.t("blog.title")}</a></li>
            <li><a href="${v.href("gallery")}">${v.t("gallery.title")}</a></li>
            <li><a href="${v.href("search")}">${v.t("search.title")}</a></li>
            <li><a href="${v.href("rss.xml")}">${v.t("footer.rss")}</a></li>
          </ul>
        </div>
      </div>
    </section>`,
  );
}

export function errorView(v: View, status: 404 | 500): SafeHtml {
  const is404 = status === 404;
  return layout(
    v,
    { title: v.t(is404 ? "err.404.title" : "err.500.title"), noindex: true, bodyClass: "page-error" },
    html`<section class="error-page">
      <div class="container error-page__inner">
        <p class="error-page__code rise" aria-hidden="true">${status}</p>
        <h1 class="split split--load">${splitWords(v.t(is404 ? "err.404.title" : "err.500.title"))}</h1>
        <p class="rise" style="--d:3">${v.t(is404 ? "err.404.text" : "err.500.text")}</p>
        <div class="error-page__actions rise" style="--d:4">
          <a class="btn btn--primary" href="${v.href()}">${icon("home", "icon icon-sm")} ${v.t("err.home")}</a>
          <a class="btn btn--outline" href="${v.href("search")}">${icon("search", "icon icon-sm")} ${v.t("err.search")}</a>
        </div>
      </div>
    </section>`,
  );
}
