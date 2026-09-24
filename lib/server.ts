import { env } from "cloudflare:workers";
import { getRuntimeDb } from "../db/runtime";
import { digest } from "./passwords";

export type User = {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: "user" | "superadmin";
  email_verified: number;
  must_change_password: number;
  garden_private: number;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", Vary: "Cookie", ...headers },
  });
}
export function fail(error: unknown) {
  if (error instanceof ApiError)
    return json({ error: error.message }, error.status);
  console.error(
    "Request failed",
    error instanceof Error ? error.message : "unknown",
  );
  return json({ error: "Не удалось выполнить запрос. Попробуйте позже." }, 500);
}
export function settings() {
  return env as typeof env & {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    APP_URL?: string;
    ADMIN_SETUP_KEY?: string;
  };
}
export function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    mustChangePassword: !!user.must_change_password,
    gardenPrivate: !!user.garden_private,
  };
}
export function cookieToken(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("mythos_session="))
      ?.slice(15) || ""
  );
}
export function sessionCookie(
  request: Request,
  value: string,
  maxAge = 604800,
) {
  return `mythos_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function viewer(request: Request) {
  const raw = cookieToken(request);
  if (!raw) return null;
  return getRuntimeDb()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
 WHERE s.token_hash=? AND s.expires_at>? AND u.email_verified=1`,
    )
    .bind(digest(raw), Date.now())
    .first<User>();
}
export async function requireUser(
  request: Request,
  allowPasswordChange = false,
) {
  const user = await viewer(request);
  if (!user) throw new ApiError("Войдите в аккаунт.", 401);
  if (user.must_change_password && !allowPasswordChange)
    throw new ApiError("Сначала смените временный пароль.", 403);
  return user;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    throw new ApiError("Запрос с другого сайта запрещён.", 403);
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError("Ожидается JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Пустой запрос.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) {
      await reader.cancel();
      throw new ApiError("Слишком большой запрос.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    const result = JSON.parse(text);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw 0;
    return result as Record<string, unknown>;
  } catch {
    throw new ApiError("Неверный формат запроса.");
  }
}
export function text(value: unknown, limit = 120) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
export function password(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    throw new ApiError("Пароль должен содержать от 12 до 128 символов.");
  return value;
}
export async function limit(
  request: Request,
  scope: string,
  max = 10,
  duration = 900000,
) {
  const db = getRuntimeDb();
  const key = digest(
    `${scope}:${request.headers.get("cf-connecting-ip") || "local"}`,
  );
  const now = Date.now();
  await db
    .prepare("DELETE FROM auth_limits WHERE expires_at < ?")
    .bind(now)
    .run();
  const row = await db
    .prepare(
      `INSERT INTO auth_limits (key,count,expires_at) VALUES (?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
    )
    .bind(key, now + duration)
    .first<{ count: number }>();
  if (!row || row.count > max)
    throw new ApiError("Слишком много попыток. Попробуйте позже.", 429);
}
