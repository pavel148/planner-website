"use client";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
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
};

type Habit = {
  id: string;
  title: string;
  icon: string;
  color: string;
};

type HabitEntry = { habitId: string; day: string };
type PlannerState = { items: PlannerItem[]; habits: Habit[]; entries: HabitEntry[] };
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
    (steps.filter((entry) => entry.status === "completed").length / steps.length) * 100
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
    <div className="coin-counter" title={kind === "silver" ? "Созданные цели" : "Выполненные цели"}>
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

function Cover({ item, compact = false }: { item: PlannerItem; compact?: boolean }) {
  const cover = String(item.meta.cover || item.type);
  const glyph =
    item.type === "book" ? (cover === "atomic" ? "A" : "W") : cover === "dune" ? "Ⅱ" : "日";
  return (
    <div className={`cover cover-${cover} ${compact ? "compact" : ""}`}>
      {item.imageKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/media?key=${encodeURIComponent(item.imageKey)}`} alt="" />
      ) : (
        <>
          <span className="cover-mark">{glyph}</span>
          <small>{item.type === "book" ? "КНИГА" : "ФИЛЬМ"}</small>
        </>
      )}
    </div>
  );
}

export function PlannerApp() {
  const [state, setState] = useState<PlannerState | null>(null);
  const [tab, setTab] = useState<TabId>("home");
  const [codexType, setCodexType] = useState<"book" | "film">("book");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [branchParent, setBranchParent] = useState<string | null>(null);
  const [branchTitle, setBranchTitle] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadState() {
    const response = await fetch("/api/state", { cache: "no-store" });
    const payload = (await response.json()) as PlannerState & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Не удалось открыть планер.");
    setState(payload);
    setSelectedProjectId((current) => {
      if (current && payload.items.some((item) => item.id === current)) return current;
      return payload.items.find((item) => item.type === "project")?.id || null;
    });
  }

  useEffect(() => {
    loadState().catch((reason: Error) => setError(reason.message));
  }, []);

  async function action(payload: Record<string, unknown>, message?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось сохранить изменение.");
      await loadState();
      if (message) {
        setToast(message);
        window.setTimeout(() => setToast(""), 2400);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Что-то пошло не так.");
    } finally {
      setBusy(false);
    }
  }

  const derived = useMemo(() => {
    const items = state?.items || [];
    const rewardItems = items.filter((item) => item.type !== "step");
    const gold = rewardItems.filter((item) => item.status === "completed").length;
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
          <button className="primary-button" onClick={() => window.location.reload()}>
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
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setTab("home")} aria-label="На главную">
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
            <strong>Мой персонаж</strong>
          </div>
          <span className="level-badge">{derived.level}</span>
          <div className="level-line">
            <span style={{ width: `${derived.levelProgress}%` }} />
          </div>
          <small>До уровня {derived.level + 1}: {3 - (derived.gold % 3 || 0)} золотых</small>
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
            <button className="primary-button" onClick={() => setCreateOpen(true)}>
              <span>＋</span> Новый квест
            </button>
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
                    throw new Error(upload.error || "Не удалось загрузить обложку.");
                  }
                  await action(
                    { action: "update_item", id, imageKey: upload.key },
                    "Новая обложка добавлена"
                  );
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : "Ошибка загрузки.");
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
                action({ action: "toggle_item", id }, "Прогресс проекта сохранён")
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
                action({ action: "create_habit", title }, "Новая привычка создана")
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
            await action({ action: "create_item", ...payload }, "＋1 серебряная монета");
            setCreateOpen(false);
          }}
        />
      )}

      {branchParent && (
        <div className="branch-popover" role="dialog" aria-label="Новая ветка цели">
          <button className="close-button" onClick={() => setBranchParent(null)}>
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
              await action(
                {
                  action: "create_item",
                  type: "step",
                  parentId: branchParent,
                  title: branchTitle,
                },
                "Новая ветка добавлена"
              );
              setBranchTitle("");
              setBranchParent(null);
            }}
          >
            Добавить в дерево
          </button>
        </div>
      )}

      {toast && (
        <div className="toast">
          <span className="coin silver">S</span>
          {toast}
        </div>
      )}
    </main>
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
  const today = new Date().toISOString().slice(0, 10);
  const todayDone = state.entries.filter((entry) => entry.day === today).length;
  const focusMedia = items.filter((item) => ["book", "film"].includes(item.type)).slice(0, 2);
  const projectSteps = project ? items.filter((item) => item.parentId === project.id) : [];
  const progress = project ? completion(project, items) : 0;

  return (
    <>
      <div className="welcome-row">
        <div>
          <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ В ВАШ МИР</span>
          <h2>Какое приключение продолжим сегодня?</h2>
          <p>Каждый маленький шаг меняет карту. Выберите квест и оставьте след в хронике.</p>
        </div>
        <div className="rank-emblem">
          <span>РАНГ</span>
          <b>{level}</b>
          <small>ИСКАТЕЛЬ</small>
        </div>
      </div>

      <div className="dashboard-grid">
        <Panel className="featured-quest">
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
                onClick={() => onToggle(step.id)}
              >
                <span className="checkbox">{step.status === "completed" ? "✓" : ""}</span>
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
            <b className="daily-score">{todayDone}/{state.habits.length}</b>
          </div>
          <div className="habit-orbs">
            {state.habits.map((habit) => {
              const done = state.entries.some(
                (entry) => entry.habitId === habit.id && entry.day === today
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
            value={state.habits.length ? Math.round((todayDone / state.habits.length) * 100) : 0}
          />
        </Panel>

        <Panel className="focus-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">СЕЙЧАС В ФОКУСЕ</span>
              <h3>Кодекс открытий</h3>
            </div>
            <button className="icon-button" onClick={() => onTab("codex")}>→</button>
          </div>
          <div className="focus-media">
            {focusMedia.map((item) => (
              <button key={item.id} onClick={() => onTab("codex")}>
                <Cover item={item} compact />
                <span>
                  <small>{TYPE_LABELS[item.type]}</small>
                  <b>{item.title}</b>
                  <em>{"★".repeat(Number(item.meta.rating || 4))}</em>
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="map-panel">
          <div className="map-stars" aria-hidden="true">✦ · ◈ · ✧ · ◆ · ✦</div>
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
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">ДЕРЕВО ПУТИ</span>
          <h2>Квесты и цели</h2>
          <p>Большие цели становятся понятнее, когда у каждой есть ветки и следующие шаги.</p>
        </div>
        <div className="legend">
          <span><i className="dot active" /> В пути</span>
          <span><i className="dot complete" /> Выполнено</span>
        </div>
      </div>
      <div className="quest-tree">
        {roots.map((root) => {
          const steps = items.filter((item) => item.parentId === root.id);
          const progress = completion(root, items);
          return (
            <Panel className={`quest-branch ${root.status === "completed" ? "completed" : ""}`} key={root.id}>
              <div className="quest-root">
                <button
                  className={`quest-sigil ${root.status === "completed" ? "done" : ""}`}
                  onClick={() => onToggle(root.id)}
                  title="Изменить статус цели"
                >
                  {root.status === "completed" ? "✓" : String(root.meta.rune || "◇")}
                </button>
                <div>
                  <span className="eyebrow">{TYPE_LABELS[root.type]} · {String(root.meta.category || "Личное")}</span>
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
                    <button
                      className={`check-row ${step.status === "completed" ? "done" : ""}`}
                      onClick={() => onToggle(step.id)}
                    >
                      <span className="checkbox">{step.status === "completed" ? "✓" : index + 1}</span>
                      <span>{step.title}</span>
                      <small>{step.status === "completed" ? "готово" : "+10 XP"}</small>
                    </button>
                  </div>
                ))}
                <button className="add-branch" onClick={() => onBranch(root.id)}>
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
  const steps = selected ? items.filter((item) => item.parentId === selected.id) : [];
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
              <button
                key={project.id}
                className={`project-card ${selected?.id === project.id ? "selected" : ""}`}
                onClick={() => select(project.id)}
              >
                <span className="project-rune">{String(project.meta.rune || "✦")}</span>
                <span className="eyebrow">{String(project.meta.difficulty || "Обычная")}</span>
                <h3>{project.title}</h3>
                <p>{project.description}</p>
                <Progress value={progress} />
              </button>
            );
          })}
        </div>
        {selected && (
          <Panel className="project-detail">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">АКТИВНАЯ КАРТА</span>
                <h3>{selected.title}</h3>
              </div>
              <button
                className={`status-seal ${selected.status === "completed" ? "complete" : ""}`}
                onClick={() => onToggle(selected.id)}
              >
                {selected.status === "completed" ? "ЗАВЕРШЁН" : "В ПУТИ"}
              </button>
            </div>
            <p>{selected.description}</p>
            <Progress value={completion(selected, items)} />
            <div className="milestone-title">
              <b>Этапы приключения</b>
              <span>{steps.filter((step) => step.status === "completed").length}/{steps.length}</span>
            </div>
            <div className="step-list large">
              {steps.map((step) => (
                <button
                  className={`check-row ${step.status === "completed" ? "done" : ""}`}
                  key={step.id}
                  onClick={() => onToggle(step.id)}
                >
                  <span className="checkbox">{step.status === "completed" ? "✓" : ""}</span>
                  <span>{step.title}</span>
                  <small>{step.status === "completed" ? "выполнено" : "в работе"}</small>
                </button>
              ))}
            </div>
            <button className="secondary-button full" onClick={() => onBranch(selected.id)}>
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
  const visible = items.filter((item) => item.type === type);
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">АРХИВ ВПЕЧАТЛЕНИЙ</span>
          <h2>Мой кодекс</h2>
          <p>Книги и фильмы, которые хочется не просто отметить, а сохранить в памяти.</p>
        </div>
        <div className="segmented">
          <button className={type === "book" ? "active" : ""} onClick={() => setType("book")}>
            Книги
          </button>
          <button className={type === "film" ? "active" : ""} onClick={() => setType("film")}>
            Фильмы
          </button>
        </div>
      </div>
      <div className="codex-grid">
        {visible.map((item) => (
          <Panel className="media-card" key={item.id}>
            <Cover item={item} />
            <div className="media-info">
              <div className="media-meta">
                <span>{String(item.meta.author || "Автор не указан")}</span>
                <span>{String(item.meta.year || "")}</span>
              </div>
              <h3>{item.title}</h3>
              <div className="rating">
                {"★".repeat(Number(item.meta.rating || 4))}
                <span>{"★".repeat(5 - Number(item.meta.rating || 4))}</span>
              </div>
              <p>{item.description}</p>
              <div className="impressions">
                <div><b>＋ Понравилось</b><span>{String(item.meta.plus || "Добавьте впечатление")}</span></div>
                <div><b>− Не понравилось</b><span>{String(item.meta.minus || "Пока ничего")}</span></div>
              </div>
              <div className="media-actions">
                <button
                  className={item.status === "completed" ? "secondary-button complete" : "secondary-button"}
                  onClick={() => onToggle(item.id)}
                >
                  {item.status === "completed" ? "✓ Завершено" : type === "book" ? "Прочитать" : "Посмотреть"}
                </button>
                <label className="upload-button">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
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
              <span key={day}><b>{shortDay(day)}</b><small>{monthDay(day)}</small></span>
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
                  (entry) => entry.habitId === habit.id && entry.day === day
                );
                return (
                  <button
                    key={day}
                    className={`habit-cell ${checked ? "checked" : ""}`}
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
  const completed = rewardItems.filter((item) => item.status === "completed").length;
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
        <Panel><span className="stat-icon silver">S</span><b>{silver}</b><small>создано целей</small></Panel>
        <Panel><span className="stat-icon gold">G</span><b>{gold}</b><small>золотых побед</small></Panel>
        <Panel><span className="stat-icon violet">✦</span><b>{level}</b><small>текущий уровень</small></Panel>
        <Panel><span className="stat-icon cyan">↗</span><b>{rewardItems.length ? Math.round((completed / rewardItems.length) * 100) : 0}%</b><small>общий прогресс</small></Panel>
      </div>
      <div className="stats-grid">
        <Panel className="activity-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">ПОСЛЕДНИЕ 4 НЕДЕЛИ</span><h3>Карта активности</h3></div>
            <b>{state.entries.filter((entry) => days.includes(entry.day)).length} отметок</b>
          </div>
          <div className="heatmap">
            {days.map((day) => {
              const score = state.entries.filter((entry) => entry.day === day).length;
              return <i key={day} className={`heat-${Math.min(4, score)}`} title={`${day}: ${score}`} />;
            })}
          </div>
          <div className="heat-legend"><span>Спокойно</span><i /><i className="heat-1" /><i className="heat-2" /><i className="heat-3" /><span>Насыщенно</span></div>
        </Panel>
        <Panel className="category-panel">
          <span className="eyebrow">БАЛАНС ПРИКЛЮЧЕНИЙ</span>
          <h3>Прогресс по категориям</h3>
          {categories.map((category) => {
            const relevant = rewardItems.filter((item) => category.types.includes(item.type));
            const value = relevant.length
              ? Math.round((relevant.filter((item) => item.status === "completed").length / relevant.length) * 100)
              : 0;
            return (
              <div className="category-row" key={category.label}>
                <span><i className={category.color} />{category.label}</span>
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
          <p>Завершите ещё {Math.max(1, 10 - gold)} целей, чтобы открыть новый титул.</p>
        </div>
        <div className="achievement-progress"><b>{gold}/10</b><Progress value={Math.min(100, gold * 10)} label={false} /></div>
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
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="create-modal" onSubmit={submit}>
        <button type="button" className="close-button" onClick={onClose}>×</button>
        <span className="eyebrow">НОВАЯ ЗАПИСЬ В ХРОНИКЕ</span>
        <h2>Начать приключение</h2>
        <p>За новую цель вы получите серебряную монету. После завершения она станет золотой.</p>
        <div className="type-grid">
          {(["goal", "project", "book", "film", "step"] as ItemType[]).map((entry) => (
            <button
              type="button"
              className={type === entry ? "active" : ""}
              key={entry}
              onClick={() => setType(entry)}
            >
              <span>{entry === "goal" ? "◇" : entry === "project" ? "⚒" : entry === "book" ? "▤" : entry === "film" ? "▣" : "↳"}</span>
              {TYPE_LABELS[entry]}
            </button>
          ))}
        </div>
        <label>
          <span>Название</span>
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Что вы хотите совершить?" />
        </label>
        <label>
          <span>Описание</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Почему это важно и каким будет результат?" />
        </label>
        {type === "step" && (
          <label>
            <span>К какой цели прикрепить</span>
            <select value={parentId} onChange={(event) => setParentId(event.target.value)} required>
              <option value="">Выберите цель или проект</option>
              {roots.map((root) => <option value={root.id} key={root.id}>{root.title}</option>)}
            </select>
          </label>
        )}
        <button className="primary-button full" disabled={busy || !title.trim()}>
          {busy ? "Сохраняем…" : "Создать и получить серебро"}
        </button>
      </form>
    </div>
  );
}
