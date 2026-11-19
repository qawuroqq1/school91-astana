import { ru, type DictKey, type Dict } from "./ru.ts";
import { kz } from "./kz.ts";
import { en } from "./en.ts";
import { LANG_META, type Lang } from "./langs.ts";

export { type DictKey } from "./ru.ts";

export const DICTS: Record<Lang, Dict> = { kz, ru, en };

/** Overrides edited in the CMS ("Переводы интерфейса"). Filled by the db layer. */
let overrides: Record<Lang, Partial<Dict>> = { kz: {}, ru: {}, en: {} };

export function setOverrides(next: Record<Lang, Partial<Dict>>): void {
  overrides = next;
}

export function t(lang: Lang, key: DictKey, vars?: Record<string, string | number>): string {
  let s = overrides[lang][key] || DICTS[lang][key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export type T = (key: DictKey, vars?: Record<string, string | number>) => string;

export function translator(lang: Lang): T {
  return (key, vars) => t(lang, key, vars);
}

const KZ_MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];

/** Human date. Kazakh is formatted by hand: ICU data for kk varies between Node builds. */
export function formatDate(lang: Lang, iso: string | null | undefined, withTime = false): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = withTime ? ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
  if (lang === "kz") return `${d.getFullYear()} ж. ${d.getDate()} ${KZ_MONTHS[d.getMonth()]}${time}`;
  return d.toLocaleDateString(LANG_META[lang].locale, { day: "numeric", month: "long", year: "numeric" }) + time;
}

export function isoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function monthShort(lang: Lang, iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  if (lang === "kz") return KZ_MONTHS[d.getMonth()].slice(0, 3);
  return d.toLocaleDateString(LANG_META[lang].locale, { month: "short" }).replace(".", "");
}
