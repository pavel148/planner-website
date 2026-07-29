CREATE TABLE `habit_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`habit_id` text NOT NULL,
	`day` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`icon` text DEFAULT '✦' NOT NULL,
	`color` text DEFAULT 'violet' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `planner_items` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`image_key` text,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
