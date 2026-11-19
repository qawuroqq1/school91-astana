import { HttpError, readBody, redirect, send, setCookie, type Ctx } from "../lib/http.ts";
import { requireUser, csrfToken, verifyCsrf } from "../lib/auth.ts";
import type { SafeHtml } from "../lib/html.ts";
import { blog, comments, messages, type User } from "../db/repo.ts";
import { adminLayout, type AdminCtx } from "../views/admin/ui.ts";

/** Builds the admin rendering context for an authenticated request. */
export function adminCtx(ctx: Ctx, role?: "admin"): AdminCtx {
  const user = requireUser(ctx, role);
  let flash: AdminCtx["flash"] = null;
  const raw = ctx.cookies.s91_flash;
  if (raw) {
    const [kind, ...rest] = raw.split("|");
    flash = { kind: kind === "error" ? "error" : "success", text: rest.join("|") };
    setCookie(ctx, "s91_flash", "", { maxAge: 0, path: "/admin" });
  }
  return {
    user,
    csrf: csrfToken(ctx),
    path: ctx.path,
    flash,
    badges: { messages: messages.unread(), blog: blog.pending(), comments: comments.pending() },
  };
}

export function flashRedirect(ctx: Ctx, to: string, text: string, kind: "success" | "error" = "success"): void {
  setCookie(ctx, "s91_flash", `${kind}|${text}`, { maxAge: 60, path: "/admin" });
  redirect(ctx, to);
}

export function render(ctx: Ctx, a: AdminCtx, title: string, body: SafeHtml, actions?: SafeHtml, status = 200): void {
  send(ctx, status, adminLayout(a, title, body, actions));
}

/** Authenticated + CSRF-checked POST. Returns user and parsed fields. */
export async function post(ctx: Ctx, role?: "admin"): Promise<{ user: User; f: Record<string, string>; body: Awaited<ReturnType<typeof readBody>> }> {
  const user = requireUser(ctx, role);
  await verifyCsrf(ctx);
  const body = await readBody(ctx);
  return { user, f: body.fields, body };
}

export function idParam(p: Record<string, string>): number {
  const id = Number(p.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404);
  return id;
}

export function int(v: string | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
