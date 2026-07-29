import { env } from "cloudflare:workers";

const createStatements = [
  `CREATE TABLE IF NOT EXISTS planner_items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    parent_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    image_key TEXT,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS planner_items_parent_idx ON planner_items(parent_id)`,
  `CREATE INDEX IF NOT EXISTS planner_items_type_idx ON planner_items(type)`,
  `CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '✦',
    color TEXT NOT NULL DEFAULT 'violet',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS habit_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id TEXT NOT NULL,
    day TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS habit_entries_unique_idx ON habit_entries(habit_id, day)`,
];

const seedItems = [
  {
    id: "project-digital-garden",
    type: "project",
    parent: null,
    title: "Запустить личный цифровой сад",
    description:
      "Собрать спокойное пространство для идей, заметок и творческих экспериментов.",
    status: "active",
    meta: { difficulty: "Легендарная", category: "Творчество", rune: "✦" },
  },
  {
    id: "step-garden-1",
    type: "step",
    parent: "project-digital-garden",
    title: "Определить структуру разделов",
    description: "",
    status: "completed",
    meta: {},
  },
  {
    id: "step-garden-2",
    type: "step",
    parent: "project-digital-garden",
    title: "Собрать визуальную систему",
    description: "",
    status: "completed",
    meta: {},
  },
  {
    id: "step-garden-3",
    type: "step",
    parent: "project-digital-garden",
    title: "Перенести первые 20 заметок",
    description: "",
    status: "active",
    meta: {},
  },
  {
    id: "step-garden-4",
    type: "step",
    parent: "project-digital-garden",
    title: "Опубликовать первую версию",
    description: "",
    status: "active",
    meta: {},
  },
  {
    id: "goal-10k",
    type: "goal",
    parent: null,
    title: "Пробежать первые 10 км",
    description: "Квест на выносливость: двигаться без гонки и отмечать каждую тренировку.",
    status: "active",
    meta: { difficulty: "Редкая", category: "Здоровье", rune: "◆" },
  },
  {
    id: "step-run-1",
    type: "step",
    parent: "goal-10k",
    title: "Три лёгкие пробежки в неделю",
    description: "",
    status: "completed",
    meta: {},
  },
  {
    id: "step-run-2",
    type: "step",
    parent: "goal-10k",
    title: "Пройти дистанцию 7 км",
    description: "",
    status: "active",
    meta: {},
  },
  {
    id: "project-photo-story",
    type: "project",
    parent: null,
    title: "Снять фоторассказ о своём городе",
    description: "Небольшая серия из 12 кадров о знакомых местах и людях.",
    status: "completed",
    meta: { difficulty: "Эпическая", category: "Фото", rune: "◈" },
  },
  {
    id: "book-name-wind",
    type: "book",
    parent: null,
    title: "Имя ветра",
    description: "Большое приключение о таланте, памяти и цене собственной легенды.",
    status: "active",
    meta: {
      author: "Патрик Ротфусс",
      year: "2007",
      rating: 4,
      plus: "Живой мир, музыка, чувство тайны",
      minus: "Местами медленный темп",
      cover: "wind",
    },
  },
  {
    id: "book-atomic",
    type: "book",
    parent: null,
    title: "Атомные привычки",
    description: "Практичная система небольших изменений, которые складываются в результат.",
    status: "completed",
    meta: {
      author: "Джеймс Клир",
      year: "2018",
      rating: 5,
      plus: "Конкретные приёмы и ясная структура",
      minus: "Некоторые идеи повторяются",
      cover: "atomic",
    },
  },
  {
    id: "film-dune",
    type: "film",
    parent: null,
    title: "Дюна: Часть вторая",
    description: "Монументальная история о выборе, власти и опасности великих пророчеств.",
    status: "completed",
    meta: {
      author: "Дени Вильнёв",
      year: "2024",
      rating: 5,
      plus: "Масштаб, звук и сильный визуальный язык",
      minus: "Хочется больше времени с второстепенными героями",
      cover: "dune",
    },
  },
  {
    id: "film-perfect-days",
    type: "film",
    parent: null,
    title: "Идеальные дни",
    description: "Тихое кино о ритуалах, внимании и красоте самого обычного дня.",
    status: "active",
    meta: {
      author: "Вим Вендерс",
      year: "2023",
      rating: 4,
      plus: "Тёплая интонация и наблюдательность",
      minus: "Очень неспешный ритм",
      cover: "days",
    },
  },
];

export function getRuntimeDb() {
  if (!env.DB) throw new Error("Хранилище планера пока недоступно.");
  return env.DB;
}

export async function ensurePlannerTables() {
  const db = getRuntimeDb();
  await db.batch(createStatements.map((statement) => db.prepare(statement)));

  const itemCount = await db
    .prepare("SELECT COUNT(*) AS count FROM planner_items")
    .first<{ count: number }>();

  if (!itemCount?.count) {
    await db.batch(
      seedItems.map((item) =>
        db
          .prepare(
            `INSERT INTO planner_items
            (id, type, parent_id, title, description, status, meta, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            item.id,
            item.type,
            item.parent,
            item.title,
            item.description,
            item.status,
            JSON.stringify(item.meta),
            item.status === "completed" ? new Date().toISOString() : null
          )
      )
    );
  }

  const habitCount = await db
    .prepare("SELECT COUNT(*) AS count FROM habits")
    .first<{ count: number }>();

  if (!habitCount?.count) {
    const habitSeeds = [
      ["habit-reading", "Читать 20 минут", "⌁", "violet"],
      ["habit-water", "Пить достаточно воды", "◉", "cyan"],
      ["habit-focus", "Час глубокого фокуса", "✦", "gold"],
      ["habit-walk", "Прогулка без телефона", "♧", "green"],
    ];
    await db.batch(
      habitSeeds.map((habit) =>
        db
          .prepare("INSERT INTO habits (id, title, icon, color) VALUES (?, ?, ?, ?)")
          .bind(...habit)
      )
    );

    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      return day.toISOString().slice(0, 10);
    });
    const entries = [
      ["habit-reading", days[0]],
      ["habit-reading", days[1]],
      ["habit-reading", days[3]],
      ["habit-reading", days[4]],
      ["habit-reading", days[5]],
      ["habit-water", days[1]],
      ["habit-water", days[2]],
      ["habit-water", days[3]],
      ["habit-water", days[4]],
      ["habit-water", days[5]],
      ["habit-focus", days[0]],
      ["habit-focus", days[2]],
      ["habit-focus", days[4]],
      ["habit-walk", days[1]],
      ["habit-walk", days[3]],
      ["habit-walk", days[5]],
    ];
    await db.batch(
      entries.map(([habitId, day]) =>
        db
          .prepare("INSERT OR IGNORE INTO habit_entries (habit_id, day) VALUES (?, ?)")
          .bind(habitId, day)
      )
    );
  }
}
