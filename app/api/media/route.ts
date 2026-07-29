import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!env.MEDIA) throw new Error("Хранилище изображений пока недоступно.");
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Выберите изображение." }, { status: 400 });
    }
    if (!file.type.startsWith("image/") || file.size > 6 * 1024 * 1024) {
      return Response.json(
        { error: "Нужен файл изображения размером до 6 МБ." },
        { status: 400 }
      );
    }
    const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "img";
    const key = `covers/${crypto.randomUUID()}.${extension}`;
    await env.MEDIA.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    return Response.json({ key, url: `/api/media?key=${encodeURIComponent(key)}` });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить изображение." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  if (!env.MEDIA) return new Response("Хранилище недоступно", { status: 503 });
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith("covers/")) return new Response("Не найдено", { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Не найдено", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
