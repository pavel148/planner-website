import { getRuntimeDb } from "../../../db/runtime";
import { ApiError, fail, json, viewer } from "../../../lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    if (user?.must_change_password)
      throw new ApiError("Сначала смените временный пароль.", 403);
    const result = await getRuntimeDb()
      .prepare(
        `SELECT id,username,garden_private AS isPrivate FROM users
   WHERE email_verified=1 AND (garden_private=0 OR id=? OR ?='superadmin') ORDER BY username LIMIT 500`,
      )
      .bind(user?.id || "", user?.role || "")
      .all();
    return json({ gardens: result.results });
  } catch (error) {
    return fail(error);
  }
}
