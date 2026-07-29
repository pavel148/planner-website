import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const plannerItems = sqliteTable("planner_items", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  parentId: text("parent_id"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"),
  imageKey: text("image_key"),
  meta: text("meta").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const habits = sqliteTable("habits", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  icon: text("icon").notNull().default("✦"),
  color: text("color").notNull().default("violet"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const habitEntries = sqliteTable("habit_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  habitId: text("habit_id").notNull(),
  day: text("day").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
