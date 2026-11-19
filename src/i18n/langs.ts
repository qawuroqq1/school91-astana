export const LANGS = ["kz", "ru", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "kz";

export const LANG_META: Record<Lang, { label: string; short: string; htmlLang: string; hreflang: string; locale: string; ogLocale: string }> = {
  kz: { label: "Қазақша", short: "ҚАЗ", htmlLang: "kk", hreflang: "kk", locale: "kk-KZ", ogLocale: "kk_KZ" },
  ru: { label: "Русский", short: "РУС", htmlLang: "ru", hreflang: "ru", locale: "ru-RU", ogLocale: "ru_RU" },
  en: { label: "English", short: "ENG", htmlLang: "en", hreflang: "en", locale: "en-GB", ogLocale: "en_GB" },
};

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

/** Translatable value stored as JSON: { kz, ru, en }. */
export type L10n = Partial<Record<Lang, string>>;

export function pick(value: L10n | null | undefined, lang: Lang): string {
  return (value && value[lang]) || "";
}

export function parseL10n(raw: string | null | undefined): L10n {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as L10n) : {};
  } catch {
    return {};
  }
}
