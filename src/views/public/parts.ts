import { html, attr, raw, type SafeHtml, stripTags, truncate } from "../../lib/html.ts";
import { formatDate, type DictKey } from "../../i18n/index.ts";
import { LANG_META, isLang } from "../../i18n/langs.ts";
import type { DocumentRow, NewsLocalized } from "../../db/repo.ts";
import { humanSize } from "../../lib/uploads.ts";
import { icon } from "../icons.ts";
import { splitWords } from "../layout.ts";
import type { View } from "../context.ts";
import { config } from "../../config.ts";

export const IS_STATIC = (): boolean => config.staticExport;

const CAT_ICON: Record<string, string> = { news: "newspaper", events: "calendar", announcements: "megaphone", achievements: "trophy" };

export function catLabel(v: View, cat: string): string {
  return v.t(`news.cat.${cat}` as DictKey);
}

/** Decorative fallback when a publication has no picture: generative pattern, no fake photo. */
export function coverFallback(seed: number, cat: string): SafeHtml {
  const hue = [205, 188, 218, 32][seed % 4];
  return html`<div class="cover-fallback" style="--h:${hue}" aria-hidden="true">${icon(CAT_ICON[cat] || "sparkle", "icon cover-fallback__icon")}</div>`;
}

export function newsCard(v: View, n: NewsLocalized, variant: "default" | "feature" | "compact" = "default", i = 0): SafeHtml {
  const href = v.href(`news/${n.slug}`);
  const excerpt = n.excerpt || truncate(stripTags(n.body), 180);
  return html`<article class="news-card news-card--${variant}" data-reveal style="--i:${i}">
    <a class="news-card__media" href="${href}" tabindex="-1" aria-hidden="true">
      ${n.image ? html`<img src="${n.image}" alt="" loading="lazy" decoding="async" />` : coverFallback(n.id, n.category)}
    </a>
    <div class="news-card__body">
      <div class="news-card__meta">
        <a class="tag tag--${n.category}" href="${v.href(`news?category=${n.category}`)}">${catLabel(v, n.category)}</a>
        <time datetime="${n.published_at.slice(0, 10)}">${formatDate(v.lang, n.published_at)}</time>
      </div>
      <h3 class="news-card__title"><a href="${href}">${n.title}</a></h3>
      ${variant !== "compact" ? html`<p class="news-card__excerpt">${excerpt}</p>` : ""}
      ${variant === "feature" ? html`<a class="link-arrow" href="${href}">${v.t("news.readMore")} ${icon("arrowRight", "icon icon-sm")}</a>` : ""}
    </div>
  </article>`;
}

export function docList(v: View, docs: DocumentRow[]): SafeHtml {
  if (!docs.length) return html``;
  return html`<section class="docs" aria-labelledby="docs-title">
    <h2 id="docs-title" class="docs__title">${icon("file", "icon")}${v.t("page.documents")}</h2>
    <ul class="docs__list">
      ${docs.map((d, i) => {
        const title = v.l(d.title) || d.title.ru || d.title.kz || d.title.en || d.original_name;
        const ext = d.original_name.split(".").pop()?.toUpperCase() || "";
        const docLang = isLang(d.doc_lang) ? LANG_META[d.doc_lang].label : d.doc_lang;
        const shownInOtherLang = !v.l(d.title);
        return html`<li class="doc" data-reveal style="--i:${i}">
          <span class="doc__ext">${ext}</span>
          <div class="doc__body">
            <a class="doc__title" href="${d.file}" target="_blank" rel="noopener"${attr("lang", shownInOtherLang && isLang(d.doc_lang) ? LANG_META[d.doc_lang].htmlLang : false)}>${title}</a>
            <span class="doc__meta">${v.t("page.docLang")}: ${docLang} · ${humanSize(d.size)} · ${formatDate(v.lang, d.created_at)}</span>
          </div>
          <a class="icon-btn icon-btn--soft" href="${d.file}" download="${d.original_name}" aria-label="${v.t("page.download")}: ${title}">${icon("download", "icon icon-sm")}</a>
        </li>`;
      })}
    </ul>
  </section>`;
}

export interface FieldOpts {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea";
  value?: string;
  error?: string;
  required?: boolean;
  max?: number;
  autocomplete?: string;
}

export function field(v: View, f: FieldOpts): SafeHtml {
  const id = `f-${f.name}`;
  const errId = `${id}-err`;
  const common = html`id="${id}" name="${f.name}"${attr("required", !!f.required)}${attr("maxlength", f.max)}${attr("aria-invalid", f.error ? "true" : false)}${attr("aria-describedby", f.error ? errId : false)}${attr("autocomplete", f.autocomplete)}`;
  return html`<div class="field${f.error ? " has-error" : ""}">
    <label for="${id}">${f.label}${f.required ? html`<span class="req" aria-hidden="true">*</span>` : html` <span class="opt">(${v.t("form.optional")})</span>`}</label>
    ${f.type === "textarea"
      ? html`<textarea ${common} rows="5">${f.value || ""}</textarea>`
      : html`<input type="${f.type || "text"}" ${common} value="${f.value || ""}" />`}
    ${f.error ? html`<p class="field__error" id="${errId}">${icon("alert", "icon icon-xs")}${f.error}</p>` : ""}
  </div>`;
}

export function formAlert(kind: "success" | "error", text: string): SafeHtml {
  return html`<div class="alert alert--${kind}" role="${kind === "error" ? "alert" : "status"}" tabindex="-1" data-focus>${icon(kind === "success" ? "check" : "alert", "icon icon-sm")}<span>${text}</span></div>`;
}

export function hiddenTokens(v: View): SafeHtml {
  // _token: CSRF-like cookie match; website: honeypot that humans never fill.
  return html`<input type="hidden" name="_token" value="${v.formToken}" /><div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div><input type="hidden" name="_ts" value="${Date.now()}" />`;
}

export function staticFormNotice(v: View): SafeHtml {
  return html`<div class="notice" role="note">${icon("info", "icon")}<div><p>${v.t("static.form")}</p>
    <p>${v.s.phone ? html`<a href="tel:${v.s.phone.replace(/[^\d+]/g, "")}">${v.s.phone}</a>` : ""}${v.s.phone && v.s.email ? " · " : ""}${v.s.email ? html`<a href="mailto:${v.s.email}">${v.s.email}</a>` : ""}</p></div></div>`;
}

export function richText(body: string): SafeHtml {
  return raw(body);
}

export function sectionHead(kicker: string, title: string, action?: SafeHtml): SafeHtml {
  return html`<div class="section-head">
    <div>
      <p class="kicker" data-reveal>${kicker}</p>
      <h2 class="section-title split" data-reveal>${splitWords(title)}</h2>
    </div>
    ${action ? html`<div class="section-head__action" data-reveal>${action}</div>` : ""}
  </div>`;
}
