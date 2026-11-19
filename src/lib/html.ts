// Minimal, safe HTML templating: every interpolated value is escaped
// unless it was produced by `html` itself or wrapped in `raw()`.

export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: unknown): string {
  return String(input ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

type Interp = SafeHtml | string | number | boolean | null | undefined | Interp[];

function render(value: Interp): string {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === true) return "";
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: Interp[]): SafeHtml {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return new SafeHtml(out);
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

export function attr(name: string, value: unknown): SafeHtml {
  if (value === null || value === undefined || value === false) return raw("");
  if (value === true) return raw(` ${name}`);
  return raw(` ${name}="${escapeHtml(value)}"`);
}

/**
 * Sanitizes editor-provided rich text. Admin users are trusted, but a stolen
 * session must not be able to plant scripts on the public site.
 */
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "h4", "ul", "ol", "li",
  "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "img", "figure",
  "figcaption", "hr", "span", "div", "sup", "sub",
]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

function safeUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return !(u.startsWith("javascript:") || u.startsWith("vbscript:") || (u.startsWith("data:") && !u.startsWith("data:image/")));
}

export function sanitizeRichText(input: string): string {
  let s = String(input ?? "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|iframe|object|embed|form|noscript|template)[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<(script|style|iframe|object|embed|form|input|button|link|meta|base)\b[^>]*>/gi, "");
  return s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (full.startsWith("</")) return `</${tag}>`;
    const allowed = ALLOWED_ATTRS[tag];
    const kept: string[] = [];
    if (allowed) {
      const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(attrs))) {
        const name = m[1].toLowerCase();
        const val = m[3] ?? m[4] ?? m[5] ?? "";
        if (!allowed.has(name)) continue;
        if ((name === "href" || name === "src") && !safeUrl(val)) continue;
        kept.push(`${name}="${escapeHtml(val)}"`);
      }
      if (tag === "a" && kept.some((k) => k.startsWith('target="_blank"'))) kept.push('rel="noopener noreferrer"');
      if (tag === "img" && !kept.some((k) => k.startsWith("loading="))) kept.push('loading="lazy"');
    }
    const selfClose = tag === "br" || tag === "hr" || tag === "img";
    return `<${tag}${kept.length ? " " + kept.join(" ") : ""}${selfClose ? "" : ""}>`;
  });
}

export function stripTags(input: string): string {
  return String(input ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}
