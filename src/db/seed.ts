import { config } from "../config.ts";
import { hashPassword, randomToken } from "../lib/security.ts";
import { cmsPageKeys } from "../site/structure.ts";
import { announcements, gallery, news, pages, users } from "./repo.ts";
import { db, tx } from "./index.ts";

/** Photos published by the school itself on its verified 2GIS card ("От владельца"). */
export const SCHOOL_PHOTOS = [
  { url: "https://i3.photo.2gis.com/images/branch/0/30258560160783628_7091_1280x.jpg", caption: { kz: "Мектеп оқушылары", ru: "Ученики школы", en: "Our students" } },
  { url: "https://i6.photo.2gis.com/images/branch/0/30258560162221190_4f32_1280x.jpg", caption: { kz: "Ашық аспан астындағы сабақ", ru: "Занятие на свежем воздухе", en: "An outdoor class" } },
  { url: "https://i4.photo.2gis.com/images/branch/0/30258560162237184_4106_1280x.jpg", caption: { kz: "Шығармашылық шеберхана", ru: "Творческая мастерская", en: "A creative workshop" } },
  { url: "https://i4.photo.2gis.com/images/branch/0/30258560153896217_e6d0_1280x.jpg", caption: { kz: "Бірге сурет саламыз", ru: "Рисуем вместе", en: "Painting together" } },
];

/** Facts about the state symbols of Kazakhstan are public and verifiable. */
const SYMBOLS = {
  kz: {
    lead: "Қазақстан Республикасының мемлекеттік рәміздері — Мемлекеттік Ту, Мемлекеттік Елтаңба және Мемлекеттік Гимн.",
    body: `<h2>Мемлекеттік Ту</h2>
<p>Мемлекеттік Ту — ортасында шұғылалы күн, оның астында қалықтаған қыран бейнеленген тік бұрышты көгілдір түсті мата; сабының тұсында ұлттық өрнек тік жолақ түрінде өрнектелген. 1992 жылғы 4 маусымда қабылданған. Авторы — Шәкен Ниязбеков.</p>
<h2>Мемлекеттік Елтаңба</h2>
<p>Мемлекеттік Елтаңба дөңгелек пішінді, көгілдір түс аясындағы шаңырақ бейнесі; шаңырақтан күн сәулесіндей уықтар тарайды, оның оң және сол жағында аңыздағы қанатты пырақтар бейнеленген. 1992 жылғы 4 маусымда қабылданған. Авторлары — Жандарбек Мәлібеков және Шот-Аман Уәлиханов.</p>
<h2>Мемлекеттік Гимн</h2>
<p>«Менің Қазақстаным» әні 2006 жылғы 7 қаңтардан бастап Мемлекеттік Гимн болып табылады. Музыкасын жазған — Шәмші Қалдаяқов, сөзін жазғандар — Жұмекен Нәжімеденов және Нұрсұлтан Назарбаев.</p>
<p>Мемлекеттік рәміздердің мәртебесі мен пайдалану тәртібі «Қазақстан Республикасының мемлекеттік рәміздері туралы» Конституциялық заңмен белгіленген. 4 маусым — Мемлекеттік рәміздер күні.</p>`,
  },
  ru: {
    lead: "Государственные символы Республики Казахстан — Государственный Флаг, Государственный Герб и Государственный Гимн.",
    body: `<h2>Государственный Флаг</h2>
<p>Государственный Флаг представляет собой прямоугольное полотнище голубого цвета с изображением в центре солнца с лучами, под которым — парящий степной орёл. У древка расположена вертикальная полоса с национальным орнаментом. Принят 4 июня 1992 года. Автор — Шакен Ниязбеков.</p>
<h2>Государственный Герб</h2>
<p>Государственный Герб имеет форму круга и представляет собой изображение шанырака на голубом фоне, от которого во все стороны в виде солнечных лучей расходятся уыки. Справа и слева от шанырака расположены изображения мифических крылатых коней. Принят 4 июня 1992 года. Авторы — Жандарбек Малибеков и Шот-Аман Уалиханов.</p>
<h2>Государственный Гимн</h2>
<p>С 7 января 2006 года Государственным Гимном является песня «Менің Қазақстаным». Автор музыки — Шамши Калдаяков, авторы слов — Жумекен Нажимеденов и Нурсултан Назарбаев.</p>
<p>Статус и порядок использования государственных символов определены Конституционным законом «О государственных символах Республики Казахстан». 4 июня — День государственных символов.</p>`,
  },
  en: {
    lead: "The state symbols of the Republic of Kazakhstan are the State Flag, the State Emblem and the State Anthem.",
    body: `<h2>State Flag</h2>
<p>The State Flag is a rectangular sky-blue cloth with a radiant sun in the centre and a soaring steppe eagle beneath it. A vertical band of national ornament runs along the hoist. It was adopted on 4 June 1992. Designer: Shaken Niyazbekov.</p>
<h2>State Emblem</h2>
<p>The State Emblem is circular and shows a shanyrak (the crown of a yurt) on a sky-blue background, with uyks radiating from it like rays of the sun. Mythical winged horses are placed on both sides. It was adopted on 4 June 1992. Designers: Zhandarbek Malibekov and Shot-Aman Ualikhanov.</p>
<h2>State Anthem</h2>
<p>Since 7 January 2006 the State Anthem has been the song “Menin Qazaqstanym”. Music by Shamshi Kaldayakov; lyrics by Zhumeken Nazhimedenov and Nursultan Nazarbayev.</p>
<p>The status and use of the state symbols are governed by the Constitutional Law “On the State Symbols of the Republic of Kazakhstan”. 4 June is State Symbols Day.</p>`,
  },
};

export function seed(): void {
  const d = db();

  if (users.count() === 0) {
    const password = config.adminPassword || randomToken(9);
    users.create({ email: config.adminEmail, name: "Администратор", role: "admin", password_hash: hashPassword(password) });
    if (!config.isTest) {
      console.log("\n────────────────────────────────────────────");
      console.log(" Создан первый администратор:");
      console.log(`   логин:  ${config.adminEmail}`);
      console.log(`   пароль: ${config.adminPassword ? "(из ADMIN_PASSWORD)" : password}`);
      console.log(" Смените пароль после входа: /admin/profile");
      console.log("────────────────────────────────────────────\n");
    }
  }

  const hasPages = (d.prepare("SELECT COUNT(*) n FROM pages").get() as { n: number }).n > 0;
  if (hasPages) {
    // New sections added to structure.ts later still get a row.
    for (const { key } of cmsPageKeys()) pages.ensure(key);
    return;
  }

  tx(() => {
    for (const { key } of cmsPageKeys()) pages.ensure(key);
    pages.save("official/symbols", SYMBOLS, null);

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    news.save(
      { slug: "new-website", category: "news", image: null, event_date: null, published_at: now, status: "published", featured: 1, allow_comments: 0 },
      {
        kz: {
          title: "Мектептің жаңа сайты іске қосылды",
          excerpt: "Мектептің ресми сайты жаңартылды: үш тілде, ыңғайлы навигациямен және мобильді нұсқамен.",
          body: "<p>Мектептің жаңа ресми сайты іске қосылды. Сайт қазақ, орыс және ағылшын тілдерінде жұмыс істейді, смартфондарда ыңғайлы ашылады және нашар көретіндерге арналған нұсқасы бар.</p><p>Қазір сайт толтырылу кезеңінде. Бөлімдердегі ақпаратты мектеп әкімшілігі біртіндеп жариялайды.</p>",
        },
        ru: {
          title: "Запущен новый сайт школы",
          excerpt: "Официальный сайт школы обновлён: три языка, удобная навигация и мобильная версия.",
          body: "<p>Запущен новый официальный сайт школы. Сайт работает на казахском, русском и английском языках, удобно открывается на смартфонах и имеет версию для слабовидящих.</p><p>Сейчас сайт находится в стадии наполнения. Информацию в разделах администрация школы будет публиковать постепенно.</p>",
        },
        en: {
          title: "The school's new website is live",
          excerpt: "The official school website has been renewed: three languages, clear navigation and a mobile version.",
          body: "<p>The school's new official website is now live. It works in Kazakh, Russian and English, is easy to use on smartphones and includes a low-vision version.</p><p>The site is currently being filled with content. The school administration will publish information in each section step by step.</p>",
        },
      },
      null,
    );

    const album = gallery.saveAlbum({ title: { kz: "Мектеп өмірі", ru: "Школьная жизнь", en: "School life" }, sort: 0 });
    for (const p of SCHOOL_PHOTOS) gallery.addImage({ album_id: album, file: p.url, caption: p.caption, width: 1280, height: 960 });

    announcements.save({
      text: {
        kz: "Сайт толтырылу кезеңінде. Ақпарат біртіндеп жарияланады.",
        ru: "Сайт находится в стадии наполнения. Информация публикуется постепенно.",
        en: "The website is being filled with content. Information is published step by step.",
      },
      link: null,
      starts_on: null,
      ends_on: null,
      active: 1,
    });
  });
}
