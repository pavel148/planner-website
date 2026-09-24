import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir(".test-build", { recursive: true });
await build({
  stdin: {
    contents: `export * as auth from './app/api/auth/route'; export * as state from './app/api/state/route'; export * as gardens from './app/api/gardens/route'; export * as media from './app/api/media/route';`,
    resolveDir: process.cwd(),
  },
  outfile: ".test-build/routes.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "test-bindings",
      setup(b) {
        b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
          path: "bindings",
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: "export const env = globalThis.testEnv;",
        }));
      },
    },
  ],
});
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(await readFile("drizzle/0000_slimy_tomorrow_man.sql", "utf8"));
sqlite.exec(
  "INSERT INTO planner_items(id,type,title,image_key) VALUES ('old-project','project','Existing project','covers/legacy.png'); INSERT INTO habits(id,title) VALUES('old-habit','Existing habit')",
);
sqlite.exec(await readFile("drizzle/0001_accounts_privacy.sql", "utf8"));
class Statement {
  constructor(sql, values = []) {
    this.sql = sql;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.sql, values);
  }
  async first() {
    return sqlite.prepare(this.sql).get(...this.values) || null;
  }
  async all() {
    return { results: sqlite.prepare(this.sql).all(...this.values) };
  }
  async run() {
    const r = sqlite.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(r.changes) } };
  }
}
const objects = new Map();
globalThis.testEnv = {
  DB: {
    prepare: (sql) => new Statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  },
  MEDIA: {
    async put(key, data, options) {
      objects.set(key, { data, options });
    },
    async get(key) {
      const o = objects.get(key);
      return o
        ? {
            body: o.data,
            writeHttpMetadata(h) {
              h.set("Content-Type", o.options.httpMetadata.contentType);
            },
          }
        : null;
    },
  },
  ADMIN_SETUP_KEY: "test-setup-key-never-for-production-123",
  RESEND_API_KEY: "test-resend",
  EMAIL_FROM: "test@example.com",
  APP_URL: "https://mythos.test",
};
const { auth, state, gardens, media } =
  await import("../.test-build/routes.mjs");
const messages = [];
let sendFailure = false;
globalThis.fetch = async (url, options) => {
  assert.equal(url, "https://api.resend.com/emails");
  messages.push(JSON.parse(options.body));
  return new Response("{}", { status: sendFailure ? 503 : 200 });
};
let ip = 0;
async function call(route, action, data = {}, cookie = "", options = {}) {
  const headers = {
    origin: "https://mythos.test",
    "Content-Type": "application/json",
    "cf-connecting-ip": options.ip || `test-${++ip}`,
    cookie,
    ...options.headers,
  };
  const request = new Request(
    `https://mythos.test/api/${options.path || "test"}`,
    {
      method: action ? "POST" : "GET",
      headers,
      ...(action ? { body: JSON.stringify({ action, ...data }) } : {}),
    },
  );
  return action ? route.POST(request) : route.GET(request);
}
async function post(route, action, data = {}, cookie = "", status = 200) {
  const r = await call(route, action, data, cookie);
  const j = await r.json();
  assert.equal(r.status, status, JSON.stringify(j));
  return {
    data: j,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
    response: r,
  };
}
function mailToken() {
  const link = messages.at(-1).text.match(/https:\/\/[^\s]+/)[0];
  return new URLSearchParams(new URL(link).hash.slice(1)).get("token");
}
const pass = "A long user password!";
let admin, alice, bob, aliceId, bobId, project, step, film, cover;

test("migration preserves existing content and closes it to anonymous readers", async () => {
  assert.equal(
    sqlite
      .prepare("SELECT owner_id FROM planner_items WHERE id='old-project'")
      .get().owner_id,
    "legacy-admin",
  );
  assert.equal(
    (await call(state, null, {}, "", { path: "state?garden=legacy-admin" }))
      .status,
    404,
  );
  assert.deepEqual((await (await call(gardens, null)).json()).gardens, []);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM habits").get().n, 1);
});
test("admin bootstrap requires setup key, restricts access until password change and invalidates old sessions", async () => {
  await post(auth, "login", { login: "admin", password: "admin" }, "", 401);
  const bootstrap = await post(auth, "login", {
    login: "admin",
    password: "admin",
    setupKey: globalThis.testEnv.ADMIN_SETUP_KEY,
  });
  assert.equal(bootstrap.data.user.mustChangePassword, true);
  await post(auth, "login", { login: "admin", password: "admin" }, "", 401);
  assert.match(
    bootstrap.response.headers.get("set-cookie"),
    /HttpOnly; SameSite=Lax.*Secure/,
  );
  assert.equal((await call(state, null, {}, bootstrap.cookie)).status, 403);
  const changed = await post(
    auth,
    "password",
    { currentPassword: "admin", password: pass },
    bootstrap.cookie,
  );
  admin = changed.cookie;
  assert.equal(
    (await (await call(auth, null, {}, bootstrap.cookie)).json()).user,
    null,
  );
  await post(
    auth,
    "login",
    {
      login: "admin",
      password: "admin",
      setupKey: globalThis.testEnv.ADMIN_SETUP_KEY,
    },
    "",
    401,
  );
  assert.equal((await call(state, null, {}, admin)).status, 200);
});
test("registration requires email verification; tokens are expiring and single use", async () => {
  for (const username of ["alice", "bob"]) {
    await post(
      auth,
      "register",
      { username, email: `${username}@example.com`, password: pass },
      "",
      201,
    );
    const raw = mailToken();
    assert.notEqual(
      sqlite.prepare("SELECT token_hash FROM email_tokens LIMIT 1").get()
        .token_hash,
      raw,
    );
    await post(auth, "login", { login: username, password: pass }, "", 403);
    await post(auth, "verify", { token: raw });
    await post(auth, "verify", { token: raw }, "", 400);
    const signed = await post(auth, "login", {
      login: username,
      password: pass,
    });
    if (username === "alice") {
      alice = signed.cookie;
      aliceId = signed.data.user.id;
    } else {
      bob = signed.cookie;
      bobId = signed.data.user.id;
    }
  }
  assert.notEqual(
    sqlite
      .prepare("SELECT password_hash FROM users WHERE username='alice'")
      .get().password_hash,
    pass,
  );
});
test("card create, full edit, cross-account mutation denial, hierarchy visibility and garden override", async () => {
  project = (
    await post(
      state,
      "create_item",
      { type: "project", title: "Original", isPrivate: false },
      alice,
      201,
    )
  ).data.id;
  step = (
    await post(
      state,
      "create_item",
      { type: "step", parentId: project, title: "Step", isPrivate: false },
      alice,
      201,
    )
  ).data.id;
  film = (
    await post(
      state,
      "create_item",
      { type: "film", title: "Film", isPrivate: false },
      alice,
      201,
    )
  ).data.id;
  await post(
    state,
    "update_item",
    {
      id: film,
      title: "Updated film",
      description: "Review",
      meta: { rating: 5, author: "Director", plus: "Great", minus: "Long" },
      status: "completed",
    },
    alice,
  );
  await post(state, "update_item", { id: film, title: "Stolen" }, bob, 404);
  await post(state, "delete_item", { id: film, gardenId: aliceId }, bob, 403);
  await post(
    state,
    "create_item",
    { type: "step", parentId: project, title: "Attack" },
    bob,
    400,
  );
  await post(auth, "privacy", { gardenPrivate: false }, alice);
  let view = await (
    await call(state, null, {}, "", { path: `state?garden=${aliceId}` })
  ).json();
  assert.equal(view.items.length, 3);
  assert.equal(view.editable, false);
  assert.deepEqual(view.habits, []);
  assert.equal(view.items.find((x) => x.id === film).meta.rating, 5);
  await post(state, "privacy_item", { id: project, isPrivate: true }, alice);
  view = await (
    await call(state, null, {}, bob, { path: `state?garden=${aliceId}` })
  ).json();
  assert.deepEqual(
    view.items.map((x) => x.id),
    [film],
  );
  await post(auth, "privacy", { gardenPrivate: true }, alice);
  assert.equal(
    (await call(state, null, {}, bob, { path: `state?garden=${aliceId}` }))
      .status,
    404,
  );
  assert.equal(
    (await call(state, null, {}, admin, { path: `state?garden=${aliceId}` }))
      .status,
    200,
  );
});
test("media authorizes direct URLs and disables public caching", async () => {
  const form = new FormData();
  form.set(
    "file",
    new File([new Uint8Array([137, 80, 78, 71])], "cover.png", {
      type: "image/png",
    }),
  );
  const response = await media.POST(
    new Request("https://mythos.test/api/media", {
      method: "POST",
      headers: { origin: "https://mythos.test", cookie: alice },
      body: form,
    }),
  );
  assert.equal(response.status, 200);
  cover = (await response.json()).key;
  await post(state, "update_item", { id: film, imageKey: cover }, alice);
  const url = { path: `media?key=${encodeURIComponent(cover)}` };
  assert.equal((await call(media, null, {}, "", url)).status, 404);
  assert.equal((await call(media, null, {}, bob, url)).status, 404);
  assert.equal(
    (await call(media, null, {}, alice, url)).headers.get("cache-control"),
    "private, no-store",
  );
  await post(auth, "privacy", { gardenPrivate: false }, alice);
  assert.equal((await call(media, null, {}, "", url)).status, 200);
  await post(state, "privacy_item", { id: film, isPrivate: true }, alice);
  assert.equal((await call(media, null, {}, "", url)).status, 404);
});
test("deletion removes descendants and deleted cards do not reappear", async () => {
  await post(state, "delete_item", { id: project }, alice);
  assert.equal(
    sqlite
      .prepare("SELECT count(*) AS n FROM planner_items WHERE id IN (?,?)")
      .get(project, step).n,
    0,
  );
  await post(state, "delete_item", { id: film }, alice);
  const view = await (await call(state, null, {}, alice)).json();
  assert.deepEqual(view.items, []);
  assert.equal(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM planner_items WHERE id='old-project'")
      .get().n,
    1,
  );
});
test("admin cannot expose password hashes; reset requires own password and revokes target sessions", async () => {
  await post(auth, "admin_users", {}, bob, 403);
  const list = await post(auth, "admin_users", {}, admin);
  assert.ok(list.data.users.length >= 3);
  assert.ok(list.data.users.every((x) => !("password_hash" in x)));
  await post(
    auth,
    "admin_reset",
    {
      userId: bobId,
      password: "New temporary password",
      currentPassword: "wrong",
    },
    admin,
    403,
  );
  await post(
    auth,
    "admin_reset",
    {
      userId: bobId,
      password: "New temporary password",
      currentPassword: pass,
    },
    admin,
  );
  assert.equal((await (await call(auth, null, {}, bob)).json()).user, null);
  const login = await post(auth, "login", {
    login: "bob",
    password: "New temporary password",
  });
  assert.equal(login.data.user.mustChangePassword, true);
  assert.equal((await call(state, null, {}, login.cookie)).status, 403);
});
test("password recovery expires, rotates tokens, changes password and logs out existing sessions", async () => {
  await post(auth, "forgot", { email: "alice@example.com" });
  const expired = mailToken();
  sqlite
    .prepare("UPDATE email_tokens SET expires_at=0 WHERE user_id=?")
    .run(aliceId);
  await post(
    auth,
    "reset",
    { token: expired, password: "Recovery password 123" },
    "",
    400,
  );
  await post(auth, "forgot", { email: "alice@example.com" });
  const raw = mailToken();
  await post(auth, "reset", { token: raw, password: "Recovery password 123" });
  await post(
    auth,
    "reset",
    { token: raw, password: "Attack password 123" },
    "",
    400,
  );
  assert.equal((await (await call(auth, null, {}, alice)).json()).user, null);
  await post(auth, "login", {
    login: "alice",
    password: "Recovery password 123",
  });
});
test("CSRF, anonymous writes, login rate limits and missing mail configuration fail closed", async () => {
  assert.equal(
    (await call(state, "create_item", { type: "film", title: "No auth" }))
      .status,
    401,
  );
  assert.equal(
    (
      await call(auth, "logout", {}, admin, {
        headers: { origin: "https://evil.test" },
      })
    ).status,
    403,
  );
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await call(auth, "login", { login: "no-user", password: "wrong" }, "", {
          ip: "rate-test",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await call(auth, "login", { login: "no-user", password: "wrong" }, "", {
        ip: "rate-test",
      })
    ).status,
    429,
  );
  delete globalThis.testEnv.RESEND_API_KEY;
  await post(
    auth,
    "register",
    { username: "nomail", email: "no@example.com", password: pass },
    "",
    503,
  );
  assert.equal(
    sqlite
      .prepare("SELECT count(*) AS n FROM users WHERE username='nomail'")
      .get().n,
    0,
  );
});

test("mail delivery failures can be recovered by resend without bypassing verification", async () => {
  globalThis.testEnv.RESEND_API_KEY = "test-resend";
  sendFailure = true;
  await post(
    auth,
    "register",
    { username: "mailfail", email: "failure@example.com", password: pass },
    "",
    503,
  );
  await post(auth, "login", { login: "mailfail", password: pass }, "", 403);
  sendFailure = false;
  await post(auth, "resend", { email: "failure@example.com" });
  await post(auth, "verify", { token: mailToken() });
  const session = await post(auth, "login", {
    login: "mailfail",
    password: pass,
  });
  await post(auth, "logout", {}, session.cookie);
  assert.equal(
    (await (await call(auth, null, {}, session.cookie)).json()).user,
    null,
  );
});

test("oversized payloads and invalid card values are rejected", async () => {
  await post(
    state,
    "create_item",
    { type: "book", title: "Bad rating", meta: { rating: 99 } },
    admin,
    400,
  );
  await post(
    state,
    "create_item",
    { type: "film", title: "X".repeat(20000) },
    admin,
    413,
  );
});
