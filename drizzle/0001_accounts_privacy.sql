CREATE TABLE users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
 email TEXT COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','superadmin')),
 email_verified INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0,
 garden_private INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO users (id, username, password_hash, role, email_verified, must_change_password)
 VALUES ('legacy-admin','admin','!setup','superadmin',1,1);
ALTER TABLE planner_items ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy-admin';
ALTER TABLE planner_items ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE habits ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy-admin';
CREATE INDEX planner_owner_idx ON planner_items(owner_id);
CREATE INDEX habits_owner_idx ON habits(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS habit_entries_unique_idx ON habit_entries(habit_id,day);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE email_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), purpose TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE uploads (key TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id));
INSERT OR IGNORE INTO uploads (key,owner_id) SELECT image_key,owner_id FROM planner_items WHERE image_key IS NOT NULL;
