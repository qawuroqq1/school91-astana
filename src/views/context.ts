import type { Ctx } from "../lib/http.ts";
import { translator, type T } from "../i18n/index.ts";
import { LANGS, pick, type L10n, type Lang } from "../i18n/langs.ts";
import { getSettings, type Settings } from "../db/settings.ts";
import { config } from "../config.ts";

export interface Crumb {
  label: string;
  href?: string;
}

export interface A11yPrefs {
  on: boolean;
  font: 0 | 1 | 2;
  scheme: "normal" | "high" | "inverse";
  images: boolean;
}

/** Everything a public view needs to render. */
export interface View {
  lang: Lang;
  t: T;
  s: Settings;
  /** Current path without the language prefix, e.g. "/about/history". */
  rest: string;
  search: string;
  a11y: A11yPrefs;
  formToken: string;
  l: (value: L10n | null | undefined) => string;
  /** Build a localized href: href("about") → "/ru/about". */
  href: (p?: string, lang?: Lang) => string;
  abs: (p: string) => string;
}

export function parseA11y(cookie: string | undefined): A11yPrefs {
  const prefs: A11yPrefs = { on: false, font: 0, scheme: "normal", images: true };
  if (!cookie) return prefs;
  for (const part of cookie.split(",")) {
    const [k, v] = part.split(":");
    if (k === "on") prefs.on = v === "1";
    if (k === "f") prefs.font = (Math.min(2, Math.max(0, Number(v) || 0)) as 0 | 1 | 2);
    if (k === "c" && (v === "high" || v === "inverse" || v === "normal")) prefs.scheme = v;
    if (k === "i") prefs.images = v !== "0";
  }
  return prefs;
}

export function makeView(ctx: Ctx, lang: Lang, rest: string, formToken: string): View {
  const s = getSettings();
  const href = (p = "", l: Lang = lang) => {
    const clean = p.replace(/^\/+/, "");
    return `/${l}${clean ? "/" + clean : ""}`;
  };
  return {
    lang,
    t: translator(lang),
    s,
    rest,
    search: ctx.url.search,
    a11y: parseA11y(ctx.cookies.s91_a11y),
    formToken,
    l: (v) => pick(v, lang),
    href,
    abs: (p) => config.siteUrl + p,
  };
}

export function otherLangs(lang: Lang): Lang[] {
  return LANGS.filter((l) => l !== lang);
}
