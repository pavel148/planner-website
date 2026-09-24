import { pbkdf2, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(pbkdf2);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 600000, 32, "sha256");
  return `pbkdf2$600000$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterations, salt, hex] = stored.split("$");
  if (algorithm !== "pbkdf2" || iterations !== "600000" || !salt || !hex)
    return false;
  const key = await derive(password, salt, Number(iterations), 32, "sha256");
  const expected = Buffer.from(hex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function token() {
  return randomBytes(32).toString("hex");
}
export function sameSecret(a: string, b: string) {
  return timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
}
