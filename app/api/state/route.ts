import { ensurePlannerTables, getRuntimeDb } from "../../../db/runtime";

type PlannerRow = {
  id: string;
  type: string;
  parent_id: string | null;
  title: string;
  description: string;
  status: string;
  image_key: string | null;
  meta: string;
  created_at: string;
  completed_at: string | null;
};

export const dynamic = "force-dynamic";

function cleanText(value: unknown, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function mapItem(row: PlannerRow) {
  let meta = {};
  try {
    meta = JSON.parse(row.meta || "{}");
  } catch {
    meta = {};
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
  };
}

export async function GET() {
  try {
    await ensurePlannerTables();
    const db = getRuntimeDb();
    const [itemsResult, habitsResult, entriesResult] = await Promise.all([
      db.prepare("SELECT * FROM planner_items ORDER BY created_at, id").all<PlannerRow>(),
      db.prepare("SELECT * FROM habits ORDER BY created_at, id").all(),
      db.prepare("SELECT habit_id AS habitId, day FROM habit_entries ORDER BY day").all(),
    ]);
    return Response.json({
      items: itemsResult.results.map(mapItem),
      habits: habitsResult.results,
      entries: entriesResult.results,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось открыть планер." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensurePlannerTables();
    const db = getRuntimeDb();
    const payload = (await request.json()) as Record<string, unknown>;
    const action = cleanText(payload.action, 40);

    if (action === "create_item") {
      const allowed = new Set(["goal", "project", "step", "book", "film"]);
      const type = cleanText(payload.type, 20);
      const title = cleanText(payload.title, 120);
      if (!allowed.has(type) || !title) {
        return Response.json({ error: "Укажите название и тип записи." }, { status: 400 });
      }
      const id = crypto.randomUUID();
      const parentId = cleanText(payload.parentId, 80) || null;
      const description = cleanText(payload.description, 1000);
      const meta =
        payload.meta && typeof payload.meta === "object"
          ? JSON.stringify(payload.meta).slice(0, 4000)
          : "{}";
      await db
        .prepare(
          `INSERT INTO planner_items
          (id, type, parent_id, title, description, status, meta)
          VALUES (?, ?, ?, ?, ?, 'active', ?)`
        )
        .bind(id, type, parentId, title, description, meta)
        .run();
      return Response.json({ ok: true, id }, { status: 201 });
    }

    if (action === "toggle_item") {
      const id = cleanText(payload.id, 80);
      const current = await db
        .prepare("SELECT status FROM planner_items WHERE id = ?")
        .bind(id)
        .first<{ status: string }>();
      if (!current) return Response.json({ error: "Запись не найдена." }, { status: 404 });
      const next = current.status === "completed" ? "active" : "completed";
      await db
        .prepare(
          "UPDATE planner_items SET status = ?, completed_at = ? WHERE id = ?"
        )
        .bind(next, next === "completed" ? new Date().toISOString() : null, id)
        .run();
      return Response.json({ ok: true, status: next });
    }

    if (action === "update_item") {
      const id = cleanText(payload.id, 80);
      const imageKey = cleanText(payload.imageKey, 180) || null;
      const description =
        typeof payload.description === "string"
          ? cleanText(payload.description, 1000)
          : null;
      if (description !== null) {
        await db
          .prepare("UPDATE planner_items SET description = ?, image_key = COALESCE(?, image_key) WHERE id = ?")
          .bind(description, imageKey, id)
          .run();
      } else {
        await db
          .prepare("UPDATE planner_items SET image_key = ? WHERE id = ?")
          .bind(imageKey, id)
          .run();
      }
      return Response.json({ ok: true });
    }

    if (action === "create_habit") {
      const title = cleanText(payload.title, 100);
      if (!title) return Response.json({ error: "Введите название привычки." }, { status: 400 });
      const id = crypto.randomUUID();
      await db
        .prepare("INSERT INTO habits (id, title, icon, color) VALUES (?, ?, '✦', 'violet')")
        .bind(id, title)
        .run();
      return Response.json({ ok: true, id }, { status: 201 });
    }

    if (action === "toggle_habit") {
      const habitId = cleanText(payload.habitId, 80);
      const day = cleanText(payload.day, 10);
      const existing = await db
        .prepare("SELECT id FROM habit_entries WHERE habit_id = ? AND day = ?")
        .bind(habitId, day)
        .first<{ id: number }>();
      if (existing) {
        await db.prepare("DELETE FROM habit_entries WHERE id = ?").bind(existing.id).run();
      } else {
        await db
          .prepare("INSERT INTO habit_entries (habit_id, day) VALUES (?, ?)")
          .bind(habitId, day)
          .run();
      }
      return Response.json({ ok: true, checked: !existing });
    }

    return Response.json({ error: "Неизвестное действие." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить изменения." },
      { status: 500 }
    );
  }
}
