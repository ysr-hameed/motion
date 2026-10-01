CREATE TABLE `credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`ref_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credit_ledger_user_idx` ON `credit_ledger` (`user_id`);--> statement-breakpoint
CREATE TABLE `credit_wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`balance` integer DEFAULT 10 NOT NULL,
	`spent_this_period` integer DEFAULT 0 NOT NULL,
	`period_key` text DEFAULT '1970-01' NOT NULL,
	`lifetime_granted` integer DEFAULT 0 NOT NULL,
	`lifetime_spent` integer DEFAULT 0 NOT NULL,
	`plan_checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
