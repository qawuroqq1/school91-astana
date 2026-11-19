import type { L10n } from "../i18n/langs.ts";

/**
 * The navigation tree of the site. Content of `page` items lives in the
 * database (editable in the CMS); this file only defines the structure,
 * slugs and titles, so every language has identical routes.
 */
export type PageKind =
  | "page" // rich-text page from the CMS (+ attached documents)
  | "staff" // list of people from the staff table, filtered by group
  | "link"; // shortcut to another route

export interface SiteItem {
  slug: string;
  title: L10n;
  kind: PageKind;
  /** For kind=staff: which staff group to render. */
  staffGroup?: "director" | "administration" | "teachers";
  /** For kind=link: path without the language prefix, e.g. "news?category=events". */
  href?: string;
}

export interface SiteSection {
  slug: string;
  nav: L10n; // short label for the main menu
  title: L10n; // full title
  lead: L10n; // one-sentence description
  icon: string; // icon name from views/icons.ts
  items: SiteItem[];
}

const p = (slug: string, kz: string, ru: string, en: string): SiteItem => ({ slug, kind: "page", title: { kz, ru, en } });
const link = (slug: string, href: string, kz: string, ru: string, en: string): SiteItem => ({ slug, kind: "link", href, title: { kz, ru, en } });

export const SECTIONS: SiteSection[] = [
  {
    slug: "about",
    icon: "school",
    nav: { kz: "Мектеп туралы", ru: "О школе", en: "About" },
    title: { kz: "Мектеп туралы", ru: "О школе", en: "About the School" },
    lead: {
      kz: "Мектептің тарихы, миссиясы, басшылығы, педагогтері және инфрақұрылымы.",
      ru: "История, миссия, руководство, педагоги и инфраструктура школы.",
      en: "The school's history, mission, leadership, teachers and facilities.",
    },
    items: [
      p("history", "Мектеп тарихы", "История школы", "School History"),
      p("mission", "Миссия және құндылықтар", "Миссия и ценности", "Mission and Values"),
      { slug: "director", kind: "staff", staffGroup: "director", title: { kz: "Мектеп директоры", ru: "Директор школы", en: "Principal" } },
      { slug: "administration", kind: "staff", staffGroup: "administration", title: { kz: "Әкімшілік", ru: "Администрация", en: "Administration" } },
      { slug: "teachers", kind: "staff", staffGroup: "teachers", title: { kz: "Педагогикалық құрам", ru: "Педагогический состав", en: "Teaching Staff" } },
      p("passport", "Мектеп төлқұжаты", "Паспорт школы", "School Profile"),
      p("achievements", "Мектеп жетістіктері", "Достижения школы", "School Achievements"),
      p("facilities", "Материалдық-техникалық база", "Материально-техническая база", "Facilities"),
      p("rules", "Ішкі тәртіп ережелері", "Правила внутреннего распорядка", "School Rules"),
      p("uniform", "Мектеп формасы", "Школьная форма", "School Uniform"),
      link("gallery", "gallery", "Фотогалерея", "Фотогалерея", "Photo Gallery"),
    ],
  },
  {
    slug: "students",
    icon: "graduation",
    nav: { kz: "Оқушыларға", ru: "Ученикам", en: "Students" },
    title: { kz: "Оқушыларға", ru: "Ученикам", en: "For Students" },
    lead: {
      kz: "Сабақ кестесі, олимпиадалар, ҰБТ-ға дайындық және мектеп өмірі.",
      ru: "Расписание, олимпиады, подготовка к ЕНТ и школьная жизнь.",
      en: "Timetable, olympiads, UNT preparation and school life.",
    },
    items: [
      p("schedule", "Сабақ кестесі", "Расписание", "Timetable"),
      p("olympiads", "Олимпиадалар мен байқаулар", "Олимпиады и конкурсы", "Olympiads and Competitions"),
      p("achievements", "Оқушылар жетістіктері", "Достижения учеников", "Student Achievements"),
      p("career", "Кәсіби бағдар беру", "Профориентация", "Career Guidance"),
      p("unt", "ҰБТ-ға дайындық", "Подготовка к ЕНТ", "UNT Preparation"),
      p("projects", "Мектеп жобалары", "Школьные проекты", "School Projects"),
      p("extracurricular", "Сыныптан тыс жұмыс", "Внеклассная деятельность", "Extracurricular Activities"),
    ],
  },
  {
    slug: "parents",
    icon: "users",
    nav: { kz: "Ата-аналарға", ru: "Родителям", en: "Parents" },
    title: { kz: "Ата-аналарға", ru: "Родителям", en: "For Parents" },
    lead: {
      kz: "Қабылдау, тамақтану, ата-аналар комитеті және жиі қойылатын сұрақтар.",
      ru: "Приём, питание, родительский комитет и ответы на частые вопросы.",
      en: "Admission, school meals, the parents' committee and frequent questions.",
    },
    items: [
      p("info", "Ата-аналарға ақпарат", "Информация для родителей", "Information for Parents"),
      p("admission", "Қабылдау ережелері", "Правила приёма", "Admission"),
      p("nutrition", "Тамақтану", "Питание", "School Meals"),
      link("uniform", "about/uniform", "Мектеп формасы", "Школьная форма", "School Uniform"),
      p("committee", "Ата-аналар комитеті", "Родительский комитет", "Parents' Committee"),
      link("announcements", "news?category=announcements", "Хабарландырулар", "Объявления", "Announcements"),
      link("feedback", "contacts", "Кері байланыс", "Обратная связь", "Feedback"),
      p("faq", "Жиі қойылатын сұрақтар", "Часто задаваемые вопросы", "FAQ"),
    ],
  },
  {
    slug: "teachers",
    icon: "book",
    nav: { kz: "Педагогтерге", ru: "Учителям", en: "Teachers" },
    title: { kz: "Педагогтерге", ru: "Учителям", en: "For Teachers" },
    lead: {
      kz: "Әдістемелік жұмыс, біліктілікті арттыру және аттестаттау.",
      ru: "Методическая работа, повышение квалификации и аттестация.",
      en: "Methodology, professional development and certification.",
    },
    items: [
      p("methodology", "Әдістемелік жұмыс", "Методическая работа", "Methodology"),
      p("development", "Біліктілікті арттыру", "Повышение квалификации", "Professional Development"),
      p("young-teachers", "Жас мамандар", "Молодые специалисты", "Early-Career Teachers"),
      link("attestation", "official/attestation", "Аттестаттау", "Аттестация", "Attestation"),
      link("vacancies", "official/vacancies", "Бос жұмыс орындары", "Вакансии", "Vacancies"),
    ],
  },
  {
    slug: "upbringing",
    icon: "heart",
    nav: { kz: "Тәрбие", ru: "Воспитание", en: "Wellbeing" },
    title: { kz: "Тәрбие жұмысы", ru: "Воспитательная работа", en: "Pastoral Care" },
    lead: {
      kz: "Тәрбие жоспары, психологиялық қолдау, балалар қауіпсіздігі және жобалар.",
      ru: "План воспитательной работы, психологическая поддержка, безопасность детей и проекты.",
      en: "Pastoral plan, psychological support, child safety and projects.",
    },
    items: [
      p("plan", "Тәрбие жұмысының жоспары", "План воспитательной работы", "Pastoral Care Plan"),
      link("events", "news?category=events", "Мектеп іс-шаралары", "Школьные мероприятия", "School Events"),
      p("psychologist", "Психологиялық қызмет", "Психологическая служба", "Psychological Service"),
      p("social-pedagogue", "Әлеуметтік педагог", "Социальный педагог", "Social Pedagogue"),
      p("prevention", "Құқық бұзушылықтың алдын алу", "Профилактика правонарушений", "Offence Prevention"),
      p("safety", "Балалар қауіпсіздігі", "Безопасность детей", "Child Safety"),
      p("anti-corruption", "Сыбайлас жемқорлыққа қарсы тәрбие", "Антикоррупционное воспитание", "Anti-Corruption Education"),
      p("projects", "Ұлттық және білім беру жобалары", "Национальные и образовательные проекты", "National and Educational Projects"),
    ],
  },
  {
    slug: "budget",
    icon: "wallet",
    nav: { kz: "Ашық бюджет", ru: "Открытый бюджет", en: "Open Budget" },
    title: { kz: "Ашық бюджет", ru: "Открытый бюджет", en: "Open Budget" },
    lead: {
      kz: "Қаржыландыру, есептер, мемлекеттік сатып алу және тамақтануды ұйымдастыру.",
      ru: "Финансирование, отчёты, госзакупки и организация питания.",
      en: "Funding, reports, public procurement and catering.",
    },
    items: [
      p("funding", "Қаржыландыру туралы ақпарат", "Информация о финансировании", "Funding"),
      p("reports", "Қаржылық есептер", "Финансовые отчёты", "Financial Reports"),
      p("documents", "Құжаттар", "Документы", "Documents"),
      p("procurement", "Мемлекеттік сатып алу", "Государственные закупки", "Public Procurement"),
      p("nutrition", "Тамақтануды ұйымдастыру", "Организация питания", "Catering"),
      p("public", "Жұртшылыққа арналған ақпарат", "Информация для общественности", "Public Information"),
    ],
  },
  {
    slug: "official",
    icon: "shield",
    nav: { kz: "Ресми", ru: "Официально", en: "Official" },
    title: { kz: "Ресми ақпарат", ru: "Официальная информация", en: "Official Information" },
    lead: {
      kz: "Нормативтік құжаттар, мемлекеттік рәміздер мен қызметтер, бос орындар.",
      ru: "Нормативные документы, государственные символы и услуги, вакансии.",
      en: "Regulations, state symbols and services, vacancies.",
    },
    items: [
      p("regulations", "Нормативтік құжаттар", "Нормативные документы", "Regulations"),
      p("symbols", "Мемлекеттік рәміздер", "Государственные символы", "State Symbols"),
      p("services", "Мемлекеттік қызметтер", "Государственные услуги", "Public Services"),
      link("reception", "director-blog", "Виртуалды қабылдау", "Виртуальная приёмная", "Virtual Reception"),
      p("self-assessment", "Өзін-өзі бағалау", "Самооценка школы", "Self-Assessment"),
      p("attestation", "Аттестаттау", "Аттестация", "Attestation"),
      p("admin-documents", "Әкімшілік құжаттары", "Документы администрации", "Administrative Documents"),
      p("vacancies", "Бос жұмыс орындары", "Вакансии", "Vacancies"),
    ],
  },
  {
    slug: "news",
    icon: "newspaper",
    nav: { kz: "Жаңалықтар", ru: "Новости", en: "News" },
    title: { kz: "Жаңалықтар", ru: "Новости", en: "News" },
    lead: {
      kz: "Мектеп өміріндегі жаңалықтар, іс-шаралар мен хабарландырулар.",
      ru: "Новости, мероприятия и объявления школы.",
      en: "School news, events and announcements.",
    },
    items: [
      link("all", "news", "Барлық жаңалықтар", "Все новости", "All News"),
      link("events", "news?category=events", "Іс-шаралар", "Мероприятия", "Events"),
      link("announcements", "news?category=announcements", "Хабарландырулар", "Объявления", "Announcements"),
      link("achievements", "news?category=achievements", "Жетістіктер", "Достижения", "Achievements"),
      link("archive", "news/archive", "Жарияланымдар мұрағаты", "Архив публикаций", "Archive"),
    ],
  },
];

export const NEWS_CATEGORIES = ["news", "events", "announcements", "achievements"] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export function findSection(slug: string): SiteSection | undefined {
  return SECTIONS.find((s) => s.slug === slug);
}

export function findItem(sectionSlug: string, itemSlug: string): { section: SiteSection; item: SiteItem } | undefined {
  const section = findSection(sectionSlug);
  const item = section?.items.find((i) => i.slug === itemSlug);
  return section && item ? { section, item } : undefined;
}

/** All CMS-backed pages, keyed "section/slug". */
export function cmsPageKeys(): { key: string; section: SiteSection; item: SiteItem }[] {
  return SECTIONS.flatMap((section) =>
    section.items.filter((i) => i.kind === "page" || i.kind === "staff").map((item) => ({ key: `${section.slug}/${item.slug}`, section, item })),
  );
}

/** Quick-access tiles on the home page. */
export const QUICK_LINKS: { href: string; icon: string; title: L10n; text: L10n }[] = [
  { href: "about", icon: "school", title: { kz: "Мектеп туралы", ru: "О школе", en: "About" }, text: { kz: "Тарих, миссия, құндылықтар", ru: "История, миссия, ценности", en: "History, mission, values" } },
  { href: "about/administration", icon: "briefcase", title: { kz: "Әкімшілік", ru: "Администрация", en: "Administration" }, text: { kz: "Мектеп басшылығы", ru: "Руководство школы", en: "School leadership" } },
  { href: "students", icon: "graduation", title: { kz: "Оқушыларға", ru: "Ученикам", en: "Students" }, text: { kz: "Кесте, олимпиадалар, ҰБТ", ru: "Расписание, олимпиады, ЕНТ", en: "Timetable, olympiads, UNT" } },
  { href: "parents", icon: "users", title: { kz: "Ата-аналарға", ru: "Родителям", en: "Parents" }, text: { kz: "Қабылдау, тамақтану, сұрақтар", ru: "Приём, питание, вопросы", en: "Admission, meals, questions" } },
  { href: "teachers", icon: "book", title: { kz: "Педагогтерге", ru: "Учителям", en: "Teachers" }, text: { kz: "Әдістеме және даму", ru: "Методика и развитие", en: "Methodology and growth" } },
  { href: "news", icon: "newspaper", title: { kz: "Жаңалықтар", ru: "Новости", en: "News" }, text: { kz: "Мектеп өмірі", ru: "Жизнь школы", en: "School life" } },
  { href: "official/regulations", icon: "file", title: { kz: "Құжаттар", ru: "Документы", en: "Documents" }, text: { kz: "Нормативтік база", ru: "Нормативная база", en: "Regulatory framework" } },
  { href: "official/services", icon: "landmark", title: { kz: "Мемлекеттік қызметтер", ru: "Госуслуги", en: "Public Services" }, text: { kz: "Өтініштер мен анықтамалар", ru: "Заявления и справки", en: "Applications and certificates" } },
];
