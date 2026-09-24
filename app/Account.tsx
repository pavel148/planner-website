"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- Full auth navigations discard cached private client state. */
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

export type AccountUser = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  mustChangePassword: boolean;
  gardenPrivate: boolean;
};
export type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  email_verified: number;
  garden_private: number;
};
export type AuthResult = {
  user?: AccountUser | null;
  users?: AdminUser[];
  error?: string;
  message?: string;
};
export async function readAuth(response: Response) {
  return (await response.json()) as AuthResult;
}
export async function authAction(data: Record<string, unknown>) {
  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await readAuth(response);
  if (!response.ok)
    throw new Error(result.error || "Не удалось выполнить действие.");
  return result;
}
export function AccountNav({ user }: { user: AccountUser | null }) {
  return (
    <nav className="account-nav" aria-label="Аккаунт">
      <Link href="/">✦ Сады</Link>
      {user ? (
        <>
          <Link href="/garden">Мой сад</Link>
          <Link href="/account">{user.username} · Настройки</Link>
          <button
            onClick={async () => {
              try {
                await authAction({ action: "logout" });
                window.location.href = "/";
              } catch {
                window.alert("Не удалось выйти. Повторите попытку.");
              }
            }}
          >
            Выйти
          </button>
        </>
      ) : (
        <Link href="/login">Войти / Регистрация</Link>
      )}
    </nav>
  );
}
export function Login() {
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkToken, setLinkToken] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Read the one-time browser URL fragment after hydration; it is unavailable on the server.
    if (params.get("token")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkToken(params.get("token")!);
      setMode(params.get("purpose") === "reset" ? "reset" : "verify");
      history.replaceState(null, "", "/login");
    }
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const result = await authAction({
        ...form,
        action: mode,
        token: linkToken,
      });
      if (mode === "login" && result.user) {
        window.location.href = result.user.mustChangePassword
          ? "/account"
          : "/garden";
        return;
      }
      setMessage(result.message || "Готово.");
      if (mode === "verify" || mode === "reset") {
        setLinkToken("");
        setMode("login");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка запроса.");
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<string, string> = {
    login: "Войти в свой сад",
    register: "Создать свой мир",
    forgot: "Восстановить доступ",
    resend: "Новое письмо",
    verify: "Подтвердить email",
    reset: "Новый пароль",
  };
  return (
    <main className="account-page">
      <AccountNav user={null} />
      <div className="auth-layout">
        <div className="auth-intro">
          <span className="eyebrow">MYTHOS · ЛИЧНЫЙ МИР</span>
          <h1>
            У каждого пути
            <br />
            есть свой сад.
          </h1>
          <p>
            Сохраняйте идеи, проекты и впечатления. Делитесь тем, чем хочется, а
            остальное оставляйте для себя.
          </p>
          <Link className="secondary-button" href="/">
            Посмотреть открытые сады →
          </Link>
        </div>
        <form className="panel account-form" onSubmit={submit}>
          <h2>{titles[mode]}</h2>
          {mode === "login" && (
            <label>
              Логин или email
              <input
                name="login"
                required
                autoComplete="username"
                maxLength={254}
              />
            </label>
          )}
          {mode === "register" && (
            <label>
              Логин
              <input
                name="username"
                required
                pattern="[a-zA-Z0-9_-]{3,32}"
                maxLength={32}
                autoComplete="username"
              />
              <small>Латинские буквы, цифры, дефис и подчёркивание.</small>
            </label>
          )}
          {["register", "forgot", "resend"].includes(mode) && (
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                maxLength={254}
              />
            </label>
          )}
          {["login", "register", "reset"].includes(mode) && (
            <label>
              Пароль
              <input
                name="password"
                type="password"
                required
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
              {mode !== "login" && <small>Не менее 12 символов.</small>}
            </label>
          )}
          {mode === "register" && (
            <p>
              Новый сад будет приватным. После подтверждения email вы сможете
              открыть его для других.
            </p>
          )}
          {mode === "login" && (
            <details>
              <summary>Первый вход суперадминистратора</summary>
              <p>
                Для первоначального входа admin / admin введите установочный
                ключ владельца сайта.
              </p>
              <label>
                Установочный ключ
                <input name="setupKey" type="password" autoComplete="off" />
              </label>
            </details>
          )}
          {mode === "verify" && (
            <p>
              Нажмите кнопку, чтобы подтвердить адрес email. Ссылка используется
              один раз.
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="form-success">
              {message}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy
              ? "Подождите…"
              : mode === "login"
                ? "Войти"
                : mode === "register"
                  ? "Зарегистрироваться"
                  : mode === "verify"
                    ? "Подтвердить email"
                    : mode === "reset"
                      ? "Сохранить пароль"
                      : "Отправить письмо"}
          </button>
          <div className="auth-links">
            {[
              ["login", "Вход"],
              ["register", "Регистрация"],
              ["forgot", "Забыли пароль?"],
              ["resend", "Повторить письмо"],
            ]
              .filter(([key]) => key !== mode)
              .map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMode(key);
                    setError("");
                    setMessage("");
                  }}
                >
                  {label}
                </button>
              ))}
          </div>
        </form>
      </div>
    </main>
  );
}
export function AccountSettings() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [users, setUsers] = useState<
    Array<{
      id: string;
      username: string;
      email: string;
      role: string;
      email_verified: number;
      garden_private: number;
    }>
  >([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then(readAuth)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        if (!data.user) window.location.href = "/login";
        else setUser(data.user);
      })
      .catch(() => setError("Не удалось загрузить аккаунт."));
  }, []);
  async function run(data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await authAction(data);
      if (result.user) setUser(result.user);
      if (result.users) setUsers(result.users);
      setMessage(result.message || "Изменения сохранены.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-page">
      <AccountNav user={user} />
      <div className="settings-content">
        <span className="eyebrow">АККАУНТ</span>
        <h1>Настройки сада</h1>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="form-success">
            {message}
          </p>
        )}
        {user && (
          <>
            <p>
              {user.username} ·{" "}
              {user.role === "superadmin" ? "Суперадминистратор" : user.email}
            </p>
            {user.mustChangePassword && (
              <p className="form-error">
                Сначала замените временный пароль. До этого сад и управление
                недоступны.
              </p>
            )}
            <form
              className="panel account-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = Object.fromEntries(new FormData(form));
                if (await run({ ...data, action: "password" })) form.reset();
              }}
            >
              <h2>Сменить пароль</h2>
              <label>
                Текущий пароль
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </label>
              <label>
                Новый пароль
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <small>
                Не менее 12 символов. Другие сессии будут завершены.
              </small>
              <button className="primary-button" disabled={busy}>
                Сохранить пароль
              </button>
            </form>
            {!user.mustChangePassword && (
              <section className="panel account-form">
                <h2>Кто видит мой сад</h2>
                <p>
                  Приватный сад доступен вам и суперадминистратору. В публичном
                  саду видны только открытые карточки; привычки остаются
                  личными.
                </p>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await run({
                        action: "privacy",
                        gardenPrivate: !user.gardenPrivate,
                      })
                    )
                      setUser({ ...user, gardenPrivate: !user.gardenPrivate });
                  }}
                >
                  {user.gardenPrivate
                    ? "🔒 Приватный — сделать публичным"
                    : "🔓 Публичный — сделать приватным"}
                </button>
                <Link href="/garden">Перейти в мой сад →</Link>
              </section>
            )}
            {user.role === "superadmin" && !user.mustChangePassword && (
              <section className="panel account-form">
                <h2>Пользователи</h2>
                <p>
                  Можно открывать все сады и устанавливать временные пароли.
                  Сохранённые пароли недоступны для просмотра.
                </p>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => run({ action: "admin_users" })}
                >
                  Загрузить пользователей
                </button>
                {users.map((entry) => (
                  <div className="admin-user" key={entry.id}>
                    <Link href={`/garden?id=${encodeURIComponent(entry.id)}`}>
                      {entry.username} · {entry.garden_private ? "🔒" : "🔓"}
                    </Link>
                    <small>
                      {entry.email || "Нет email"} ·{" "}
                      {entry.email_verified
                        ? "Подтверждён"
                        : "Ожидает подтверждения"}
                    </small>
                  </div>
                ))}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    if (
                      await run({
                        ...Object.fromEntries(new FormData(form)),
                        action: "admin_reset",
                      })
                    )
                      form.reset();
                  }}
                >
                  <label>
                    Пользователь
                    <select name="userId" required defaultValue="">
                      <option value="" disabled>
                        Выберите пользователя
                      </option>
                      {users
                        .filter((entry) => entry.id !== user.id)
                        .map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.username}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Ваш пароль администратора
                    <input
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <label>
                    Новый временный пароль
                    <input
                      name="password"
                      type="password"
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <button className="secondary-button" disabled={busy}>
                    Сбросить пароль пользователя
                  </button>
                </form>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
