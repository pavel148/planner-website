import { getRuntimeDb } from "../../../db/runtime";
import { canManage, visibleItems, type OwnedItem } from "../../../lib/access";
import {
  ApiError,
  body,
  checkOrigin,
  fail,
  json,
  requireUser,
  text,
  viewer,
  type User,
} from "../../../lib/server";

export const dynamic = "force-dynamic";
type Item = OwnedItem & {
  type: string;
  title: string;
  description: string;
  status: string;
  image_key: string | null;
  meta: string;
  created_at: string;
  completed_at: string | null;
};
function mapItem(row: Item) {
  let meta = {};
  try {
    meta = JSON.parse(row.meta);
  } catch {
    /* legacy metadata */
  }
  return {
    id: row.id,
    type: row.type,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    status: row.status,
    imageKey: row.image_key,
    meta,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    isPrivate: !!row.is_private,
  };
}
export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    if (user?.must_change_password)
      throw new ApiError("Сначала смените временный пароль.", 403);
    const db = getRuntimeDb();
    const ownerId = new URL(request.url).searchParams.get("garden") || user?.id;
    if (!ownerId) throw new ApiError("Выберите сад или войдите.", 401);
    const owner = await db
      .prepare("SELECT * FROM users WHERE id=? AND email_verified=1")
      .bind(ownerId)
      .first<User>();
    if (!owner || (owner.garden_private && !canManage(user, ownerId)))
      throw new ApiError("Сад не найден или закрыт.", 404);
    const result = await db
      .prepare(
        "SELECT * FROM planner_items WHERE owner_id=? ORDER BY created_at,id",
      )
      .bind(ownerId)
      .all<Item>();
    const editable = canManage(user, ownerId);
    const [habits, entries] = editable
      ? await Promise.all([
          db
            .prepare(
              "SELECT id,title,icon,color FROM habits WHERE owner_id=? ORDER BY created_at,id",
            )
            .bind(ownerId)
            .all(),
          db
            .prepare(
              "SELECT e.habit_id AS habitId,e.day FROM habit_entries e JOIN habits h ON h.id=e.habit_id WHERE h.owner_id=? ORDER BY e.day",
            )
            .bind(ownerId)
            .all(),
        ])
      : [{ results: [] }, { results: [] }];
    return json({
      items: visibleItems(
        result.results,
        user,
        ownerId,
        owner.garden_private,
      ).map(mapItem),
      habits: habits.results,
      entries: entries.results,
      garden: {
        id: owner.id,
        username: owner.username,
        isPrivate: !!owner.garden_private,
      },
      editable,
    });
  } catch (error) {
    return fail(error);
  }
}
function metadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError("Некорректные поля карточки.");
  const result: Record<string, string | number> = {};
  for (const [key, val] of Object.entries(value)) {
    if (
      [
        "author",
        "year",
        "plus",
        "minus",
        "difficulty",
        "category",
        "rune",
        "cover",
      ].includes(key)
    )
      result[key] = text(val, 500);
    if (key === "rating") {
      if (!Number.isInteger(Number(val)) || Number(val) < 0 || Number(val) > 5)
        throw new ApiError("Оценка: от 0 до 5.");
      result.rating = Number(val);
    }
  }
  return JSON.stringify(result);
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser(request);
    const data = await body(request);
    const db = getRuntimeDb();
    const action = text(data.action, 40);
    const ownerId = text(data.gardenId, 80) || user.id;
    if (!canManage(user, ownerId))
      throw new ApiError("Нет доступа к этому саду.", 403);
    if (
      !(await db
        .prepare("SELECT id FROM users WHERE id=?")
        .bind(ownerId)
        .first())
    )
      throw new ApiError("Сад не найден.", 404);
    if (action === "create_item") {
      const type = text(data.type, 20),
        title = text(data.title);
      if (!["goal", "project", "step", "book", "film"].includes(type) || !title)
        throw new ApiError("Укажите название и тип записи.");
      const parent = type === "step" ? text(data.parentId, 80) : null;
      if (
        type === "step" &&
        (!parent ||
          !(await db
            .prepare(
              "SELECT id FROM planner_items WHERE id=? AND owner_id=? AND type IN ('goal','project')",
            )
            .bind(parent, ownerId)
            .first()))
      )
        throw new ApiError("Выберите цель или проект в этом саду.");
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO planner_items (id,type,parent_id,title,description,meta,owner_id,is_private) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          type,
          parent,
          title,
          text(data.description, 1000),
          metadata(data.meta || {}),
          ownerId,
          data.isPrivate === false ? 0 : 1,
        )
        .run();
      return json({ ok: true, id }, 201);
    }
    if (
      ["toggle_item", "update_item", "delete_item", "privacy_item"].includes(
        action,
      )
    ) {
      const id = text(data.id, 80);
      const current = await db
        .prepare("SELECT * FROM planner_items WHERE id=? AND owner_id=?")
        .bind(id, ownerId)
        .first<Item>();
      if (!current) throw new ApiError("Запись не найдена.", 404);
      if (action === "delete_item") {
        await db
          .prepare(
            `WITH RECURSIVE descendants(id) AS (SELECT id FROM planner_items WHERE id=? AND owner_id=?
        UNION SELECT i.id FROM planner_items i JOIN descendants d ON i.parent_id=d.id WHERE i.owner_id=?)
        DELETE FROM planner_items WHERE id IN (SELECT id FROM descendants) AND owner_id=?`,
          )
          .bind(id, ownerId, ownerId, ownerId)
          .run();
      } else if (action === "toggle_item") {
        const status = current.status === "completed" ? "active" : "completed";
        await db
          .prepare(
            "UPDATE planner_items SET status=?,completed_at=? WHERE id=? AND owner_id=?",
          )
          .bind(
            status,
            status === "completed" ? new Date().toISOString() : null,
            id,
            ownerId,
          )
          .run();
      } else if (action === "privacy_item") {
        if (typeof data.isPrivate !== "boolean")
          throw new ApiError("Укажите видимость карточки.");
        await db
          .prepare(
            "UPDATE planner_items SET is_private=? WHERE id=? AND owner_id=?",
          )
          .bind(Number(data.isPrivate), id, ownerId)
          .run();
      } else {
        const title =
          data.title === undefined ? current.title : text(data.title);
        if (!title) throw new ApiError("Название не может быть пустым.");
        const image =
          data.imageKey === undefined
            ? current.image_key
            : text(data.imageKey, 180) || null;
        if (
          image &&
          image !== current.image_key &&
          !(await db
            .prepare("SELECT key FROM uploads WHERE key=? AND owner_id=?")
            .bind(image, user.id)
            .first())
        )
          throw new ApiError("Обложка недоступна.", 403);
        const status =
          data.status === undefined ? current.status : text(data.status, 20);
        if (!["active", "completed"].includes(status))
          throw new ApiError("Неизвестный статус.");
        await db
          .prepare(
            "UPDATE planner_items SET title=?,description=?,meta=?,image_key=?,status=?,completed_at=? WHERE id=? AND owner_id=?",
          )
          .bind(
            title,
            data.description === undefined
              ? current.description
              : text(data.description, 1000),
            data.meta === undefined ? current.meta : metadata(data.meta),
            image,
            status,
            status === "completed"
              ? current.completed_at || new Date().toISOString()
              : null,
            id,
            ownerId,
          )
          .run();
      }
      return json({ ok: true });
    }
    if (action === "create_habit") {
      const title = text(data.title, 100);
      if (!title) throw new ApiError("Введите название привычки.");
      await db
        .prepare("INSERT INTO habits (id,title,owner_id) VALUES (?,?,?)")
        .bind(crypto.randomUUID(), title, ownerId)
        .run();
      return json({ ok: true }, 201);
    }
    if (action === "toggle_habit") {
      const habit = text(data.habitId, 80),
        day = text(data.day, 10);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !(await db
          .prepare("SELECT id FROM habits WHERE id=? AND owner_id=?")
          .bind(habit, ownerId)
          .first())
      )
        throw new ApiError("Привычка или дата недоступна.", 404);
      const existing = await db
        .prepare("SELECT id FROM habit_entries WHERE habit_id=? AND day=?")
        .bind(habit, day)
        .first<{ id: number }>();
      if (existing)
        await db
          .prepare("DELETE FROM habit_entries WHERE id=?")
          .bind(existing.id)
          .run();
      else
        await db
          .prepare(
            "INSERT OR IGNORE INTO habit_entries (habit_id,day) VALUES (?,?)",
          )
          .bind(habit, day)
          .run();
      return json({ ok: true });
    }
    throw new ApiError("Неизвестное действие.");
  } catch (error) {
    return fail(error);
  }
}
