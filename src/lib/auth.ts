import { config } from "../config.ts";
import { sessions, users, type User } from "../db/repo.ts";
import { HttpError, readBody, setCookie, type Ctx } from "./http.ts";
import { randomToken, safeEqual, sha256 } from "./security.ts";

const COOKIE = "s91_session";

export function startSession(ctx: Ctx, user: User): void {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const maxAge = config.sessionDays * 86400;
  sessions.create(sha256(token), user.id, csrf, Date.now() + maxAge * 1000);
  users.touchLogin(user.id);
  setCookie(ctx, COOKIE, token, { maxAge, httpOnly: true, sameSite: "Lax" });
}

export function endSession(ctx: Ctx): void {
  const token = ctx.cookies[COOKIE];
  if (token) sessions.remove(sha256(token));
  setCookie(ctx, COOKIE, "", { maxAge: 0 });
}

/** Loads the signed-in user (if any) into ctx.state. */
export function loadUser(ctx: Ctx): User | null {
  if (ctx.state.userLoaded) return (ctx.state.user as User) ?? null;
  ctx.state.userLoaded = true;
  const token = ctx.cookies[COOKIE];
  if (!token) return null;
  const s = sessions.find(sha256(token));
  if (!s) return null;
  const user = users.byId(s.user_id);
  if (!user || !user.active) return null;
  ctx.state.user = user;
  ctx.state.csrf = s.csrf;
  return user;
}

export function requireUser(ctx: Ctx, role?: "admin"): User {
  const user = loadUser(ctx);
  if (!user) throw new HttpError(401);
  if (role === "admin" && user.role !== "admin") throw new HttpError(403);
  return user;
}

export function csrfToken(ctx: Ctx): string {
  return String(ctx.state.csrf || "");
}

export async function verifyCsrf(ctx: Ctx): Promise<void> {
  const body = await readBody(ctx);
  const sent = body.fields._csrf || String(ctx.req.headers["x-csrf-token"] || "");
  const expected = csrfToken(ctx);
  if (!expected || !sent || !safeEqual(sent, expected)) throw new HttpError(403, "CSRF");
}

/* Public forms (no session): stateless HMAC-free token = random value echoed in a cookie. */
const FORM_COOKIE = "s91_form";

export function publicFormToken(ctx: Ctx): string {
  let token = ctx.cookies[FORM_COOKIE] || (ctx.state.formToken as string | undefined);
  if (!token) {
    token = randomToken(18);
    ctx.state.formToken = token;
    setCookie(ctx, FORM_COOKIE, token, { maxAge: 86400 * 30, httpOnly: true, sameSite: "Lax" });
  }
  return token;
}

export async function verifyPublicForm(ctx: Ctx): Promise<boolean> {
  const body = await readBody(ctx);
  const cookie = ctx.cookies[FORM_COOKIE];
  return !!cookie && !!body.fields._token && safeEqual(cookie, body.fields._token);
}
