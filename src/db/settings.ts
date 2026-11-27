import { db } from "./index.ts";
import type { L10n } from "../i18n/langs.ts";

export interface Stat {
  value: number;
  suffix?: string;
  label: L10n;
}

export interface UsefulLink {
  title: L10n;
  url: string;
}

export interface Settings {
  schoolName: L10n;
  shortName: L10n;
  slogan: L10n;
  heroText: L10n;
  aboutText: L10n;
  address: L10n;
  hours: L10n;
  phone: string;
  phone2: string;
  email: string;
  instagram: string;
  facebook: string;
  youtube: string;
  telegram: string;
  mapLat: string;
  mapLng: string;
  gis2Url: string;
  heroImage: string;
  logo: string;
  profcomPhone: string;
  profcomEmail: string;
  profcomRoom: L10n;
  profcomHours: L10n;
  stats: Stat[];
  usefulLinks: UsefulLink[];
  analyticsId: string;
}

/** Defaults hold no invented facts: unknown contacts are empty and render as "уточняется". */
export const DEFAULT_SETTINGS: Settings = {
  schoolName: { kz: "Астана қаласының №91 мектеп-гимназиясы", ru: "Школа-гимназия №91 города Астаны", en: "School-Gymnasium No. 91, Astana" },
  shortName: { kz: "№91 мектеп-гимназия", ru: "Школа-гимназия №91", en: "School-Gymnasium No. 91" },
  slogan: { kz: "Болашаққа жол ашатын білім", ru: "Знания, которые открывают будущее", en: "Knowledge that opens the future" },
  heroText: {
    kz: "Әр оқушының әлеуетін ашуға, сапалы білім мен адамгершілік құндылықтарды дамытуға ұмтыламыз.",
    ru: "Мы стремимся раскрыть потенциал каждого ученика, давая качественные знания и воспитывая ценности.",
    en: "We strive to unlock every student's potential through quality education and strong values.",
  },
  aboutText: {
    kz: "№91 мектеп-гимназия — Астана қаласының Сарайшық ауданындағы білім беру ұйымы. Бұл сайтта оқу процесі, мектеп өмірі, құжаттар мен ресми ақпарат жарияланады.",
    ru: "Школа-гимназия №91 — образовательное учреждение в районе Сарайшык города Астаны. На этом сайте публикуется информация об учебном процессе, жизни школы, документы и официальная информация.",
    en: "School-Gymnasium No. 91 is a school in the Saraishyk district of Astana. This website publishes information about studies, school life, documents and official information.",
  },
  // Contacts as listed on the school's verified 2GIS card.
  address: {
    kz: "Анатолий Храпатый көшесі, 10, Сарайшық ауданы, Астана",
    ru: "ул. Анатолия Храпатого, 10, район Сарайшык, Астана",
    en: "10 Anatoly Khrapaty St, Saraishyk District, Astana",
  },
  hours: {
    kz: "09:00–18:00, түскі үзіліс 13:00–14:00",
    ru: "09:00–18:00, обед 13:00–14:00",
    en: "09:00–18:00, lunch 13:00–14:00",
  },
  phone: "+7 (7172) 57-60-31",
  phone2: "+7 (7172) 57-60-36",
  email: "",
  instagram: "https://www.instagram.com/91gymnasium.school",
  facebook: "https://www.facebook.com/groups/4081792368575195",
  youtube: "",
  telegram: "",
  mapLat: "51.113671",
  mapLng: "71.459348",
  gis2Url: "https://2gis.kz/astana/firm/70000001054711903",
  heroImage: "https://i3.photo.2gis.com/images/branch/0/30258560160783628_7091_1920x.jpg",
  logo: "",
  profcomPhone: "",
  profcomEmail: "",
  profcomRoom: {},
  profcomHours: {},
  stats: [],
  usefulLinks: [
    { title: { kz: "Электрондық үкімет", ru: "Электронное правительство", en: "eGov Kazakhstan" }, url: "https://egov.kz" },
    { title: { kz: "ҚР Оқу-ағарту министрлігі", ru: "Министерство просвещения РК", en: "Ministry of Education of Kazakhstan" }, url: "https://www.gov.kz/memleket/entities/edu" },
    { title: { kz: "Ұлттық тестілеу орталығы", ru: "Национальный центр тестирования", en: "National Testing Centre" }, url: "https://testcenter.kz" },
    { title: { kz: "Күнделік", ru: "Kundelik", en: "Kundelik" }, url: "https://kundelik.kz" },
  ],
  analyticsId: "",
};

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const merged: Record<string, unknown> = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    try {
      merged[r.key] = JSON.parse(r.value);
    } catch {
      /* ignore broken value, keep default */
    }
  }
  cache = merged as unknown as Settings;
  return cache;
}

export function saveSettings(patch: Partial<Settings>): void {
  const stmt = db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) stmt.run(k, JSON.stringify(v));
  }
  cache = null;
}

export function invalidateSettings(): void {
  cache = null;
}
