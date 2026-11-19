import { html, raw, attr, type SafeHtml } from "../lib/html.ts";
import { LANGS, LANG_META, type Lang } from "../i18n/langs.ts";
import { SECTIONS } from "../site/structure.ts";
import { announcements } from "../db/repo.ts";
import { icon } from "./icons.ts";
import { config } from "../config.ts";
import type { Crumb, View } from "./context.ts";

export interface LayoutOpts {
  title: string;
  description?: string;
  /** Section slug to highlight in the menu. */
  active?: string;
  /** Languages in which this exact page exists (default: all). */
  langs?: Lang[];
  ogImage?: string | null;
  ogType?: "website" | "article";
  bodyClass?: string;
  noindex?: boolean;
  status?: number;
}

const ASSET_V = "20261119";

function logo(v: View): SafeHtml {
  const src = v.s.logo || "/img/logo.svg";
  return html`<img class="brand-logo" src="${src}" alt="" width="44" height="44" />`;
}

function langSwitcher(v: View, langs: Lang[], cls: string): SafeHtml {
  return html`<nav class="${cls}" aria-label="${v.t("nav.lang")}">
    ${LANGS.map((l) => {
      const available = langs.includes(l);
      const target = available ? v.href(v.rest, l) + v.search : v.href("", l);
      return html`<a href="${target}" hreflang="${LANG_META[l].hreflang}" lang="${LANG_META[l].htmlLang}"${attr("aria-current", l === v.lang ? "true" : false)} class="lang-link${l === v.lang ? " is-active" : ""}" title="${LANG_META[l].label}">${LANG_META[l].short}</a>`;
    })}
  </nav>`;
}

function megaMenu(v: View, active?: string): SafeHtml {
  return html`<nav class="main-nav" aria-label="${v.t("nav.main")}">
    <ul class="main-nav__list">
      ${SECTIONS.map(
        (s, i) => html`<li class="main-nav__item" data-menu>
          <a class="main-nav__link${active === s.slug ? " is-active" : ""}" href="${v.href(s.slug)}" aria-haspopup="true" aria-expanded="false" aria-controls="mega-${s.slug}">
            <span>${v.l(s.nav)}</span>${icon("chevronDown", "icon icon-xs")}
          </a>
          <div class="mega" id="mega-${s.slug}" style="--mega-i:${i}">
            <div class="mega__inner container">
              <div class="mega__intro">
                <span class="mega__icon">${icon(s.icon)}</span>
                <p class="mega__title">${v.l(s.title)}</p>
                <p class="mega__lead">${v.l(s.lead)}</p>
                <a class="link-arrow" href="${v.href(s.slug)}">${v.t("nav.allSection")} ${icon("arrowRight", "icon icon-sm")}</a>
              </div>
              <ul class="mega__links">
                ${s.items.map(
                  (it, j) => html`<li style="--i:${j}"><a href="${v.href(it.kind === "link" ? it.href : `${s.slug}/${it.slug}`)}">${v.l(it.title)}${icon("arrowUpRight", "icon icon-xs")}</a></li>`,
                )}
              </ul>
            </div>
          </div>
        </li>`,
      )}
    </ul>
  </nav>`;
}

function mobileMenu(v: View, langs: Lang[]): SafeHtml {
  return html`<div class="drawer" id="drawer" hidden>
    <div class="drawer__backdrop" data-drawer-close></div>
    <div class="drawer__panel" role="dialog" aria-modal="true" aria-label="${v.t("nav.menu")}">
      <div class="drawer__head">
        ${langSwitcher(v, langs, "lang-switch lang-switch--drawer")}
        <button class="icon-btn" type="button" data-drawer-close aria-label="${v.t("nav.close")}">${icon("x")}</button>
      </div>
      <form class="drawer__search" action="${v.href("search")}" method="get" role="search">
        ${icon("search", "icon icon-sm")}
        <input type="search" name="q" placeholder="${v.t("search.placeholder")}" aria-label="${v.t("search.title")}" />
      </form>
      <nav aria-label="${v.t("nav.main")}">
        <ul class="drawer__list">
          ${SECTIONS.map(
            (s, i) => html`<li class="drawer__item" style="--i:${i}">
              <details>
                <summary><span class="drawer__icon">${icon(s.icon, "icon icon-sm")}</span>${v.l(s.title)}${icon("chevronDown", "icon icon-sm drawer__chev")}</summary>
                <ul>
                  <li><a href="${v.href(s.slug)}"><strong>${v.t("nav.allSection")}</strong></a></li>
                  ${s.items.map((it) => html`<li><a href="${v.href(it.kind === "link" ? it.href : `${s.slug}/${it.slug}`)}">${v.l(it.title)}</a></li>`)}
                </ul>
              </details>
            </li>`,
          )}
        </ul>
      </nav>
      <div class="drawer__foot">
        <a class="btn btn--ghost" href="${v.href("contacts")}">${icon("mapPin", "icon icon-sm")} ${v.t("nav.contacts")}</a>
        <button class="btn btn--ghost" type="button" data-a11y-toggle>${icon("glasses", "icon icon-sm")} ${v.t("a11y.title")}</button>
      </div>
    </div>
  </div>`;
}

function a11yPanel(v: View): SafeHtml {
  const a = v.a11y;
  return html`<div class="a11y-panel" id="a11y-panel"${a.on ? "" : raw(" hidden")} role="region" aria-label="${v.t("a11y.title")}">
    <div class="container a11y-panel__inner">
      <div class="a11y-group" role="group" aria-label="${v.t("a11y.font")}">
        <span>${v.t("a11y.font")}</span>
        ${[0, 1, 2].map((f) => html`<button type="button" data-a11y="f:${f}" class="a11y-btn a11y-font-${f}"${attr("aria-pressed", String(a.font === f))}>A</button>`)}
      </div>
      <div class="a11y-group" role="group" aria-label="${v.t("a11y.contrast")}">
        <span>${v.t("a11y.contrast")}</span>
        <button type="button" data-a11y="c:normal" class="a11y-btn"${attr("aria-pressed", String(a.scheme === "normal"))}>${v.t("a11y.contrastNormal")}</button>
        <button type="button" data-a11y="c:high" class="a11y-btn a11y-scheme-high"${attr("aria-pressed", String(a.scheme === "high"))}>${v.t("a11y.contrastHigh")}</button>
        <button type="button" data-a11y="c:inverse" class="a11y-btn a11y-scheme-inverse"${attr("aria-pressed", String(a.scheme === "inverse"))}>${v.t("a11y.contrastInverse")}</button>
      </div>
      <div class="a11y-group" role="group" aria-label="${v.t("a11y.images")}">
        <span>${v.t("a11y.images")}</span>
        <button type="button" data-a11y="i:1" class="a11y-btn"${attr("aria-pressed", String(a.images))}>${v.t("a11y.imagesOn")}</button>
        <button type="button" data-a11y="i:0" class="a11y-btn"${attr("aria-pressed", String(!a.images))}>${v.t("a11y.imagesOff")}</button>
      </div>
      <button type="button" class="btn btn--small btn--outline" data-a11y="reset">${v.t("a11y.reset")}</button>
    </div>
  </div>`;
}

function header(v: View, langs: Lang[], active?: string): SafeHtml {
  const ann = announcements.current()[0];
  const annText = ann ? v.l(ann.text) : "";
  return html`
    ${annText
      ? html`<div class="announce" role="note"><div class="container announce__inner">${icon("megaphone", "icon icon-sm")}<span>${annText}</span>${ann!.link ? html`<a href="${ann!.link}">${v.t("hero.more")} ${icon("arrowRight", "icon icon-xs")}</a>` : ""}</div></div>`
      : ""}
    ${a11yPanel(v)}
    <div class="utility">
      <div class="container utility__inner">
        <div class="utility__contacts">
          ${v.s.phone ? html`<a href="tel:${v.s.phone.replace(/[^\d+]/g, "")}">${icon("phone", "icon icon-xs")}<span>${v.s.phone}</span></a>` : ""}
          ${v.s.email ? html`<a href="mailto:${v.s.email}">${icon("mail", "icon icon-xs")}<span>${v.s.email}</span></a>` : ""}
          ${!v.s.phone && !v.s.email ? html`<a href="${v.href("contacts")}">${icon("mapPin", "icon icon-xs")}<span>${v.t("nav.contacts")}</span></a>` : ""}
        </div>
        <div class="utility__actions">
          <a href="${v.href("director-blog")}" class="utility__link">${icon("message", "icon icon-xs")}<span>${v.t("nav.blog")}</span></a>
          <button type="button" class="utility__link" data-a11y-toggle aria-controls="a11y-panel" aria-expanded="${String(v.a11y.on)}">${icon("glasses", "icon icon-xs")}<span>${v.t("a11y.title")}</span></button>
          ${langSwitcher(v, langs, "lang-switch")}
        </div>
      </div>
    </div>
    <header class="site-header" data-header>
      <div class="container site-header__inner">
        <a class="brand" href="${v.href()}" aria-label="${v.l(v.s.schoolName)} — ${v.t("nav.home")}">
          ${logo(v)}
          <span class="brand__text"><span class="brand__name">${v.l(v.s.shortName)}</span><span class="brand__city">${v.t("site.city")}</span></span>
        </a>
        ${megaMenu(v, active)}
        <div class="site-header__actions">
          <a class="icon-btn" href="${v.href("search")}" data-search-open aria-label="${v.t("nav.search")}">${icon("search")}</a>
          <button class="icon-btn burger" type="button" data-drawer-open aria-controls="drawer" aria-expanded="false" aria-label="${v.t("nav.menu")}">${icon("menu")}</button>
        </div>
      </div>
    </header>
    <div class="search-overlay" id="search-overlay" hidden>
      <div class="search-overlay__backdrop" data-search-close></div>
      <form class="search-overlay__box container" action="${v.href("search")}" method="get" role="search">
        ${icon("search", "icon icon-lg")}
        <input type="search" name="q" placeholder="${v.t("search.placeholder")}" aria-label="${v.t("search.title")}" autocomplete="off" />
        <button class="btn btn--primary" type="submit">${v.t("search.submit")}</button>
        <button class="icon-btn" type="button" data-search-close aria-label="${v.t("nav.close")}">${icon("x")}</button>
      </form>
    </div>
    ${mobileMenu(v, langs)}`;
}

function footer(v: View): SafeHtml {
  const year = new Date().getFullYear();
  const socials = (["instagram", "facebook", "youtube", "telegram"] as const).filter((k) => v.s[k]);
  return html`<footer class="site-footer">
    <div class="container site-footer__grid">
      <div class="site-footer__brand">
        <a class="brand brand--light" href="${v.href()}">${logo(v)}<span class="brand__text"><span class="brand__name">${v.l(v.s.shortName)}</span><span class="brand__city">${v.t("site.city")}</span></span></a>
        <p>${v.t("footer.about")}</p>
        ${socials.length ? html`<div class="socials">${socials.map((k) => html`<a href="${v.s[k]}" target="_blank" rel="noopener noreferrer" aria-label="${k}">${icon(k)}</a>`)}</div>` : ""}
      </div>
      <nav class="site-footer__col" aria-label="${v.t("footer.sections")}">
        <p class="site-footer__title">${v.t("footer.sections")}</p>
        <ul>${SECTIONS.slice(0, 4).map((s) => html`<li><a href="${v.href(s.slug)}">${v.l(s.title)}</a></li>`)}</ul>
      </nav>
      <nav class="site-footer__col" aria-label="${v.t("footer.info")}">
        <p class="site-footer__title">${v.t("footer.info")}</p>
        <ul>${SECTIONS.slice(4).map((s) => html`<li><a href="${v.href(s.slug)}">${v.l(s.title)}</a></li>`)}</ul>
      </nav>
      <div class="site-footer__col">
        <p class="site-footer__title">${v.t("footer.contacts")}</p>
        <ul class="site-footer__contacts">
          <li>${icon("mapPin", "icon icon-sm")}<span>${v.l(v.s.address) || html`<span class="tbd">${v.t("tbd")}</span>`}</span></li>
          <li>${icon("phone", "icon icon-sm")}${v.s.phone ? html`<a href="tel:${v.s.phone.replace(/[^\d+]/g, "")}">${v.s.phone}</a>` : html`<span class="tbd">${v.t("tbd")}</span>`}</li>
          <li>${icon("mail", "icon icon-sm")}${v.s.email ? html`<a href="mailto:${v.s.email}">${v.s.email}</a>` : html`<span class="tbd">${v.t("tbd")}</span>`}</li>
        </ul>
      </div>
    </div>
    <div class="container site-footer__bottom">
      <p>© ${year} ${v.l(v.s.schoolName)}. ${v.t("footer.rights")}</p>
      <ul>
        <li><a href="${v.href("sitemap")}">${v.t("footer.sitemap")}</a></li>
        <li><a href="${v.href("rss.xml")}">${icon("rss", "icon icon-xs")} ${v.t("footer.rss")}</a></li>
        <li><a href="${v.href("contacts")}">${v.t("footer.contacts")}</a></li>
      </ul>
    </div>
  </footer>`;
}

export function layout(v: View, opts: LayoutOpts, content: SafeHtml): SafeHtml {
  const langs = opts.langs ?? [...LANGS];
  const title = opts.title ? `${opts.title} — ${v.l(v.s.shortName)}` : `${v.l(v.s.schoolName)} — ${v.l(v.s.slogan)}`;
  const description = opts.description || v.l(v.s.heroText);
  const canonical = v.abs(v.href(v.rest));
  const a = v.a11y;
  const htmlClass = [a.on ? "a11y" : "", a.on && a.font ? `a11y-font-${a.font}` : "", a.on && a.scheme !== "normal" ? `a11y-scheme-${a.scheme}` : "", a.on && !a.images ? "a11y-noimg" : ""]
    .filter(Boolean)
    .join(" ");
  const og = opts.ogImage ? v.abs(opts.ogImage) : v.abs("/img/og.png");
  return html`<!doctype html>
<html lang="${LANG_META[v.lang].htmlLang}"${attr("class", htmlClass || false)}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${canonical}" />
${langs.map((l) => html`<link rel="alternate" hreflang="${LANG_META[l].hreflang}" href="${v.abs(v.href(v.rest, l))}" />`)}
${langs.includes("kz") ? html`<link rel="alternate" hreflang="x-default" href="${v.abs(v.href(v.rest, "kz"))}" />` : ""}
<link rel="alternate" type="application/rss+xml" title="RSS" href="${v.href("rss.xml")}" />
${opts.noindex ? html`<meta name="robots" content="noindex" />` : ""}
<meta property="og:type" content="${opts.ogType || "website"}" />
<meta property="og:title" content="${opts.title || v.l(v.s.schoolName)}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${og}" />
<meta property="og:locale" content="${LANG_META[v.lang].ogLocale}" />
<meta property="og:site_name" content="${v.l(v.s.schoolName)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#0b1f3a" />
<meta name="view-transition" content="same-origin" />
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@500;600;700;800&display=swap" />
<link rel="stylesheet" href="/css/site.css?v=${ASSET_V}" />
<script src="/js/site.js?v=${ASSET_V}" defer></script>
</head>
<body class="${opts.bodyClass || ""}" data-lang="${v.lang}"${config.staticExport ? raw(` data-static-base="${process.env.STATIC_BASE || ""}"`) : ""} data-lb-close="${v.t("gallery.close")}" data-lb-prev="${v.t("gallery.prev")}" data-lb-next="${v.t("gallery.next")}">
<a class="skip-link" href="#main">${v.t("skip")}</a>
${header(v, langs, opts.active)}
<main id="main" tabindex="-1">
${content}
</main>
${footer(v)}
</body>
</html>`;
}

/* ------------------------------------------------------------ components */

export function breadcrumbs(v: View, items: Crumb[]): SafeHtml {
  const all: Crumb[] = [{ label: v.t("nav.home"), href: v.href() }, ...items];
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: c.href ? v.abs(c.href) : undefined })),
  };
  return html`<nav class="crumbs" aria-label="${v.t("breadcrumbs")}">
    <ol>
      ${all.map((c, i) =>
        i === all.length - 1 || !c.href
          ? html`<li><span aria-current="page">${c.label}</span></li>`
          : html`<li><a href="${c.href}">${c.label}</a>${icon("chevronRight", "icon icon-xs")}</li>`,
      )}
    </ol>
    <script type="application/ld+json">${raw(JSON.stringify(ld).replace(/</g, "\\u003c"))}</script>
  </nav>`;
}

export function pageHero(v: View, opts: { title: string; lead?: string; crumbs: Crumb[]; kicker?: string; icon?: string }): SafeHtml {
  return html`<section class="page-hero">
    <div class="page-hero__bg" aria-hidden="true"></div>
    <div class="container page-hero__inner">
      ${breadcrumbs(v, opts.crumbs)}
      ${opts.kicker ? html`<p class="kicker kicker--light rise" style="--d:0">${opts.icon ? icon(opts.icon, "icon icon-sm") : ""}${opts.kicker}</p>` : ""}
      <h1 class="page-hero__title split split--load">${splitWords(opts.title)}</h1>
      ${opts.lead ? html`<p class="page-hero__lead rise" style="--d:4">${opts.lead}</p>` : ""}
    </div>
  </section>`;
}

/** Wraps each word so titles can be revealed word by word (pure CSS, no layout shift). */
export function splitWords(text: string, offset = 0): SafeHtml {
  const words = String(text).split(/\s+/).filter(Boolean);
  return html`${words.map((w, i) => html`<span class="w" style="--w:${i + offset}"><span>${w}</span></span>${i < words.length - 1 ? " " : ""}`)}`;
}

export function emptyState(text: string, iconName = "layers"): SafeHtml {
  return html`<div class="empty" data-reveal><span class="empty__icon">${icon(iconName)}</span><p>${text}</p></div>`;
}

export function pager(v: View, page: number, pages: number, makeHref: (p: number) => string): SafeHtml {
  if (pages <= 1) return html``;
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return html`<nav class="pager" aria-label="${v.t("pager.label")}">
    ${page > 1 ? html`<a class="pager__btn" rel="prev" href="${makeHref(page - 1)}">${icon("chevronLeft", "icon icon-sm")}<span>${v.t("pager.prev")}</span></a>` : html`<span class="pager__btn is-disabled" aria-hidden="true">${icon("chevronLeft", "icon icon-sm")}<span>${v.t("pager.prev")}</span></span>`}
    <ol>
      ${nums.map((n) => (n === "…" ? html`<li><span class="pager__gap">…</span></li>` : html`<li><a href="${makeHref(n)}"${attr("aria-current", n === page ? "page" : false)}>${n}</a></li>`))}
    </ol>
    ${page < pages ? html`<a class="pager__btn" rel="next" href="${makeHref(page + 1)}"><span>${v.t("pager.next")}</span>${icon("chevronRight", "icon icon-sm")}</a>` : html`<span class="pager__btn is-disabled" aria-hidden="true"><span>${v.t("pager.next")}</span>${icon("chevronRight", "icon icon-sm")}</span>`}
  </nav>`;
}
