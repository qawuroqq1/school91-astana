import { html, type SafeHtml } from "../../lib/html.ts";
import { monthShort } from "../../i18n/index.ts";
import { QUICK_LINKS, findItem } from "../../site/structure.ts";
import { announcements, gallery, news } from "../../db/repo.ts";
import { icon } from "../icons.ts";
import { layout, splitWords, emptyState, sunDecor } from "../layout.ts";
import { newsCard, sectionHead, socialPlates } from "./parts.ts";
import type { View } from "../context.ts";

function hero(v: View): SafeHtml {
  const img = v.s.heroImage;
  const name = v.l(v.s.shortName);
  const slogan = v.l(v.s.slogan);
  return html`<section class="hero" aria-labelledby="hero-title">
    ${sunDecor("hero__sun")}
    <div class="hero__grid container">
      <div class="hero__copy">
        <p class="kicker rise" style="--d:0"><span class="dot" aria-hidden="true"></span>${v.t("hero.kicker")}</p>
        <h1 class="hero__title split split--load" id="hero-title">
          <span class="hero__name">${splitWords(name)}</span>
          <span class="hero__slogan">${splitWords(slogan, 2)}</span>
        </h1>
        <p class="hero__text rise" style="--d:6">${v.l(v.s.heroText)}</p>
        <div class="hero__actions rise" style="--d:7">
          <a class="btn btn--primary btn--lg" href="${v.href("about")}" data-magnetic>${v.t("hero.about")} ${icon("arrowRight", "icon icon-sm")}</a>
          <a class="btn btn--glass btn--lg" href="${v.href("about/history")}">${v.t("hero.more")}</a>
        </div>
      </div>
      <figure class="hero__media rise" style="--d:3">
        <div class="hero__frame" data-parallax>
          ${img
            ? html`<img src="${img}" alt="${v.l(v.s.schoolName)}" fetchpriority="high" decoding="async" />`
            : html`<img src="/img/hero-placeholder.svg" alt="" fetchpriority="high" decoding="async" width="960" height="1100" />`}
        </div>
        ${img ? "" : html`<figcaption class="hero__note">${icon("info", "icon icon-xs")}${v.t("hero.photoNote")}</figcaption>`}
        <div class="hero__badge" aria-hidden="true"><span>91</span></div>
      </figure>
    </div>
    <a class="hero__scroll" href="#quick" aria-label="${v.t("hero.scroll")}">${icon("arrowDown", "icon icon-sm")}</a>
  </section>`;
}

function quick(v: View): SafeHtml {
  return html`<section class="section" id="quick" aria-labelledby="quick-title">
    <div class="container">
      ${sectionHead(v.t("home.quick.kicker"), v.t("home.quick.title"))}
      <ul class="quick-grid" role="list">
        ${QUICK_LINKS.map(
          (q, i) => html`<li data-reveal style="--i:${i}" class="hue-${q.href.split("/")[0] === "official" && q.href.includes("services") ? "budget" : q.href.split("/")[0]}">
            <a class="quick-card" href="${v.href(q.href)}">
              <span class="quick-card__icon">${icon(q.icon)}</span>
              <span class="quick-card__title">${v.l(q.title)}</span>
              <span class="quick-card__text">${v.l(q.text)}</span>
              <span class="quick-card__arrow">${icon("arrowUpRight", "icon icon-sm")}</span>
            </a>
          </li>`,
        )}
      </ul>
    </div>
  </section>`;
}

function newsBlock(v: View): SafeHtml {
  const items = news.latest(v.lang, 5);
  const [first, ...rest] = items;
  const events = news.upcomingEvents(v.lang, 3);
  const anns = announcements.current();
  return html`<section class="section section--tint" aria-labelledby="news-title">
    <div class="container">
      ${sectionHead(v.t("home.news.kicker"), v.t("home.news.title"), html`<a class="btn btn--outline" href="${v.href("news")}">${v.t("home.news.all")} ${icon("arrowRight", "icon icon-sm")}</a>`)}
      <div class="news-layout">
        <div class="news-layout__main">
          ${first ? newsCard(v, first, "feature") : emptyState(v.t("news.empty"), "newspaper")}
          ${rest.length ? html`<div class="news-layout__more">${rest.map((n, i) => newsCard(v, n, "compact", i + 1))}</div>` : ""}
        </div>
        <aside class="news-layout__side">
          <div class="side-card" data-reveal>
            <h3 class="side-card__title">${icon("calendar", "icon icon-sm")}${v.t("home.events.title")}</h3>
            ${events.length
              ? html`<ul class="event-list">${events.map(
                  (e) => html`<li><a href="${v.href(`news/${e.slug}`)}"><span class="event-date"><b>${new Date(e.event_date + "T00:00:00").getDate()}</b><small>${monthShort(v.lang, e.event_date)}</small></span><span>${e.title}</span></a></li>`,
                )}</ul>`
              : html`<p class="muted">${v.t("home.events.empty")}</p>`}
          </div>
          <div class="side-card side-card--accent" data-reveal style="--i:1">
            <h3 class="side-card__title">${icon("megaphone", "icon icon-sm")}${v.t("home.ann.title")}</h3>
            ${anns.length
              ? html`<ul class="ann-list">${anns.slice(0, 4).map((a) => html`<li>${a.link ? html`<a href="${a.link}">${v.l(a.text)}</a>` : v.l(a.text)}</li>`)}</ul>`
              : html`<p class="muted">${v.t("home.ann.empty")}</p>`}
          </div>
          <a class="side-card side-card--blog" href="${v.href("director-blog")}" data-reveal style="--i:2">
            ${icon("message", "icon")}
            <span><strong>${v.t("home.blog.title")}</strong><span>${v.t("home.blog.text")}</span></span>
            ${icon("arrowUpRight", "icon icon-sm")}
          </a>
        </aside>
      </div>
    </div>
  </section>`;
}

function about(v: View): SafeHtml {
  const stats = v.s.stats.filter((s) => s.value > 0 && v.l(s.label));
  return html`<section class="section about-band" aria-labelledby="about-title">
    <div class="container about-band__grid">
      <div class="about-band__copy">
        <p class="kicker kicker--light" data-reveal>${v.t("home.about.kicker")}</p>
        <h2 class="section-title section-title--light split" id="about-title" data-reveal>${splitWords(v.l(v.s.schoolName))}</h2>
        <p class="about-band__text" data-reveal style="--i:1">${v.l(v.s.aboutText)}</p>
        <a class="btn btn--light" href="${v.href("about")}" data-reveal style="--i:2" data-magnetic>${v.t("home.about.more")} ${icon("arrowRight", "icon icon-sm")}</a>
      </div>
      <div class="about-band__stats">
        <p class="kicker kicker--light" data-reveal>${v.t("home.stats.kicker")}</p>
        ${stats.length
          ? html`<dl class="stats">${stats.map(
              (s, i) => html`<div class="stat" data-reveal style="--i:${i}"><dt>${v.l(s.label)}</dt><dd><span data-count="${s.value}">${s.value}</span>${s.suffix || ""}</dd><span class="stat__bar" style="--fill:${Math.min(100, 40 + i * 15)}%"></span></div>`,
            )}</dl>`
          : html`<div class="stats-pending" data-reveal>${icon("chart", "icon")}<p>${v.t("home.stats.pending")}</p></div>`}
        <ul class="about-band__links" data-reveal style="--i:2">
          ${(["mission", "history", "passport", "achievements"] as const).map((slug) => {
            const it = findItem("about", slug);
            return it ? html`<li><a href="${v.href(`about/${slug}`)}"><span>${v.l(it.item.title)}</span>${icon("arrowUpRight", "icon icon-sm")}</a></li>` : "";
          })}
        </ul>
      </div>
    </div>
  </section>`;
}

function galleryBlock(v: View): SafeHtml {
  const imgs = gallery.images(undefined, 6);
  if (!imgs.length) return html``;
  return html`<section class="section" aria-labelledby="gal-title">
    <div class="container">
      ${sectionHead(v.t("home.gallery.kicker"), v.t("home.gallery.title"), html`<a class="btn btn--outline" href="${v.href("gallery")}">${v.t("home.gallery.all")} ${icon("arrowRight", "icon icon-sm")}</a>`)}
      <ul class="mosaic" data-lightbox-group>
        ${imgs.map(
          (im, i) => html`<li data-reveal style="--i:${i}"><a href="${im.file}" data-lightbox aria-label="${v.t("gallery.open")}" data-caption="${v.l(im.caption)}"><img src="${im.file}" alt="${v.l(im.caption)}" loading="lazy" decoding="async"${im.width ? html` width="${im.width}" height="${im.height}"` : ""} /></a></li>`,
        )}
      </ul>
    </div>
  </section>`;
}

function linksAndContacts(v: View): SafeHtml {
  const map = v.s.mapLat && v.s.mapLng;
  const gis = v.s.gis2Url || (v.l(v.s.address) ? `https://2gis.kz/astana/search/${encodeURIComponent(v.l(v.s.address))}` : "");
  return html`<section class="section section--tint" aria-labelledby="contacts-title">
    <div class="container contact-grid">
      <div>
        ${sectionHead(v.t("home.contacts.kicker"), v.t("home.contacts.title"))}
        <ul class="contact-list" data-reveal>
          <li>${icon("mapPin")}<div><span class="label">${v.t("contacts.address")}</span>${v.l(v.s.address) || html`<span class="tbd">${v.t("tbd")}</span>`}</div></li>
          <li>${icon("phone")}<div><span class="label">${v.t("contacts.phone")}</span>${v.s.phone ? html`<a href="tel:${v.s.phone.replace(/[^\d+]/g, "")}">${v.s.phone}</a>` : html`<span class="tbd">${v.t("tbd")}</span>`}</div></li>
          <li>${icon("mail")}<div><span class="label">${v.t("contacts.email")}</span>${v.s.email ? html`<a href="mailto:${v.s.email}">${v.s.email}</a>` : html`<span class="tbd">${v.t("tbd")}</span>`}</div></li>
        </ul>
        <div class="socials-block" data-reveal>
          <h3 class="useful__title">${v.t("contacts.socials")}</h3>
          ${socialPlates(v)}
        </div>
        <div class="useful" data-reveal>
          <h3 class="useful__title">${v.t("home.links.title")}</h3>
          <ul>
            ${v.s.usefulLinks.map((l) => html`<li><a href="${l.url}" target="_blank" rel="noopener noreferrer">${v.l(l.title)}${icon("external", "icon icon-xs")}</a></li>`)}
          </ul>
        </div>
      </div>
      <div class="map-card" data-reveal>
        ${map
          ? html`<iframe title="${v.t("contacts.map")}" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${Number(v.s.mapLng) - 0.006},${Number(v.s.mapLat) - 0.003},${Number(v.s.mapLng) + 0.006},${Number(v.s.mapLat) + 0.003}&layer=mapnik&marker=${v.s.mapLat},${v.s.mapLng}"></iframe>`
          : html`<div class="map-card__placeholder"><img src="/img/map-placeholder.svg" alt="" loading="lazy" /><span class="map-card__pin">${icon("mapPin")}</span></div>`}
        <div class="map-card__bar">
          <span>${v.l(v.s.address) || v.t("tbd")}</span>
          ${gis ? html`<a class="btn btn--small btn--primary" href="${gis}" target="_blank" rel="noopener noreferrer">${v.t("contacts.route")} ${icon("external", "icon icon-xs")}</a>` : html`<a class="btn btn--small btn--outline" href="${v.href("contacts")}">${v.t("nav.contacts")}</a>`}
        </div>
      </div>
    </div>
  </section>`;
}

export function homeView(v: View): SafeHtml {
  return layout(
    v,
    { title: "", bodyClass: "page-home" },
    html`${hero(v)}${quick(v)}${newsBlock(v)}${about(v)}${galleryBlock(v)}${linksAndContacts(v)}`,
  );
}
