import { raw, type SafeHtml } from "../lib/html.ts";

// Stroke icons on a 24×24 grid (drawn in the spirit of Lucide, inlined to avoid a dependency).
const P: Record<string, string> = {
  school: '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-5h6v5"/><path d="M12 5V2.5"/><path d="M12 2.5h3v2h-3"/><circle cx="12" cy="11" r="1.6"/>',
  graduation: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9Z"/><path d="M6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11"/><path d="M21.5 9v5.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.3c2.1.7 3.5 2.8 3.5 5.7"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 1.5Z"/><path d="M4 19.5A2 2 0 0 0 6 21h14v-3"/><path d="M9 7h7M9 10.5h5"/>',
  heart: '<path d="M12 20.5s-8-4.6-8-10.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8 2.5c0 6-8 10.6-8 10.6Z"/>',
  wallet: '<path d="M4 7.5V18a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-1.5Z"/><path d="M4 7.5A2 2 0 0 1 6 5.5h11V9"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.8 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.7 7.5-9.5V6L12 3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  newspaper: '<path d="M4 5h13v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z"/><path d="M17 9h3v10a2 2 0 0 1-2 2"/><path d="M7.5 8.5h6M7.5 12h6M7.5 15.5h4"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M3 12.5h18"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 16.5h4"/>',
  landmark: '<path d="M3 21h18"/><path d="M5 18h14"/><path d="M6 18v-7M10 18v-7M14 18v-7M18 18v-7"/><path d="M12 3 3.5 8h17L12 3Z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20.5 20.5-4.8-4.8"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  phone: '<path d="M5 4h3.5l1.8 4.4-2.2 1.4a11 11 0 0 0 6.1 6.1l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.7 20 4 13.3 3.5 5.6A1.5 1.5 0 0 1 5 4Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  mapPin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  glasses: '<circle cx="6.5" cy="14.5" r="3.5"/><circle cx="17.5" cy="14.5" r="3.5"/><path d="M10 14.5c1.3-1 2.7-1 4 0"/><path d="M3 14 5 6.5h2M21 14l-2-7.5h-2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5Z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="0.6" fill="currentColor"/>',
  facebook: '<path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.6 1.6-1.6h1.6V4.3a21 21 0 0 0-2.4-.1c-2.4 0-4 1.4-4 4.1v2.2H8.6v3h2.7V21"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9 5 3-5 3V9Z"/>',
  telegram: '<path d="M21 4.5 3.5 11.3c-.9.4-.9 1.3.1 1.6l4.4 1.4 1.7 5.3c.2.7.9.8 1.4.3l2.5-2.3 4.6 3.4c.8.6 1.5.3 1.7-.7L22.3 5.6c.3-1.1-.4-1.6-1.3-1.1Z"/><path d="m8 14.3 9-6.3"/>',
  download: '<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M4.5 20h15"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  rss: '<path d="M5 11a8 8 0 0 1 8 8"/><path d="M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.3" fill="currentColor"/>',
  message: '<path d="M4 5.5h16v11H9l-5 4v-15Z"/><path d="M8 9.5h8M8 12.5h5"/>',
  quote: '<path d="M9.5 7C6.5 8 5 10.2 5 13.5V17h4.5v-4.5H7c0-2 .8-3.2 2.5-3.8V7ZM18.5 7c-3 1-4.5 3.2-4.5 6.5V17h4.5v-4.5H16c0-2 .8-3.2 2.5-3.8V7Z"/>',
  sparkle: '<path d="M12 3.5 13.8 10 20.5 12l-6.7 2-1.8 6.5-1.8-6.5L3.5 12l6.7-2L12 3.5Z"/>',
  home: '<path d="m3.5 11 8.5-7 8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 16.5 5.5 12 10 7.5"/><path d="M5.5 12H15"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19H3.5v-5.5Z"/><path d="M3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4 3.4-7 7.5-7s7.5 3 7.5 7"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="0.6" fill="currentColor"/>',
  megaphone: '<path d="M3.5 10v4h3l9 5V5l-9 5h-3Z"/><path d="M19 9.5a3.5 3.5 0 0 1 0 5"/><path d="M7 14l1.5 6h2.5l-1-5.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8"/><path d="M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
  layers: '<path d="m12 3.5 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  type: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  contrast: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor"/>',
  union: '<circle cx="8.5" cy="12" r="5"/><circle cx="15.5" cy="12" r="5"/><path d="M12 8.6a5 5 0 0 1 0 6.8"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
};

export type IconName = keyof typeof P;

export function icon(name: string, cls = "icon", label?: string): SafeHtml {
  const body = P[name] ?? P.sparkle;
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}"` : 'aria-hidden="true" focusable="false"';
  return raw(
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`,
  );
}
