import { html, raw, type SafeHtml } from "../../lib/html.ts";
import { formatDate } from "../../i18n/index.ts";
import { LANG_META, isLang } from "../../i18n/langs.ts";
import type { SiteItem, SiteSection } from "../../site/structure.ts";
import { documents, pages, staff, type DocumentRow, type StaffRow } from "../../db/repo.ts";
import { humanSize } from "../../lib/uploads.ts";
import { icon } from "../icons.ts";
import { layout, breadcrumbs, splitWords } from "../layout.ts";
import { field, formAlert, hiddenTokens, richText, IS_STATIC, staticFormNotice } from "./parts.ts";
import type { FormState } from "./forms.ts";
import type { View } from "../context.ts";

/* The trade-union section has its own visual identity (deep green, gold, linked rings),
   but reuses the site's layout, typography, buttons and form components. */

/** Linked rings: the union's "solidarity" motif, drawn once when the page loads. */
function rings(cls: string): SafeHtml {
  return raw(`<svg class="${cls}" viewBox="0 0 420 300" aria-hidden="true" focusable="false">
    <circle class="pk-ring pk-ring--1" cx="140" cy="150" r="96" />
    <circle class="pk-ring pk-ring--2" cx="280" cy="150" r="96" />
    <circle class="pk-ring pk-ring--3" cx="210" cy="150" r="128" />
    <circle class="pk-dot" cx="210" cy="150" r="7" />
  </svg>`);
}

function docTitle(v: View, d: DocumentRow): string {
  return v.l(d.title) || d.title.ru || d.title.kz || d.title.en || d.original_name;
}
function docDate(d: DocumentRow): string {
  return d.doc_date || d.created_at.slice(0, 10);
}
function docLangLabel(d: DocumentRow): string {
  return isLang(d.doc_lang) ? LANG_META[d.doc_lang].label : d.doc_lang;
}
const ext = (d: DocumentRow) => d.original_name.split(".").pop()?.toUpperCase() || "";

function personName(v: View, p: StaffRow): string {
  return v.l(p.name) || p.name.ru || p.name.kz || p.name.en || "";
}
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/** Short labels for the sub-navigation so all six fit on one line. */
const SHORT: Record<string, { kz: string; ru: string; en: string }> = {
  chairman: { kz: "Төраға", ru: "Председатель", en: "Chair" },
  members: { kz: "Мүшелері", ru: "Члены профкома", en: "Members" },
  agreement: { kz: "Ұжымдық шарт", ru: "Коллективный договор", en: "Collective agreement" },
  acts: { kz: "Актілер", ru: "Акты", en: "Acts" },
  join: { kz: "Кәсіподаққа кіру", ru: "Вступить", en: "Join" },
  contacts: { kz: "Байланыс", ru: "Контакты", en: "Contacts" },
};

function itemHref(v: View, s: SiteSection, it: SiteItem): string {
  return v.href(it.kind === "link" ? it.href : `${s.slug}/${it.slug}`);
}

/* ---------------------------------------------------------------- index */

export function profcomIndexView(v: View, section: SiteSection): SafeHtml {
  return layout(
    v,
    { title: v.l(section.title), description: v.l(section.lead), active: section.slug, bodyClass: "theme-profcom" },
    html`<section class="pk-hero">
      <div class="container pk-hero__grid">
        <div class="pk-hero__copy">
          ${breadcrumbs(v, [{ label: v.l(section.title) }])}
          <h1 class="pk-hero__title split split--load">${splitWords(v.l(section.title))}</h1>
          <p class="pk-hero__lead rise" style="--d:4">${v.l(section.lead)}</p>
          <div class="pk-hero__actions rise" style="--d:5">
            <a class="btn btn--gold btn--lg" href="${v.href("profcom/join")}">${v.l(section.items.find((i) => i.slug === "join")!.title)}</a>
            <a class="btn btn--glass btn--lg" href="${v.href("profcom/contacts")}">${icon("phone", "icon icon-sm")} ${v.l(section.items.find((i) => i.slug === "contacts")!.title)}</a>
          </div>
        </div>
        <div class="pk-hero__art">${rings("pk-rings")}</div>
      </div>
    </section>
    <section class="pk-cards-wrap" aria-labelledby="pk-sections">
      <div class="container">
        <h2 id="pk-sections" class="visually-hidden">${v.t("pk.sections")}</h2>
        <ul class="pk-cards" role="list">
          ${section.items.map(
            (it, i) => html`<li data-reveal style="--i:${i}">
              <a class="pk-card" href="${itemHref(v, section, it)}">
                <span class="pk-card__badge">${icon(it.icon || "file")}</span>
                <span class="pk-card__title">${v.l(it.title)}</span>
                <span class="pk-card__text">${v.l(it.lead)}</span>
                <span class="pk-card__more">${v.t("card.open")}${icon("arrowRight", "icon icon-sm")}</span>
              </a>
            </li>`,
          )}
        </ul>
      </div>
    </section>`,
  );
}

/* ------------------------------------------------------------ subpages */

function subHero(v: View, section: SiteSection, item: SiteItem, lead?: string): SafeHtml {
  return html`<section class="pk-hero pk-hero--sub">
    <div class="container pk-hero__grid">
      <div class="pk-hero__copy">
        ${breadcrumbs(v, [{ label: v.l(section.title), href: v.href(section.slug) }, { label: v.l(item.title) }])}
        <h1 class="pk-hero__title split split--load">${splitWords(v.l(item.title))}</h1>
        ${lead || v.l(item.lead) ? html`<p class="pk-hero__lead rise" style="--d:3">${lead || v.l(item.lead)}</p>` : ""}
      </div>
      <div class="pk-hero__art pk-hero__art--sub">${rings("pk-rings")}</div>
    </div>
  </section>
  <nav class="pk-tabs" aria-label="${v.t("pk.sections")}">
    <div class="container">
      <ul role="list">
        ${section.items.map(
          (it) => html`<li><a href="${itemHref(v, section, it)}"${it.slug === item.slug ? raw(' aria-current="page"') : ""}>${icon(it.icon || "file", "icon icon-sm")}<span>${SHORT[it.slug] ? SHORT[it.slug][v.lang] : v.l(it.title)}</span></a></li>`,
        )}
      </ul>
    </div>
  </nav>`;
}

function pendingCard(text: string, iconName: string, extra?: SafeHtml): SafeHtml {
  return html`<div class="pk-pending" data-reveal>
    <span class="pk-pending__icon">${icon(iconName)}</span>
    <p>${text}</p>
    ${extra || ""}
  </div>`;
}

function chairmanBody(v: View): SafeHtml {
  const chair = staff.byGroup("profcom_chair")[0];
  if (!chair) {
    return html`<article class="pk-chair pk-chair--empty" data-reveal>
      <div class="pk-chair__photo"><span class="pk-chair__ph">${icon("user")}</span><small>${v.t("staff.photoPending")}</small></div>
      <div class="pk-chair__body">
        <p class="pk-chair__role">${v.t("pk.contacts.chair")}</p>
        <p class="pk-chair__name pk-skeleton" aria-hidden="true"></p>
        <p class="muted">${v.t("pk.chair.pending")}</p>
        <a class="btn btn--outline" href="${v.href("profcom/contacts")}">${icon("phone", "icon icon-sm")} ${v.t("pk.chair.contact")}</a>
      </div>
    </article>`;
  }
  const name = personName(v, chair);
  return html`<article class="pk-chair" data-reveal>
    <div class="pk-chair__photo">${chair.photo ? html`<img src="${chair.photo}" alt="${name}" decoding="async" />` : html`<span class="pk-chair__ph pk-chair__ph--initials">${initials(name)}</span>`}</div>
    <div class="pk-chair__body">
      <p class="pk-chair__role">${v.l(chair.position) || v.t("pk.contacts.chair")}</p>
      <h2 class="pk-chair__name">${name}</h2>
      ${v.l(chair.bio) ? html`<div class="prose">${richText(v.l(chair.bio))}</div>` : ""}
      <div class="pk-chair__contacts">
        ${chair.phone ? html`<a class="pk-contact-pill" href="tel:${chair.phone.replace(/[^\d+]/g, "")}">${icon("phone", "icon icon-sm")}${chair.phone}</a>` : ""}
        ${chair.email ? html`<a class="pk-contact-pill" href="mailto:${chair.email}">${icon("mail", "icon icon-sm")}${chair.email}</a>` : ""}
        <a class="btn btn--outline" href="${v.href("profcom/contacts")}">${v.t("pk.chair.contact")}</a>
      </div>
    </div>
  </article>`;
}

function membersBody(v: View): SafeHtml {
  const people = staff.byGroup("profcom");
  if (!people.length) {
    return pendingCard(
      v.t("pk.members.pending"),
      "users",
      html`<div class="pk-ghosts" aria-hidden="true">${[0, 1, 2, 3].map(() => html`<span class="pk-ghost"><i></i><b></b><b></b></span>`)}</div>`,
    );
  }
  return html`<ul class="pk-members" role="list">
    ${people.map((p, i) => {
      const name = personName(v, p);
      return html`<li class="pk-member" data-reveal style="--i:${i}">
        <div class="pk-member__photo">${p.photo ? html`<img src="${p.photo}" alt="${name}" loading="lazy" decoding="async" />` : html`<span>${initials(name)}</span>`}</div>
        <h2 class="pk-member__name">${name}</h2>
        ${v.l(p.position) ? html`<p class="pk-member__pos">${v.l(p.position)}</p>` : ""}
        ${p.email || p.phone
          ? html`<p class="pk-member__contacts">${p.email ? html`<a href="mailto:${p.email}" aria-label="${p.email}">${icon("mail", "icon icon-sm")}</a>` : ""}${p.phone ? html`<a href="tel:${p.phone.replace(/[^\d+]/g, "")}" aria-label="${p.phone}">${icon("phone", "icon icon-sm")}</a>` : ""}</p>`
          : ""}
      </li>`;
    })}
  </ul>`;
}

function agreementBody(v: View, key: string, intro: SafeHtml): SafeHtml {
  const docs = documents.forPage(key);
  const pdf = docs.find((d) => d.mime === "application/pdf");
  const others = docs.filter((d) => d !== pdf);
  if (!docs.length) {
    return html`${intro}${pendingCard(v.t("pk.agreement.pending"), "file", html`<div class="pk-paper" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`)}`;
  }
  return html`${intro}
  ${pdf
    ? html`<section class="pk-doc" data-reveal aria-label="${v.t("pk.doc.viewer")}">
        <header class="pk-doc__head">
          <span class="pk-doc__ext">PDF</span>
          <div class="pk-doc__info">
            <h2 class="pk-doc__title">${docTitle(v, pdf)}</h2>
            <p class="pk-doc__meta">${formatDate(v.lang, docDate(pdf))} · ${humanSize(pdf.size)} · ${v.t("page.docLang")}: ${docLangLabel(pdf)}</p>
          </div>
          <div class="pk-doc__actions">
            <a class="btn btn--outline btn--small" href="${pdf.file}" target="_blank" rel="noopener">${icon("external", "icon icon-xs")} ${v.t("pk.doc.open")}</a>
            <a class="btn btn--gold btn--small" href="${pdf.file}" download="${pdf.original_name}">${icon("download", "icon icon-xs")} ${v.t("pk.doc.download")}</a>
          </div>
        </header>
        <div class="pk-doc__viewer">
          <iframe src="${pdf.file}#view=FitH" title="${v.t("pk.doc.viewer")}: ${docTitle(v, pdf)}" loading="lazy"></iframe>
        </div>
        <p class="pk-doc__mobile">${icon("info", "icon icon-sm")} ${v.t("pk.doc.mobile")}</p>
      </section>`
    : ""}
  ${others.length ? catalog(v, others, false) : ""}`;
}

function catalog(v: View, docs: DocumentRow[], filters: boolean): SafeHtml {
  const years = [...new Set(docs.map((d) => docDate(d).slice(0, 4)))].sort().reverse();
  return html`<section class="pk-catalog" data-catalog>
    ${filters
      ? html`<div class="pk-catalog__tools" data-reveal>
          <label class="pk-search">${icon("search", "icon icon-sm")}<span class="visually-hidden">${v.t("pk.acts.search")}</span><input type="search" placeholder="${v.t("pk.acts.search")}" data-catalog-search /></label>
          ${years.length > 1
            ? html`<div class="chips" role="group" aria-label="${v.t("pk.acts.all")}">
                <button type="button" class="chip" data-catalog-year="" aria-pressed="true">${v.t("pk.acts.all")}</button>
                ${years.map((y) => html`<button type="button" class="chip" data-catalog-year="${y}" aria-pressed="false">${y}</button>`)}
              </div>`
            : ""}
          <p class="pk-catalog__count" aria-live="polite" data-catalog-count data-template="${v.t("pk.acts.count")}">${v.t("pk.acts.count", { n: docs.length })}</p>
        </div>`
      : ""}
    <ol class="pk-acts" role="list">
      ${docs.map((d, i) => {
        const date = docDate(d);
        const title = docTitle(v, d);
        return html`<li class="pk-act" data-reveal style="--i:${Math.min(i, 8)}" data-year="${date.slice(0, 4)}" data-text="${title.toLocaleLowerCase()} ${d.original_name.toLocaleLowerCase()}">
          <time class="pk-act__date" datetime="${date}"><b>${new Date(date + "T00:00:00").getDate()}</b><span>${formatDate(v.lang, date).replace(/^\d+\s|^\d{4} ж\. \d+\s/, "")}</span></time>
          <div class="pk-act__body">
            <a class="pk-act__title" href="${d.file}" target="_blank" rel="noopener">${title}</a>
            <p class="pk-act__meta"><span class="pk-act__ext">${ext(d)}</span>${humanSize(d.size)} · ${docLangLabel(d)}</p>
          </div>
          <div class="pk-act__actions">
            <a class="icon-btn icon-btn--soft" href="${d.file}" target="_blank" rel="noopener" aria-label="${v.t("page.open")}: ${title}">${icon("eye", "icon icon-sm")}</a>
            <a class="icon-btn icon-btn--soft" href="${d.file}" download="${d.original_name}" aria-label="${v.t("page.download")}: ${title}">${icon("download", "icon icon-sm")}</a>
          </div>
        </li>`;
      })}
    </ol>
    ${filters ? html`<p class="pk-catalog__none muted" data-catalog-none hidden>${v.t("pk.acts.none")}</p>` : ""}
  </section>`;
}

function actsBody(v: View, key: string, intro: SafeHtml): SafeHtml {
  const docs = documents.forPage(key);
  return html`${intro}${docs.length ? catalog(v, docs, true) : pendingCard(v.t("pk.acts.empty"), "layers")}`;
}

function joinBody(v: View, body: string | undefined, form: FormState): SafeHtml {
  const e = form.errors || {};
  const val = form.values || {};
  return html`<div class="pk-join">
    <div class="pk-join__info">
      <section class="pk-join__about" data-reveal>
        <h2>${v.t("pk.join.why")}</h2>
        ${body ? html`<div class="prose">${richText(body)}</div>` : html`<p class="muted">${v.t("pk.join.pending")}</p>`}
      </section>
      <section class="pk-steps" data-reveal style="--i:1" aria-labelledby="pk-steps">
        <h2 id="pk-steps">${v.t("pk.join.steps")}</h2>
        <ol>
          <li><span class="pk-steps__n" aria-hidden="true">1</span><p>${v.t("pk.join.step1")}</p></li>
          <li><span class="pk-steps__n" aria-hidden="true">2</span><p>${v.t("pk.join.step2")}</p></li>
        </ol>
      </section>
    </div>
    ${IS_STATIC()
      ? html`<div class="form card pk-join__form" id="apply"><h2 class="form__title">${icon("plus", "icon")}${v.t("pk.join.form")}</h2>${staticFormNotice(v)}</div>`
      : html`<form class="form card pk-join__form" id="apply" method="post" action="${v.href("profcom/join")}#apply" data-form novalidate data-reveal>
          <h2 class="form__title">${icon("plus", "icon")}${v.t("pk.join.form")}</h2>
          ${form.notice ? formAlert(form.notice.kind, form.notice.text) : ""}
          ${hiddenTokens(v)}
          ${field(v, { name: "name", label: v.t("form.name"), required: true, max: 120, value: val.name, error: e.name, autocomplete: "name" })}
          <div class="form__row">
            ${field(v, { name: "email", label: v.t("form.email"), type: "email", required: true, max: 160, value: val.email, error: e.email, autocomplete: "email" })}
            ${field(v, { name: "phone", label: v.t("form.phone"), type: "tel", max: 40, value: val.phone, error: e.phone, autocomplete: "tel" })}
          </div>
          ${field(v, { name: "position", label: v.t("pk.join.position"), max: 160, value: val.position, error: e.position, autocomplete: "organization-title" })}
          ${field(v, { name: "message", label: v.t("pk.join.note"), type: "textarea", max: 3000, value: val.message, error: e.message })}
          <div class="field field--check${e.consent ? " has-error" : ""}">
            <label><input type="checkbox" name="consent" value="1" required /> <span>${v.t("form.consent")}</span></label>
            ${e.consent ? html`<p class="field__error">${icon("alert", "icon icon-xs")}${e.consent}</p>` : ""}
          </div>
          <button class="btn btn--gold btn--lg" type="submit" data-loading-text="${v.t("form.sending")}">${v.t("pk.join.submit")}</button>
        </form>`}
  </div>`;
}

function contactsBody(v: View, body: string | undefined): SafeHtml {
  const s = v.s;
  const tbd = html`<span class="tbd">${v.t("tbd")}</span>`;
  const chair = staff.byGroup("profcom_chair")[0];
  const cards: [string, string, SafeHtml, string?][] = [
    ["phone", v.t("contacts.phone"), s.profcomPhone ? html`${s.profcomPhone}` : tbd, s.profcomPhone ? `tel:${s.profcomPhone.replace(/[^\d+]/g, "")}` : undefined],
    ["mail", v.t("contacts.email"), s.profcomEmail ? html`${s.profcomEmail}` : tbd, s.profcomEmail ? `mailto:${s.profcomEmail}` : undefined],
    ["mapPin", v.t("pk.contacts.room"), v.l(s.profcomRoom) ? html`${v.l(s.profcomRoom)}` : tbd],
    ["clock", v.t("pk.contacts.hours"), v.l(s.profcomHours) ? html`${v.l(s.profcomHours)}` : tbd],
  ];
  return html`<ul class="pk-contacts" role="list">
      ${cards.map(
        ([ico, label, value, href], i) => html`<li data-reveal style="--i:${i}">
          ${href
            ? html`<a class="pk-contact" href="${href}"><span class="pk-contact__icon">${icon(ico)}</span><span class="pk-contact__label">${label}</span><span class="pk-contact__value">${value}</span></a>`
            : html`<div class="pk-contact"><span class="pk-contact__icon">${icon(ico)}</span><span class="pk-contact__label">${label}</span><span class="pk-contact__value">${value}</span></div>`}
        </li>`,
      )}
    </ul>
    <div class="pk-contacts__more">
      <div class="pk-mini" data-reveal>
        <p class="pk-mini__label">${v.t("pk.contacts.chair")}</p>
        ${chair
          ? html`<a class="pk-mini__person" href="${v.href("profcom/chairman")}"><span class="pk-mini__avatar">${chair.photo ? html`<img src="${chair.photo}" alt="" />` : initials(personName(v, chair))}</span><span><strong>${personName(v, chair)}</strong>${v.l(chair.position) ? html`<small>${v.l(chair.position)}</small>` : ""}</span></a>`
          : html`<p class="muted">${v.t("pk.chair.pending")}</p>`}
        <p class="pk-mini__label">${v.t("pk.contacts.school")}</p>
        <p>${v.l(s.address) || tbd}</p>
      </div>
      <a class="pk-cta" href="${v.href("profcom/join")}" data-reveal style="--i:1">
        ${rings("pk-cta__rings")}
        <span class="pk-cta__title">${v.t("pk.contacts.join")}</span>
        <span class="pk-cta__text">${v.t("pk.contacts.joinText")}</span>
        <span class="pk-cta__more">${v.t("card.open")}${icon("arrowRight", "icon icon-sm")}</span>
      </a>
    </div>
    ${body ? html`<div class="prose pk-contacts__prose" data-reveal>${richText(body)}</div>` : ""}`;
}

export function profcomPageView(v: View, section: SiteSection, item: SiteItem, form: FormState = {}): SafeHtml {
  const key = `${section.slug}/${item.slug}`;
  const content = pages.get(key)?.tr[v.lang];
  const body = content?.body?.trim() ? content.body : undefined;
  const intro = body && item.slug !== "join" && item.slug !== "contacts" ? html`<div class="prose pk-intro" data-reveal>${richText(body)}</div>` : html``;
  let main: SafeHtml;
  switch (item.slug) {
    case "chairman":
      main = html`${intro}${chairmanBody(v)}`;
      break;
    case "members":
      main = html`${intro}${membersBody(v)}`;
      break;
    case "agreement":
      main = agreementBody(v, key, intro);
      break;
    case "acts":
      main = actsBody(v, key, intro);
      break;
    case "join":
      main = joinBody(v, body, form);
      break;
    default:
      main = contactsBody(v, body);
  }
  return layout(
    v,
    { title: v.l(item.title), description: content?.lead || v.l(item.lead), active: section.slug, bodyClass: "theme-profcom" },
    html`${subHero(v, section, item, content?.lead)}
    <section class="pk-page">
      <div class="container">${main}</div>
    </section>`,
  );
}
