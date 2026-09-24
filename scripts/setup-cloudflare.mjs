import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wranglerPath = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
const databaseName = "mythos-db";
const bucketName = "mythos-media";

function runWrangler(args, { allowFailure = false, quiet = false } = {}) {
  const result = spawnSync(process.execPath, [wranglerPath, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_LOG_PATH:
        process.env.WRANGLER_LOG_PATH ?? ".wrangler/wrangler.log",
    },
  });

  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  if (!quiet && result.stderr) process.stderr.write(result.stderr);

  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`Wrangler завершился с кодом ${result.status}.`);
  }

  return result;
}

function parseJsonArray(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) {
    throw new Error("Не удалось прочитать список D1 из ответа Cloudflare.");
  }

  return JSON.parse(output.slice(start, end + 1));
}

function findDatabase() {
  const result = runWrangler(["d1", "list", "--json"], { quiet: true });
  const databases = parseJsonArray(result.stdout);
  return databases.find((database) => database.name === databaseName);
}

console.log("Проверяю Cloudflare D1...");
let database = findDatabase();

if (!database) {
  console.log(`Создаю базу ${databaseName} в Восточной Европе...`);
  runWrangler(["d1", "create", databaseName, "--location", "eeur"]);
  database = findDatabase();
}

if (!database?.uuid) {
  throw new Error(`Cloudflare не вернул ID базы ${databaseName}.`);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const databaseBinding = config.d1_databases?.find(
  (entry) => entry.binding === "DB",
);

if (!databaseBinding) {
  throw new Error("В wrangler.jsonc не найдена привязка D1 с именем DB.");
}

databaseBinding.database_name = databaseName;
databaseBinding.database_id = database.uuid;
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log("Проверяю Cloudflare R2...");
const bucketInfo = runWrangler(
  ["r2", "bucket", "info", bucketName, "--json"],
  { allowFailure: true, quiet: true },
);

if (bucketInfo.status !== 0) {
  console.log(`Создаю хранилище ${bucketName} в Восточной Европе...`);
  runWrangler(["r2", "bucket", "create", bucketName, "--location", "eeur"]);
}

console.log("Cloudflare готов. Теперь выполните: npm run deploy");
