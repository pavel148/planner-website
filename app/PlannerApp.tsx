"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
  createContext,
  useContext,
  useCallback,
} from "react";

type ItemType = "goal" | "project" | "step" | "book" | "film";

type PlannerItem = {
  id: string;
  type: ItemType;
  parentId: string | null;
  title: string;
  description: string;
  status: "active" | "completed";
  imageKey: string | null;
  meta: Record<string, string | number>;
  createdAt: string;
  completedAt: string | null;
  isPrivate: boolean;
};

type Habit = {
  id: string;
  title: string;
  icon: string;
  color: string;
};

type HabitEntry = { habitId: string; day: string };
type PlannerState = {
  items: PlannerItem[];
  habits: Habit[];
  entries: HabitEntry[];
  editable: boolean;
  garden: { id: string; username: string; isPrivate: boolean };
};
type TabId = "home" | "quests" | "codex" | "projects" | "habits" | "stats";

const NAV: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "home", label: "Обзор", icon: "⌂" },
  { id: "quests", label: "Квесты", icon: "◇" },
  { id: "codex", label: "Кодекс", icon: "▤" },
  { id: "projects", label: "Проекты", icon: "⚒" },
  { id: "habits", label: "Привычки", icon: "✦" },
  { id: "stats", label: "Статистика", icon: "⌁" },
];

const TYPE_LABELS: Record<ItemType, string> = {
  goal: "Цель",
  project: "Проект",
  step: "Шаг",
  book: "Книга",
  film: "Фильм",
};

function lastDays(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}

function shortDay(day: string) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short" })
    .format(new Date(`${day}T12:00:00`))
    .replace(".", "");
}

function monthDay(day: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(new Date(`${day}T12:00:00`))
    .replace(".", "");
}

function completion(item: PlannerItem, items: PlannerItem[]) {
  const steps = items.filter((entry) => entry.parentId === item.id);
  if (!steps.length) return item.status === "completed" ? 100 : 0;
  return Math.round(
    (steps.filter((entry) => entry.status === "completed").length /
      steps.length) *
      100,
  );
}

function EditModal({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: PlannerItem;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [status, setStatus] = useState(item.status);
  const [meta, setMeta] = useState(item.meta);
  const [imageKey, setImageKey] = useState(item.imageKey);
  const media = item.type === "film" || item.type === "book";
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [busy, onClose]);
  return (
    <div className="modal-backdrop">
      <form
        className="create-modal edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ title, description, status, meta, imageKey });
        }}
      >
        <button
          type="button"
          className="close-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
        <span className="eyebrow">{TYPE_LABELS[item.type]}</span>
        <DialogKeyboard onClose={onClose} busy={busy} />
        <h2 id="edit-title">Редактировать карточку</h2>
        <ModalError />
        <label>
          Название
          <input
            autoFocus
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Описание
          <textarea
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Статус
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PlannerItem["status"])}
          >
            <option value="active">В процессе</option>
            <option value="completed">Завершено</option>
          </select>
        </label>
        {(media
          ? [
              ["author", item.type === "book" ? "Автор" : "Режиссёр"],
              ["year", "Год"],
              ["plus", "Понравилось"],
              ["minus", "Не понравилось"],
            ]
          : [
              ["category", "Категория"],
              ["difficulty", "Сложность"],
            ]
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              maxLength={500}
              value={String(meta[key] || "")}
              onChange={(e) => setMeta({ ...meta, [key]: e.target.value })}
            />
          </label>
        ))}
        {media && (
          <label>
            Оценка
            <select
              value={Number(meta.rating ?? 0)}
              onChange={(e) =>
                setMeta({ ...meta, rating: Number(e.target.value) })
              }
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n ? `${n} из 5` : "Без оценки"}
                </option>
              ))}
            </select>
          </label>
        )}
        {imageKey && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setImageKey(null)}
          >
            Убрать обложку
          </button>
        )}
        <button
          className="primary-button full"
          disabled={busy || !title.trim()}
        >
          {busy ? "Сохраняем…" : "Сохранить изменения"}
        </button>
      </form>
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function Coin({ kind, value }: { kind: "silver" | "gold"; value: number }) {
  return (
    <div
      className="coin-counter"
      title={kind === "silver" ? "Созданные цели" : "Выполненные цели"}
    >
      <span className={`coin ${kind}`}>{kind === "silver" ? "S" : "G"}</span>
      <span>{value}</span>
    </div>
  );
}

function Progress({ value, label = true }: { value: number; label?: boolean }) {
  return (
    <div className="progress-wrap">
      <div className="progress-track" aria-label={`Прогресс ${value}%`}>
        <span style={{ width: `${Math.max(2, value)}%` }} />
      </div>
      {label && <b>{value}%</b>}
    </div>
  );
}

function Cover({
  item,
  compact = false,
}: {
  item: PlannerItem;
  compact?: boolean;
}) {
  const cover = String(item.meta.cover || item.type);
  const glyph =
    item.type === "book"
      ? cover === "atomic"
        ? "A"
        : "W"
      : cover === "dune"
        ? "Ⅱ"
        : "日";
  return (
    <div className={`cover cover-${cover} ${compact ? "compact" : ""}`}>
      {item.imageKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/media?key=${encodeURIComponent(item.imageKey)}`}
          alt=""
        />
      ) : (
        <>
          <span className="cover-mark">{glyph}</span>
          <small>{item.type === "book" ? "КНИГА" : "ФИЛЬМ"}</small>
        </>
      )}
    </div>
  );
}

const CardContext = createContext<{
  editable: boolean;
  busy: boolean;
  error: string;
  edit: (item: PlannerItem) => void;
  remove: (item: PlannerItem) => void;
  privacy: (item: PlannerItem) => void;
}>({
  editable: false,
  busy: false,
  error: "",
  edit: () => {},
  remove: () => {},
  privacy: () => {},
});
function ModalError() {
  const { error } = useContext(CardContext);
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}
function DialogKeyboard({
  onClose,
  busy,
}: {
  onClose: () => void;
  busy: boolean;
}) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector('[aria-modal="true"]');
      const elements = dialog?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
      );
      if (!elements?.length) return;
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose, busy]);
  return null;
}
function CardControls({ item }: { item: PlannerItem }) {
  const controls = useContext(CardContext);
  if (!controls.editable) return null;
  return (
    <div className="card-controls" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={controls.busy}
        aria-label={`${item.isPrivate ? "Сделать публичной" : "Сделать приватной"}: ${item.title}`}
        title={
          item.isPrivate
            ? "Приватная карточка — открыть"
            : "Публичная карточка — закрыть"
        }
        aria-pressed={item.isPrivate}
        onClick={() => controls.privacy(item)}
      >
        {item.isPrivate ? "🔒" : "🔓"}
      </button>
      <button
        type="button"
        disabled={controls.busy}
        onClick={() => controls.edit(item)}
        aria-label={`Редактировать: ${item.title}`}
      >
        ✎ <span>Изменить</span>
      </button>
      <button
        type="button"
        disabled={controls.busy}
        onClick={() => controls.remove(item)}
        aria-label={`Удалить: ${item.title}`}
        className="delete-control"
      >
        × <span>Удалить</span>
      </button>
    </div>
  );
}

export function PlannerApp({ gardenId }: { gardenId?: string }) {
  const [state, setState] = useState<PlannerState | null>(null);
  const [tab, setTab] = useState<TabId>("home");
  const [codexType, setCodexType] = useState<"book" | "film">("book");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [branchParent, setBranchParent] = useState<string | null>(null);
  const [branchTitle, setBranchTitle] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PlannerItem | null>(null);
  const [deleting, setDeleting] = useState<PlannerItem | null>(null);

  const loadState = useCallback(async () => {
    const response = await fetch(
      `/api/state${gardenId ? `?garden=${encodeURIComponent(gardenId)}` : ""}`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as PlannerState & {
      error?: string;
    };
    if (!response.ok)
      throw new Error(payload.error || "Не удалось открыть планер.");
    setState(payload);
    setSelectedProjectId((current) => {
      if (current && payload.items.some((item) => item.id === current))
        return current;
      return payload.items.find((item) => item.type === "project")?.id || null;
    });
  }, [gardenId]);

  useEffect(() => {
    // Fetch state after hydration; loadState updates React state only after network I/O.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadState().catch((reason: Error) => setError(reason.message));
  }, [loadState]);

  async function action(payload: Record<string, unknown>, message?: string) {
    if (!state?.editable) return false;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, gardenId: state.garden.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Не удалось сохранить изменение.");
      await loadState();
      if (message) {
        setToast(message);
        window.setTimeout(() => setToast(""), 2400);
      }
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Что-то пошло не так.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const derived = useMemo(() => {
    const items = state?.items || [];
    const rewardItems = items.filter((item) => item.type !== "step");
    const gold = rewardItems.filter(
      (item) => item.status === "completed",
    ).length;
    const silver = rewardItems.length;
    const level = Math.floor(gold / 3) + 7;
    const levelProgress = ((gold % 3) / 3) * 100;
    return {
      items,
      projects: items.filter((item) => item.type === "project"),
      roots: items.filter((item) => ["goal", "project"].includes(item.type)),
      media: items.filter((item) => ["book", "film"].includes(item.type)),
      silver,
      gold,
      level,
      levelProgress,
    };
  }, [state]);

  if (!state) {
    return (
      <main className="loading-screen">
        <div className="sigil">M</div>
        <p>{error || "Открываем врата в ваш мир…"}</p>
        {error && (
          <button
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            Попробовать снова
          </button>
        )}
      </main>
    );
  }

  const selectedProject =
    derived.projects.find((project) => project.id === selectedProjectId) ||
    derived.projects[0];
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(new Date())
    .toUpperCase();

  return (
    <CardContext.Provider
      value={{
        editable: state.editable,
        busy,
        error,
        edit: setEditing,
        remove: setDeleting,
        privacy: (item) => {
          void action(
            { action: "privacy_item", id: item.id, isPrivate: !item.isPrivate },
            item.isPrivate
              ? "Карточка открыта в рамках видимости сада"
              : "Карточка закрыта",
          );
        },
      }}
    >
      <main className={`app-shell ${state.editable ? "" : "read-only-garden"}`}>
        <aside className="sidebar">
          <button
            className="brand"
            onClick={() => setTab("home")}
            aria-label="На главную"
          >
            <span className="brand-rune">M</span>
            <span>
              <b>MYTHOS</b>
              <small>ЛИЧНЫЙ МИР</small>
            </span>
          </button>

          <div className="hero-card">
            <div className="avatar">М</div>
            <div>
              <span className="eyebrow">Хранитель пути</span>
              <strong>{state.garden.username}</strong>
            </div>
            <span className="level-badge">{derived.level}</span>
            <div className="level-line">
              <span style={{ width: `${derived.levelProgress}%` }} />
            </div>
            <small>
              До уровня {derived.level + 1}: {3 - (derived.gold % 3 || 0)}{" "}
              золотых
            </small>
          </div>

          <nav className="main-nav" aria-label="Основное меню">
            {NAV.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
              >
                <span>{item.icon}</span>
                {item.label}
                {item.id === "quests" && <em>{derived.roots.length}</em>}
              </button>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <span>Серия путешествий</span>
            <b>12 дней</b>
            <div className="tiny-days">
              {lastDays(7).map((day, index) => (
                <i key={day} className={index < 6 ? "lit" : ""} />
              ))}
            </div>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <span className="eyebrow">{dateLabel}</span>
              <h1>{NAV.find((item) => item.id === tab)?.label}</h1>
            </div>
            <div className="top-actions">
              <Coin kind="silver" value={derived.silver} />
              <Coin kind="gold" value={derived.gold} />
              {state.editable && (
                <button
                  className="primary-button"
                  onClick={() => setCreateOpen(true)}
                >
                  <span>＋</span> Новый квест
                </button>
              )}
            </div>
          </header>

          {error && (
            <div className="error-banner">
              <span>!</span>
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}

          <div className="content">
            <div className="garden-visibility-note">
              {state.garden.isPrivate ? "🔒 Приватный сад" : "🔓 Публичный сад"}{" "}
              · {state.garden.username}
              {!state.editable && " · Только просмотр"}
              {state.editable && <a href="/account">Настройки приватности →</a>}
            </div>
            {!state.items.length && (
              <p className="empty-garden">
                {state.editable
                  ? "Здесь пока нет карточек. Создайте первый квест, проект, книгу или фильм."
                  : "В этом саду пока нет открытых карточек."}
              </p>
            )}
            {tab === "home" && (
              <HomeView
                state={state}
                items={derived.items}
                project={selectedProject}
                level={derived.level}
                onToggle={(id) =>
                  action({ action: "toggle_item", id }, "Шаг записан в хронику")
                }
                onTab={setTab}
              />
            )}
            {tab === "quests" && (
              <QuestsView
                roots={derived.roots}
                items={derived.items}
                onToggle={(id) =>
                  action({ action: "toggle_item", id }, "Награда обновлена")
                }
                onBranch={setBranchParent}
              />
            )}
            {tab === "codex" && (
              <CodexView
                items={derived.media}
                type={codexType}
                setType={setCodexType}
                busy={busy}
                onToggle={(id) =>
                  action({ action: "toggle_item", id }, "Кодекс обновлён")
                }
                onUpload={async (event, id) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    const form = new FormData();
                    form.append("file", file);
                    const uploadResponse = await fetch("/api/media", {
                      method: "POST",
                      body: form,
                    });
                    const upload = (await uploadResponse.json()) as {
                      key?: string;
                      error?: string;
                    };
                    if (!uploadResponse.ok || !upload.key) {
                      throw new Error(
                        upload.error || "Не удалось загрузить обложку.",
                      );
                    }
                    await action(
                      { action: "update_item", id, imageKey: upload.key },
                      "Новая обложка добавлена",
                    );
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Ошибка загрузки.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
            {tab === "projects" && (
              <ProjectsView
                projects={derived.projects}
                items={derived.items}
                selected={selectedProject}
                select={setSelectedProjectId}
                onToggle={(id) =>
                  action(
                    { action: "toggle_item", id },
                    "Прогресс проекта сохранён",
                  )
                }
                onBranch={setBranchParent}
              />
            )}
            {tab === "habits" && (
              <HabitsView
                habits={state.habits}
                entries={state.entries}
                onToggle={(habitId, day) =>
                  action({ action: "toggle_habit", habitId, day })
                }
                onCreate={(title) =>
                  action(
                    { action: "create_habit", title },
                    "Новая привычка создана",
                  )
                }
              />
            )}
            {tab === "stats" && (
              <StatsView
                state={state}
                silver={derived.silver}
                gold={derived.gold}
                level={derived.level}
              />
            )}
          </div>
        </section>

        {createOpen && (
          <CreateModal
            roots={derived.roots}
            busy={busy}
            onClose={() => setCreateOpen(false)}
            onCreate={async (payload) => {
              if (
                await action(
                  { action: "create_item", ...payload },
                  "＋1 серебряная монета",
                )
              )
                setCreateOpen(false);
            }}
          />
        )}

        {branchParent && (
          <div
            className="branch-popover"
            role="dialog"
            aria-label="Новая ветка цели"
          >
            <button
              className="close-button"
              onClick={() => setBranchParent(null)}
            >
              ×
            </button>
            <span className="eyebrow">НОВАЯ ВЕТКА</span>
            <h3>Добавить следующий шаг</h3>
            <input
              autoFocus
              value={branchTitle}
              onChange={(event) => setBranchTitle(event.target.value)}
              placeholder="Например: собрать референсы"
            />
            <button
              className="primary-button full"
              disabled={!branchTitle.trim() || busy}
              onClick={async () => {
                const saved = await action(
                  {
                    action: "create_item",
                    type: "step",
                    parentId: branchParent,
                    title: branchTitle,
                  },
                  "Новая ветка добавлена",
                );
                if (saved) {
                  setBranchTitle("");
                  setBranchParent(null);
                }
              }}
            >
              Добавить в дерево
            </button>
          </div>
        )}

        {editing && (
          <EditModal
            item={editing}
            busy={busy}
            onClose={() => setEditing(null)}
            onSave={async (payload) => {
              if (
                await action(
                  { action: "update_item", id: editing.id, ...payload },
                  "Карточка сохранена",
                )
              )
                setEditing(null);
            }}
          />
        )}
        {deleting && (
          <div className="modal-backdrop">
            <section
              className="create-modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-title"
            >
              <DialogKeyboard onClose={() => setDeleting(null)} busy={busy} />
              <ModalError />
              <h2 id="delete-title">Удалить «{deleting.title}»?</h2>
              <p>
                Карточка
                {["project", "goal"].includes(deleting.type)
                  ? " и все её шаги"
                  : ""}{" "}
                будет удалена без возможности восстановления.
              </p>
              <div className="media-actions">
                <button
                  autoFocus
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setDeleting(null)}
                >
                  Отмена
                </button>
                <button
                  className="primary-button danger-button"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await action(
                        { action: "delete_item", id: deleting.id },
                        "Карточка удалена",
                      )
                    )
                      setDeleting(null);
                  }}
                >
                  Удалить
                </button>
              </div>
            </section>
          </div>
        )}
        {toast && (
          <div className="toast">
            <span className="coin silver">S</span>
            {toast}
          </div>
        )}
      </main>
    </CardContext.Provider>
  );
}

function HomeView({
  state,
  items,
  project,
  level,
  onToggle,
  onTab,
}: {
  state: PlannerState;
  items: PlannerItem[];
  project?: PlannerItem;
  level: number;
  onToggle: (id: string) => void;
  onTab: (tab: TabId) => void;
}) {
  const { editable, busy: saving } = useContext(CardContext);
  const today = new Date().toISOString().slice(0, 10);
  const todayDone = state.entries.filter((entry) => entry.day === today).length;
  const focusMedia = items
    .filter((item) => ["book", "film"].includes(item.type))
    .slice(0, 2);
  const projectSteps = project
    ? items.filter((item) => item.parentId === project.id)
    : [];
  const progress = project ? completion(project, items) : 0;

  return (
    <>
      <div className="welcome-row">
        <div>
          <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ В ВАШ МИР</span>
          <h2>Какое приключение продолжим сегодня?</h2>
          <p>
            Каждый маленький шаг меняет карту. Выберите квест и оставьте след в
            хронике.
          </p>
        </div>
        <div className="rank-emblem">
          <span>РАНГ</span>
          <b>{level}</b>
          <small>ИСКАТЕЛЬ</small>
        </div>
      </div>

      <div className="dashboard-grid">
        <Panel className="featured-quest">
          {project && <CardControls item={project} />}
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ГЛАВНЫЙ КВЕСТ</span>
              <h3>{project?.title || "Создайте первый проект"}</h3>
            </div>
            <span className="rarity">ЛЕГЕНДАРНЫЙ</span>
          </div>
          <p>{project?.description}</p>
          <Progress value={progress} />
          <div className="step-list">
            {projectSteps.slice(0, 4).map((step) => (
              <button
                className={`check-row ${step.status === "completed" ? "done" : ""}`}
                key={step.id}
                disabled={!editable || saving}
                onClick={() => onToggle(step.id)}
              >
                <span className="checkbox">
                  {step.status === "completed" ? "✓" : ""}
                </span>
                <span>{step.title}</span>
                <small>+15 XP</small>
              </button>
            ))}
          </div>
          <button className="text-button" onClick={() => onTab("projects")}>
            Открыть карту проекта →
          </button>
        </Panel>

        <Panel className="daily-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ЕЖЕДНЕВНЫЕ РИТУАЛЫ</span>
              <h3>Сегодня</h3>
            </div>
            <b className="daily-score">
              {todayDone}/{state.habits.length}
            </b>
          </div>
          <div className="habit-orbs">
            {state.habits.map((habit) => {
              const done = state.entries.some(
                (entry) => entry.habitId === habit.id && entry.day === today,
              );
              return (
                <button
                  key={habit.id}
                  className={`habit-orb ${habit.color} ${done ? "done" : ""}`}
                  onClick={() => onTab("habits")}
                  title={habit.title}
                >
                  <span>{done ? "✓" : habit.icon}</span>
                  <small>{habit.title}</small>
                </button>
              );
            })}
          </div>
          <Progress
            value={
              state.habits.length
                ? Math.round((todayDone / state.habits.length) * 100)
                : 0
            }
          />
        </Panel>

        <Panel className="focus-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">СЕЙЧАС В ФОКУСЕ</span>
              <h3>Кодекс открытий</h3>
            </div>
            <button className="icon-button" onClick={() => onTab("codex")}>
              →
            </button>
          </div>
          <div className="focus-media">
            {focusMedia.map((item) => (
              <button key={item.id} onClick={() => onTab("codex")}>
                <Cover item={item} compact />
                <span>
                  <small>{TYPE_LABELS[item.type]}</small>
                  <b>{item.title}</b>
                  <em>
                    {"★".repeat(
                      Math.max(0, Math.min(5, Number(item.meta.rating ?? 0))),
                    )}
                  </em>
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="map-panel">
          <div className="map-stars" aria-hidden="true">
            ✦ · ◈ · ✧ · ◆ · ✦
          </div>
          <span className="eyebrow">КАРТА НЕДЕЛИ</span>
          <h3>{state.entries.length} действий записано</h3>
          <p>Самая сильная серия — привычка «Читать 20 минут».</p>
          <button className="secondary-button" onClick={() => onTab("stats")}>
            Смотреть статистику
          </button>
        </Panel>
      </div>
    </>
  );
}

function QuestsView({
  roots,
  items,
  onToggle,
  onBranch,
}: {
  roots: PlannerItem[];
  items: PlannerItem[];
  onToggle: (id: string) => void;
  onBranch: (id: string) => void;
}) {
  const { editable, busy: saving } = useContext(CardContext);
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">ДЕРЕВО ПУТИ</span>
          <h2>Квесты и цели</h2>
          <p>
            Большие цели становятся понятнее, когда у каждой есть ветки и
            следующие шаги.
          </p>
        </div>
        <div className="legend">
          <span>
            <i className="dot active" /> В пути
          </span>
          <span>
            <i className="dot complete" /> Выполнено
          </span>
        </div>
      </div>
      <div className="quest-tree">
        {roots.map((root) => {
          const steps = items.filter((item) => item.parentId === root.id);
          const progress = completion(root, items);
          return (
            <Panel
              className={`quest-branch ${root.status === "completed" ? "completed" : ""}`}
              key={root.id}
            >
              <CardControls item={root} />
              <div className="quest-root">
                <button
                  className={`quest-sigil ${root.status === "completed" ? "done" : ""}`}
                  disabled={!editable || saving}
                  onClick={() => onToggle(root.id)}
                  title="Изменить статус цели"
                >
                  {root.status === "completed"
                    ? "✓"
                    : String(root.meta.rune || "◇")}
                </button>
                <div>
                  <span className="eyebrow">
                    {TYPE_LABELS[root.type]} ·{" "}
                    {String(root.meta.category || "Личное")}
                  </span>
                  <h3>{root.title}</h3>
                  <p>{root.description}</p>
                </div>
                <div className="quest-progress">
                  <b>{progress}%</b>
                  <span>пройдено</span>
                </div>
              </div>
              <div className="tree-steps">
                {steps.map((step, index) => (
                  <div className="tree-node" key={step.id}>
                    <CardControls item={step} />
                    <button
                      className={`check-row ${step.status === "completed" ? "done" : ""}`}
                      disabled={!editable || saving}
                      onClick={() => onToggle(step.id)}
                    >
                      <span className="checkbox">
                        {step.status === "completed" ? "✓" : index + 1}
                      </span>
                      <span>{step.title}</span>
                      <small>
                        {step.status === "completed" ? "готово" : "+10 XP"}
                      </small>
                    </button>
                  </div>
                ))}
                <button
                  className="add-branch"
                  disabled={!editable || saving}
                  onClick={() => onBranch(root.id)}
                >
                  <span>＋</span> Добавить ветку
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function ProjectsView({
  projects,
  items,
  selected,
  select,
  onToggle,
  onBranch,
}: {
  projects: PlannerItem[];
  items: PlannerItem[];
  selected?: PlannerItem;
  select: (id: string) => void;
  onToggle: (id: string) => void;
  onBranch: (id: string) => void;
}) {
  const { editable, busy: saving } = useContext(CardContext);
  const steps = selected
    ? items.filter((item) => item.parentId === selected.id)
    : [];
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">МАСТЕРСКАЯ</span>
          <h2>Мои проекты</h2>
          <p>Здесь идеи получают форму, этапы и честный процент готовности.</p>
        </div>
      </div>
      <div className="projects-layout">
        <div className="project-cards">
          {projects.map((project) => {
            const progress = completion(project, items);
            return (
              <div
                key={project.id}
                className={`project-card ${selected?.id === project.id ? "selected" : ""}`}
              >
                <CardControls item={project} />
                <span className="project-rune">
                  {String(project.meta.rune || "✦")}
                </span>
                <span className="eyebrow">
                  {String(project.meta.difficulty || "Обычная")}
                </span>
                <h3>
                  <button
                    className="project-select"
                    onClick={() => select(project.id)}
                  >
                    {project.title}
                  </button>
                </h3>
                <p>{project.description}</p>
                <Progress value={progress} />
              </div>
            );
          })}
        </div>
        {selected && (
          <Panel className="project-detail">
            <CardControls item={selected} />
            <div className="panel-heading">
              <div>
                <span className="eyebrow">АКТИВНАЯ КАРТА</span>
                <h3>{selected.title}</h3>
              </div>
              <button
                className={`status-seal ${selected.status === "completed" ? "complete" : ""}`}
                disabled={!editable || saving}
                onClick={() => onToggle(selected.id)}
              >
                {selected.status === "completed" ? "ЗАВЕРШЁН" : "В ПУТИ"}
              </button>
            </div>
            <p>{selected.description}</p>
            <Progress value={completion(selected, items)} />
            <div className="milestone-title">
              <b>Этапы приключения</b>
              <span>
                {steps.filter((step) => step.status === "completed").length}/
                {steps.length}
              </span>
            </div>
            <div className="step-list large">
              {steps.map((step) => (
                <div key={step.id}>
                  <CardControls item={step} />
                  <button
                    className={`check-row ${step.status === "completed" ? "done" : ""}`}
                    disabled={!editable || saving}
                    onClick={() => onToggle(step.id)}
                  >
                    <span className="checkbox">
                      {step.status === "completed" ? "✓" : ""}
                    </span>
                    <span>{step.title}</span>
                    <small>
                      {step.status === "completed" ? "выполнено" : "в работе"}
                    </small>
                  </button>
                </div>
              ))}
            </div>
            <button
              hidden={!editable}
              className="secondary-button full"
              disabled={!editable || saving}
              onClick={() => onBranch(selected.id)}
            >
              ＋ Добавить этап
            </button>
          </Panel>
        )}
      </div>
    </>
  );
}

function CodexView({
  items,
  type,
  setType,
  onToggle,
  onUpload,
  busy,
}: {
  items: PlannerItem[];
  type: "book" | "film";
  setType: (type: "book" | "film") => void;
  onToggle: (id: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>, id: string) => void;
  busy: boolean;
}) {
  const { editable, busy: saving } = useContext(CardContext);
  const visible = items.filter((item) => item.type === type);
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">АРХИВ ВПЕЧАТЛЕНИЙ</span>
          <h2>Мой кодекс</h2>
          <p>
            Книги и фильмы, которые хочется не просто отметить, а сохранить в
            памяти.
          </p>
        </div>
        <div className="segmented">
          <button
            className={type === "book" ? "active" : ""}
            onClick={() => setType("book")}
          >
            Книги
          </button>
          <button
            className={type === "film" ? "active" : ""}
            onClick={() => setType("film")}
          >
            Фильмы
          </button>
        </div>
      </div>
      <div className="codex-grid">
        {visible.map((item) => (
          <Panel className="media-card" key={item.id}>
            <CardControls item={item} />
            <Cover item={item} />
            <div className="media-info">
              <div className="media-meta">
                <span>{String(item.meta.author || "Автор не указан")}</span>
                <span>{String(item.meta.year || "")}</span>
              </div>
              <h3>{item.title}</h3>
              <div className="rating">
                {"★".repeat(
                  Math.max(0, Math.min(5, Number(item.meta.rating ?? 0))),
                )}
                <span>
                  {"★".repeat(
                    5 - Math.max(0, Math.min(5, Number(item.meta.rating ?? 0))),
                  )}
                </span>
              </div>
              <p>{item.description}</p>
              <div className="impressions">
                <div>
                  <b>＋ Понравилось</b>
                  <span>
                    {String(item.meta.plus || "Добавьте впечатление")}
                  </span>
                </div>
                <div>
                  <b>− Не понравилось</b>
                  <span>{String(item.meta.minus || "Пока ничего")}</span>
                </div>
              </div>
              <div className="media-actions" hidden={!editable}>
                <button
                  className={
                    item.status === "completed"
                      ? "secondary-button complete"
                      : "secondary-button"
                  }
                  disabled={!editable || saving}
                  onClick={() => onToggle(item.id)}
                >
                  {item.status === "completed"
                    ? "✓ Завершено"
                    : type === "book"
                      ? "Прочитать"
                      : "Посмотреть"}
                </button>
                <label className="upload-button">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy || !editable}
                    onChange={(event) => onUpload(event, item.id)}
                  />
                  ▧ {item.imageKey ? "Сменить обложку" : "Прикрепить обложку"}
                </label>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}

function HabitsView({
  habits,
  entries,
  onToggle,
  onCreate,
}: {
  habits: Habit[];
  entries: HabitEntry[];
  onToggle: (habitId: string, day: string) => void;
  onCreate: (title: string) => void;
}) {
  const { editable, busy: saving } = useContext(CardContext);
  const days = lastDays(7);
  const [newHabit, setNewHabit] = useState("");
  const completed = entries.filter((entry) => days.includes(entry.day)).length;
  const possible = Math.max(1, habits.length * days.length);

  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">РИТУАЛЫ СИЛЫ</span>
          <h2>Трекер привычек</h2>
          <p>Не идеальность, а возвращение к важному день за днём.</p>
        </div>
        <div className="habit-total">
          <b>{Math.round((completed / possible) * 100)}%</b>
          <span>ритм недели</span>
        </div>
      </div>
      <Panel className="habit-table-panel">
        <div className="habit-table">
          <div className="habit-table-head">
            <span>Ритуал</span>
            {days.map((day) => (
              <span key={day}>
                <b>{shortDay(day)}</b>
                <small>{monthDay(day)}</small>
              </span>
            ))}
          </div>
          {habits.map((habit) => (
            <div className="habit-table-row" key={habit.id}>
              <div className="habit-name">
                <i className={habit.color}>{habit.icon}</i>
                <span>{habit.title}</span>
              </div>
              {days.map((day) => {
                const checked = entries.some(
                  (entry) => entry.habitId === habit.id && entry.day === day,
                );
                return (
                  <button
                    key={day}
                    className={`habit-cell ${checked ? "checked" : ""}`}
                    disabled={!editable || saving}
                    onClick={() => onToggle(habit.id, day)}
                    aria-label={`${habit.title}, ${day}`}
                  >
                    {checked ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
      <form
        hidden={!editable}
        className="habit-create"
        onSubmit={(event) => {
          event.preventDefault();
          if (!newHabit.trim()) return;
          onCreate(newHabit);
          setNewHabit("");
        }}
      >
        <span className="brand-rune small">＋</span>
        <div>
          <b>Создать новый ритуал</b>
          <small>Начните с действия, которое легко повторить завтра.</small>
        </div>
        <input
          value={newHabit}
          onChange={(event) => setNewHabit(event.target.value)}
          placeholder="Название привычки"
        />
        <button className="primary-button">Добавить</button>
      </form>
    </>
  );
}

function StatsView({
  state,
  silver,
  gold,
  level,
}: {
  state: PlannerState;
  silver: number;
  gold: number;
  level: number;
}) {
  const rewardItems = state.items.filter((item) => item.type !== "step");
  const completed = rewardItems.filter(
    (item) => item.status === "completed",
  ).length;
  const days = lastDays(28);
  const categories = [
    { label: "Проекты", types: ["project"], color: "violet" },
    { label: "Цели", types: ["goal"], color: "cyan" },
    { label: "Книги", types: ["book"], color: "gold" },
    { label: "Фильмы", types: ["film"], color: "green" },
  ];
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">ХРОНИКА РОСТА</span>
          <h2>Статистика героя</h2>
          <p>Здесь виден не только результат, но и сама история движения.</p>
        </div>
      </div>
      <div className="stats-cards">
        <Panel>
          <span className="stat-icon silver">S</span>
          <b>{silver}</b>
          <small>создано целей</small>
        </Panel>
        <Panel>
          <span className="stat-icon gold">G</span>
          <b>{gold}</b>
          <small>золотых побед</small>
        </Panel>
        <Panel>
          <span className="stat-icon violet">✦</span>
          <b>{level}</b>
          <small>текущий уровень</small>
        </Panel>
        <Panel>
          <span className="stat-icon cyan">↗</span>
          <b>
            {rewardItems.length
              ? Math.round((completed / rewardItems.length) * 100)
              : 0}
            %
          </b>
          <small>общий прогресс</small>
        </Panel>
      </div>
      <div className="stats-grid">
        <Panel className="activity-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ПОСЛЕДНИЕ 4 НЕДЕЛИ</span>
              <h3>Карта активности</h3>
            </div>
            <b>
              {state.entries.filter((entry) => days.includes(entry.day)).length}{" "}
              отметок
            </b>
          </div>
          <div className="heatmap">
            {days.map((day) => {
              const score = state.entries.filter(
                (entry) => entry.day === day,
              ).length;
              return (
                <i
                  key={day}
                  className={`heat-${Math.min(4, score)}`}
                  title={`${day}: ${score}`}
                />
              );
            })}
          </div>
          <div className="heat-legend">
            <span>Спокойно</span>
            <i />
            <i className="heat-1" />
            <i className="heat-2" />
            <i className="heat-3" />
            <span>Насыщенно</span>
          </div>
        </Panel>
        <Panel className="category-panel">
          <span className="eyebrow">БАЛАНС ПРИКЛЮЧЕНИЙ</span>
          <h3>Прогресс по категориям</h3>
          {categories.map((category) => {
            const relevant = rewardItems.filter((item) =>
              category.types.includes(item.type),
            );
            const value = relevant.length
              ? Math.round(
                  (relevant.filter((item) => item.status === "completed")
                    .length /
                    relevant.length) *
                    100,
                )
              : 0;
            return (
              <div className="category-row" key={category.label}>
                <span>
                  <i className={category.color} />
                  {category.label}
                </span>
                <Progress value={value} />
              </div>
            );
          })}
        </Panel>
      </div>
      <Panel className="achievement-panel">
        <div className="achievement-rune">♜</div>
        <div>
          <span className="eyebrow">СЛЕДУЮЩЕЕ ДОСТИЖЕНИЕ</span>
          <h3>Архитектор собственной легенды</h3>
          <p>
            Завершите ещё {Math.max(1, 10 - gold)} целей, чтобы открыть новый
            титул.
          </p>
        </div>
        <div className="achievement-progress">
          <b>{gold}/10</b>
          <Progress value={Math.min(100, gold * 10)} label={false} />
        </div>
      </Panel>
    </>
  );
}

function CreateModal({
  roots,
  busy,
  onClose,
  onCreate,
}: {
  roots: PlannerItem[];
  busy: boolean;
  onClose: () => void;
  onCreate: (payload: Record<string, unknown>) => void;
}) {
  const [type, setType] = useState<ItemType>("goal");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onCreate({
      type,
      title,
      description,
      parentId: type === "step" ? parentId : null,
      meta:
        type === "book" || type === "film"
          ? { rating: 4, plus: "Добавьте впечатление", minus: "Пока ничего" }
          : { difficulty: "Новая", category: "Личное", rune: "✦" },
    });
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className="create-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Новая карточка"
        onSubmit={submit}
      >
        <DialogKeyboard onClose={onClose} busy={busy} />
        <ModalError />
        <button type="button" className="close-button" onClick={onClose}>
          ×
        </button>
        <span className="eyebrow">НОВАЯ ЗАПИСЬ В ХРОНИКЕ</span>
        <h2>Начать приключение</h2>
        <p>
          За новую цель вы получите серебряную монету. После завершения она
          станет золотой.
        </p>
        <div className="type-grid">
          {(["goal", "project", "book", "film", "step"] as ItemType[]).map(
            (entry) => (
              <button
                type="button"
                className={type === entry ? "active" : ""}
                key={entry}
                onClick={() => setType(entry)}
              >
                <span>
                  {entry === "goal"
                    ? "◇"
                    : entry === "project"
                      ? "⚒"
                      : entry === "book"
                        ? "▤"
                        : entry === "film"
                          ? "▣"
                          : "↳"}
                </span>
                {TYPE_LABELS[entry]}
              </button>
            ),
          )}
        </div>
        <label>
          <span>Название</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Что вы хотите совершить?"
          />
        </label>
        <label>
          <span>Описание</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Почему это важно и каким будет результат?"
          />
        </label>
        {type === "step" && (
          <label>
            <span>К какой цели прикрепить</span>
            <select
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              required
            >
              <option value="">Выберите цель или проект</option>
              {roots.map((root) => (
                <option value={root.id} key={root.id}>
                  {root.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="primary-button full"
          disabled={busy || !title.trim()}
        >
          {busy ? "Сохраняем…" : "Создать и получить серебро"}
        </button>
      </form>
    </div>
  );
}
