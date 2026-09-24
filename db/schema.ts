import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  emailVerified: integer("email_verified").notNull().default(0),
  mustChangePassword: integer("must_change_password").notNull().default(0),
  gardenPrivate: integer("garden_private").notNull().default(1),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const plannerItems = sqliteTable("planner_items", {
  ownerId: text("owner_id").notNull().default("legacy-admin"),
  isPrivate: integer("is_private").notNull().default(0),
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  parentId: text("parent_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"),
  imageKey: text("image_key"),
  meta: text("meta").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const habits = sqliteTable("habits", {
  ownerId: text("owner_id").notNull().default("legacy-admin"),
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  icon: text("icon").notNull().default("✦"),
  color: text("color").notNull().default("violet"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});
export const emailTokens = sqliteTable("email_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  purpose: text("purpose").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const uploads = sqliteTable("uploads", {
  key: text("key").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
});
export const authLimits = sqliteTable("auth_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const habitEntries = sqliteTable("habit_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  habitId: text("habit_id").notNull(),
  day: text("day").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
