import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";

// Native scrypt avoids Workers' production-only PBKDF2 iteration cap.
// OWASP's 16 MiB profile: N=2^14, r=8, p=5.
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}
export const DUMMY_PASSWORD_HASH = `scrypt$16384$8$5$${"0".repeat(32)}$${"0".repeat(64)}`;
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt$16384$8$5$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, salt, hex, extra] = stored.split("$");
  if (
    algorithm !== "scrypt" ||
    n !== "16384" ||
    r !== "8" ||
    p !== "5" ||
    !/^[a-f0-9]{32}$/.test(salt || "") ||
    !/^[a-f0-9]{64}$/.test(hex || "") ||
    extra !== undefined
  )
    return false;
  const key = await derive(password, salt);
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
