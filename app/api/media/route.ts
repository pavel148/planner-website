import { env } from "cloudflare:workers";
import { getRuntimeDb } from "../../../db/runtime";
import { canManage, visibleItems, type OwnedItem } from "../../../lib/access";
import {
  ApiError,
  checkOrigin,
  fail,
  json,
  limit,
  requireUser,
  viewer,
} from "../../../lib/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser(request);
    await limit(request, `upload:${user.id}`, 30, 3600000);
    if (Number(request.headers.get("content-length")) > 7 * 1024 * 1024)
      throw new ApiError("Файл слишком большой.", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 6 * 1024 * 1024)
      throw new ApiError("Выберите изображение до 6 МБ.");
    const formats: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    if (!formats[file.type])
      throw new ApiError("Поддерживаются JPG, PNG, WebP и GIF.");
    const key = `covers/${crypto.randomUUID()}.${formats[file.type]}`;
    await env.MEDIA.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    await getRuntimeDb()
      .prepare("INSERT INTO uploads VALUES (?,?)")
      .bind(key, user.id)
      .run();
    return json({ key });
  } catch (error) {
    return fail(error);
  }
}
export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    if (user?.must_change_password)
      throw new ApiError("Сначала смените пароль.", 403);
    const key = new URL(request.url).searchParams.get("key") || "";
    const db = getRuntimeDb();
    const linked = await db
      .prepare(
        `SELECT i.*,u.garden_private FROM planner_items i JOIN users u ON u.id=i.owner_id
    WHERE i.image_key=? AND u.email_verified=1`,
      )
      .bind(key)
      .all<OwnedItem & { garden_private: number }>();
    let allowed = false;
    for (const item of linked.results) {
      if (canManage(user, item.owner_id)) {
        allowed = true;
        break;
      }
      const all = await db
        .prepare(
          "SELECT id,owner_id,parent_id,is_private FROM planner_items WHERE owner_id=?",
        )
        .bind(item.owner_id)
        .all<OwnedItem>();
      if (
        visibleItems(
          all.results,
          user,
          item.owner_id,
          item.garden_private,
        ).some((entry) => entry.id === item.id)
      ) {
        allowed = true;
        break;
      }
    }
    if (!linked.results.length && user) {
      const upload = await db
        .prepare("SELECT owner_id FROM uploads WHERE key=?")
        .bind(key)
        .first<{ owner_id: string }>();
      allowed = !!upload && canManage(user, upload.owner_id);
    }
    if (!allowed) throw new ApiError("Изображение не найдено.", 404);
    const object = await env.MEDIA.get(key);
    if (!object) throw new ApiError("Изображение не найдено.", 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Vary", "Cookie");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
    return new Response(object.body, { headers });
  } catch (error) {
    return fail(error);
  }
}
