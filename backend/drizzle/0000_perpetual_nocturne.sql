CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`mime` text NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_project_idx` ON `attachments` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`format` text DEFAULT '16:9' NOT NULL,
	`style` text DEFAULT 'Auto' NOT NULL,
	`duration_secs` integer DEFAULT 5 NOT NULL,
	`vibe` text,
	`design` text DEFAULT '{"bg":"#09090b","fg":"#ffffff","align":"center"}' NOT NULL,
	`export_settings` text DEFAULT '{"quality":"1080p","fps":30,"container":"MP4"}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`note` text,
	`reply` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_project_no_idx` ON `versions` (`project_id`,`version_no`);