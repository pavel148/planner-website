import { env } from "cloudflare:workers";

export function getRuntimeDb() {
  if (!env.DB) throw new Error("Хранилище планера пока недоступно.");
  return env.DB;
}
