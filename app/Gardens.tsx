"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- Full auth navigations discard cached private client state. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountNav, readAuth, type AccountUser } from "./Account";
import { PlannerApp } from "./PlannerApp";
export function Gardens() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [gardens, setGardens] = useState<
    Array<{ id: string; username: string; isPrivate: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/api/auth", { cache: "no-store" }).then(readAuth),
      fetch("/api/gardens", { cache: "no-store" }).then(
        async (r) =>
          (await r.json()) as {
            gardens: Array<{ id: string; username: string; isPrivate: number }>;
            error?: string;
          },
      ),
    ])
      .then(([auth, list]) => {
        setUser(auth.user || null);
        if (auth.user?.mustChangePassword) {
          window.location.href = "/account";
          return;
        }
        if (list.error) throw new Error(list.error);
        setGardens(list.gardens);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <main className="account-page">
      <AccountNav user={user} />
      <section className="gardens-hero">
        <span className="eyebrow">MYTHOS · САДЫ ИДЕЙ</span>
        <h1>
          Миры, которыми
          <br />
          хочется поделиться.
        </h1>
        <p>
          Загляните в открытые сады: проекты, книги, фильмы и маленькие шаги к
          большим целям.
        </p>
        <Link className="primary-button" href={user ? "/garden" : "/login"}>
          {user ? "Открыть мой сад" : "Создать свой сад"} ↗
        </Link>
      </section>
      <section className="gardens-section">
        <h2>
          {user?.role === "superadmin"
            ? "Все сады · доступ администратора"
            : "Открытые сады"}
        </h2>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Открываем карту…</p>
        ) : !gardens.length && !error ? (
          <div className="panel empty-garden">
            <span>♧</span>
            <h3>Здесь появятся первые сады</h3>
            <p>
              Создайте свой мир и откройте его для других, когда будете готовы.
            </p>
          </div>
        ) : (
          <div className="gardens-grid">
            {gardens.map((garden) => (
              <Link
                className="panel garden-card"
                href={`/garden?id=${encodeURIComponent(garden.id)}`}
                key={garden.id}
              >
                <span className="garden-symbol">♧</span>
                <span className="eyebrow">
                  {garden.isPrivate ? "🔒 ПРИВАТНЫЙ" : "🔓 ПУБЛИЧНЫЙ"}
                </span>
                <h3>Сад {garden.username}</h3>
                <span>Заглянуть в мир →</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
export function GardenPage() {
  const [garden, setGarden] = useState<string | undefined>();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const id =
      new URLSearchParams(window.location.search).get("id") || undefined;
    fetch("/api/auth", { cache: "no-store" })
      .then(readAuth)
      .then((data) => {
        if (data.error) throw new Error(data.error);
        if (data.user?.mustChangePassword) {
          window.location.href = "/account";
          return;
        }
        if (!id && !data.user) {
          window.location.href = "/login";
          return;
        }
        setGarden(id);
        setUser(data.user || null);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  if (!ready)
    return (
      <main className="loading-screen">
        <p role={error ? "alert" : "status"}>{error || "Открываем сад…"}</p>
        <Link href="/">Все сады</Link>
      </main>
    );
  return (
    <>
      <AccountNav user={user} />
      <PlannerApp gardenId={garden} />
    </>
  );
}
