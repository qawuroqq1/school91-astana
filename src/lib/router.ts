import type { Ctx } from "./http.ts";

export type Params = Record<string, string>;
export type Handler = (ctx: Ctx, params: Params) => void | Promise<void>;

interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  /** Pattern syntax: "/:lang/news/:slug" — params match one path segment. */
  on(method: string | string[], pattern: string, handler: Handler): this {
    const keys: string[] = [];
    const re = new RegExp(
      "^" +
        pattern.replace(/\/:([a-zA-Z_]+)(\*)?/g, (_m, key: string, star: string) => {
          keys.push(key);
          return star ? "/(.+)" : "/([^/]+)";
        }) +
        "/?$",
    );
    for (const m of Array.isArray(method) ? method : [method]) this.routes.push({ method: m, re, keys, handler });
    return this;
  }

  get(pattern: string, h: Handler): this {
    return this.on(["GET", "HEAD"], pattern, h);
  }
  post(pattern: string, h: Handler): this {
    return this.on("POST", pattern, h);
  }

  match(method: string, path: string): { handler: Handler; params: Params } | null {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      const params: Params = {};
      r.keys.forEach((k, i) => {
        try {
          params[k] = decodeURIComponent(m[i + 1]);
        } catch {
          params[k] = m[i + 1];
        }
      });
      return { handler: r.handler, params };
    }
    return null;
  }

  /** True if the path exists for some other method (→ 405 instead of 404). */
  hasPath(path: string): boolean {
    return this.routes.some((r) => r.re.test(path));
  }
}
