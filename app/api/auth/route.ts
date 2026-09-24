import { getRuntimeDb } from "../../../db/runtime";
import {
  hashPassword,
  verifyPassword,
  digest,
  token,
  sameSecret,
  DUMMY_PASSWORD_HASH,
} from "../../../lib/passwords";
import {
  ApiError,
  body,
  checkOrigin,
  cookieToken,
  fail,
  json,
  limit,
  password,
  publicUser,
  requireUser,
  sessionCookie,
  settings,
  text,
  viewer,
  type User,
} from "../../../lib/server";

export const dynamic = "force-dynamic";
async function issueSession(request: Request, user: User) {
  const raw = token();
  await getRuntimeDb()
    .prepare("INSERT INTO sessions VALUES (?,?,?)")
    .bind(digest(raw), user.id, Date.now() + 604800000)
    .run();
  return json({ user: publicUser(user) }, 200, {
    "Set-Cookie": sessionCookie(request, raw),
  });
}
function emailConfig() {
  const config = settings();
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM || !config.APP_URL)
    throw new ApiError(
      "Подтверждение email пока недоступно: администратору нужно подключить отправку писем.",
      503,
    );
  return config;
}
async function sendToken(user: User, purpose: "verify" | "reset") {
  const config = emailConfig();
  const db = getRuntimeDb();
  const raw = token();
  await db.batch([
    db
      .prepare("DELETE FROM email_tokens WHERE user_id=? AND purpose=?")
      .bind(user.id, purpose),
    db
      .prepare("INSERT INTO email_tokens VALUES (?,?,?,?)")
      .bind(digest(raw), user.id, purpose, Date.now() + 3600000),
  ]);
  const link = new URL("/login", config.APP_URL);
  link.hash = new URLSearchParams({ token: raw, purpose }).toString();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.EMAIL_FROM,
      to: [user.email],
      subject:
        purpose === "verify"
          ? "Подтвердите email — MYTHOS"
          : "Сброс пароля — MYTHOS",
      text: `${purpose === "verify" ? "Подтвердите email" : "Установите новый пароль"}: ${link.href}\nСсылка действует 1 час. Если это были не вы, проигнорируйте письмо.`,
    }),
  });
  if (!response.ok) {
    await db
      .prepare("DELETE FROM email_tokens WHERE token_hash=?")
      .bind(digest(raw))
      .run();
    throw new ApiError(
      "Не удалось отправить письмо. Попробуйте повторную отправку позже.",
      503,
    );
  }
}
export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    return json({ user: user ? publicUser(user) : null });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const data = await body(request);
    const db = getRuntimeDb();
    const action = text(data.action);
    if (action === "logout") {
      await db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(digest(cookieToken(request)))
        .run();
      return json({ ok: true }, 200, {
        "Set-Cookie": sessionCookie(request, "", 0),
      });
    }
    if (action === "login") {
      await limit(request, "login");
      const login = text(data.login, 254).toLowerCase();
      const pass = typeof data.password === "string" ? data.password : "";
      if (pass.length > 128)
        throw new ApiError("Неверный логин или пароль.", 401);
      let user = await db
        .prepare("SELECT * FROM users WHERE username=? OR email=?")
        .bind(login, login)
        .first<User>();
      if (user?.id === "legacy-admin" && user.must_change_password) {
        const key = settings().ADMIN_SETUP_KEY;
        if (!key || !sameSecret(text(data.setupKey, 256), key))
          throw new ApiError(
            "До смены начального пароля требуется установочный ключ.",
            401,
          );
      }
      if (user?.password_hash === "!setup") {
        const key = settings().ADMIN_SETUP_KEY;
        if (
          !key ||
          !sameSecret(text(data.setupKey, 256), key) ||
          pass !== "admin"
        )
          throw new ApiError(
            "Первый вход администратора требует логин admin, пароль admin и установочный ключ.",
            401,
          );
        const hash = await hashPassword(pass);
        const result = await db
          .prepare(
            "UPDATE users SET password_hash=? WHERE id=? AND password_hash='!setup'",
          )
          .bind(hash, user.id)
          .run();
        if (!result.meta.changes)
          throw new ApiError("Аккаунт уже настроен. Повторите вход.", 409);
        user = { ...user, password_hash: hash };
      }
      const valid = await verifyPassword(
        pass,
        user?.password_hash || DUMMY_PASSWORD_HASH,
      );
      if (!user || !valid)
        throw new ApiError("Неверный логин или пароль.", 401);
      if (!user.email_verified)
        throw new ApiError(
          "Сначала подтвердите email. При необходимости запросите новое письмо.",
          403,
        );
      return issueSession(request, user);
    }
    if (action === "register") {
      await limit(request, "register", 5, 3600000);
      emailConfig();
      const username = text(data.username, 40).toLowerCase();
      const email = text(data.email, 254).toLowerCase();
      if (!/^[a-z0-9_-]{3,32}$/.test(username) || username === "admin")
        throw new ApiError(
          "Логин: 3–32 латинские буквы, цифры, дефис или подчёркивание.",
        );
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new ApiError("Введите корректный email.");
      const hash = await hashPassword(password(data.password));
      const id = crypto.randomUUID();
      const result = await db
        .prepare(
          "INSERT OR IGNORE INTO users (id,username,email,password_hash) VALUES (?,?,?,?)",
        )
        .bind(id, username, email, hash)
        .run();
      if (!result.meta.changes)
        throw new ApiError(
          "Логин или email уже используется. Войдите или восстановите доступ.",
          409,
        );
      const user = await db
        .prepare("SELECT * FROM users WHERE id=?")
        .bind(id)
        .first<User>();
      await sendToken(user!, "verify");
      return json(
        { message: "Письмо отправлено. Подтвердите email, затем войдите." },
        201,
      );
    }
    if (action === "resend" || action === "forgot") {
      await limit(request, "email", 5, 3600000);
      emailConfig();
      const email = text(data.email, 254).toLowerCase();
      const user = await db
        .prepare("SELECT * FROM users WHERE email=?")
        .bind(email)
        .first<User>();
      if (
        user &&
        ((action === "resend" && !user.email_verified) ||
          (action === "forgot" && user.email_verified))
      )
        await sendToken(user, action === "resend" ? "verify" : "reset");
      return json({
        message:
          "Если аккаунт подходит для этого действия, письмо отправлено. Проверьте также папку «Спам».",
      });
    }
    if (action === "verify" || action === "reset") {
      await limit(request, "token", 20);
      const hash = digest(text(data.token, 128));
      const purpose = action;
      const record = await db
        .prepare(
          "SELECT user_id FROM email_tokens WHERE token_hash=? AND purpose=? AND expires_at>?",
        )
        .bind(hash, purpose, Date.now())
        .first<{ user_id: string }>();
      if (!record)
        throw new ApiError(
          "Ссылка недействительна или истекла. Запросите новое письмо.",
        );
      const newHash =
        action === "reset" ? await hashPassword(password(data.password)) : null;
      // Atomic batch: update guarded by live token, then consume it. Replays cannot change credentials.
      const changed = await db.batch([
        action === "verify"
          ? db
              .prepare(
                "UPDATE users SET email_verified=1 WHERE id=? AND EXISTS(SELECT 1 FROM email_tokens WHERE token_hash=? AND expires_at>?)",
              )
              .bind(record.user_id, hash, Date.now())
          : db
              .prepare(
                "UPDATE users SET password_hash=?,must_change_password=0 WHERE id=? AND EXISTS(SELECT 1 FROM email_tokens WHERE token_hash=? AND expires_at>?)",
              )
              .bind(newHash, record.user_id, hash, Date.now()),
        db.prepare("DELETE FROM email_tokens WHERE token_hash=?").bind(hash),
        db.prepare("DELETE FROM sessions WHERE user_id=?").bind(record.user_id),
      ]);
      if (!changed[0].meta.changes)
        throw new ApiError("Ссылка уже использована.");
      return json({
        message:
          action === "verify"
            ? "Email подтверждён. Теперь можно войти."
            : "Пароль изменён. Войдите с новым паролем.",
      });
    }
    const user = await requireUser(request, action === "password");
    if (action === "password") {
      await limit(request, `password:${user.id}`);
      if (
        !(await verifyPassword(
          typeof data.currentPassword === "string"
            ? data.currentPassword.slice(0, 128)
            : "",
          user.password_hash,
        ))
      )
        throw new ApiError("Текущий пароль неверен.", 403);
      const next = password(data.password);
      if (await verifyPassword(next, user.password_hash))
        throw new ApiError("Новый пароль должен отличаться от текущего.");
      await db.batch([
        db
          .prepare(
            "UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?",
          )
          .bind(await hashPassword(next), user.id),
        db.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
        db
          .prepare(
            "DELETE FROM email_tokens WHERE user_id=? AND purpose='reset'",
          )
          .bind(user.id),
      ]);
      return issueSession(request, { ...user, must_change_password: 0 });
    }
    if (action === "privacy") {
      if (typeof data.gardenPrivate !== "boolean")
        throw new ApiError("Укажите видимость сада.");
      await db
        .prepare("UPDATE users SET garden_private=? WHERE id=?")
        .bind(Number(data.gardenPrivate), user.id)
        .run();
      return json({ ok: true });
    }
    if (user.role !== "superadmin") throw new ApiError("Нет доступа.", 403);
    if (action === "admin_users") {
      const result = await db
        .prepare(
          "SELECT id,username,email,role,email_verified,garden_private,must_change_password FROM users ORDER BY created_at LIMIT 500",
        )
        .all();
      return json({ users: result.results });
    }
    if (action === "admin_reset") {
      await limit(request, `admin:${user.id}`);
      if (
        !(await verifyPassword(
          typeof data.currentPassword === "string"
            ? data.currentPassword.slice(0, 128)
            : "",
          user.password_hash,
        ))
      )
        throw new ApiError("Подтвердите свой пароль администратора.", 403);
      const target = text(data.userId, 80);
      if (target === user.id)
        throw new ApiError("Для своего аккаунта используйте смену пароля.");
      const targetUser = await db
        .prepare("SELECT id FROM users WHERE id=?")
        .bind(target)
        .first();
      if (!targetUser) throw new ApiError("Пользователь не найден.", 404);
      await db.batch([
        db
          .prepare(
            "UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?",
          )
          .bind(await hashPassword(password(data.password)), target),
        db.prepare("DELETE FROM sessions WHERE user_id=?").bind(target),
        db
          .prepare(
            "DELETE FROM email_tokens WHERE user_id=? AND purpose='reset'",
          )
          .bind(target),
      ]);
      return json({
        message:
          "Временный пароль установлен. Сессии пользователя завершены; при входе потребуется смена пароля.",
      });
    }
    throw new ApiError("Неизвестное действие.");
  } catch (error) {
    return fail(error);
  }
}
