CREATE TABLE `agent_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_memory_project_idx` ON `agent_memory` (`project_id`);