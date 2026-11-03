CREATE TABLE `pay_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`frequency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`anchor_date` text NOT NULL,
	`semi_day_1` integer DEFAULT 1 NOT NULL,
	`semi_day_2` integer DEFAULT 15 NOT NULL,
	`deposit_account_id` text,
	`income_category_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deposit_account_id`) REFERENCES `fin_account`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`income_category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pay_schedule_user_idx` ON `pay_schedule` (`user_id`);--> statement-breakpoint
CREATE TABLE `paycheck` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`account_id` text NOT NULL,
	`income_category_id` text,
	`next_date` text,
	`income_txn_id` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `fin_account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`income_category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`income_txn_id`) REFERENCES `txn`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `paycheck_user_date_idx` ON `paycheck` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `paycheck_line` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`paycheck_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`from_account_id` text,
	`to_account_id` text,
	`category_id` text,
	`bill_id` text,
	`due_date` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`txn_id` text,
	`txn_origin` text,
	`done_at` integer,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paycheck_id`) REFERENCES `paycheck`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_account_id`) REFERENCES `fin_account`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_account_id`) REFERENCES `fin_account`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`bill_id`) REFERENCES `recurring_bill`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`txn_id`) REFERENCES `txn`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `paycheck_line_user_idx` ON `paycheck_line` (`user_id`);--> statement-breakpoint
CREATE INDEX `paycheck_line_paycheck_idx` ON `paycheck_line` (`paycheck_id`);--> statement-breakpoint
CREATE INDEX `paycheck_line_bill_due_idx` ON `paycheck_line` (`bill_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `recurring_bill` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`frequency` text NOT NULL,
	`day_of_month` integer,
	`month_of_year` integer,
	`interval_weeks` integer,
	`start_date` text NOT NULL,
	`ended_at` text,
	`account_id` text NOT NULL,
	`category_id` text,
	`pay_to_account_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `fin_account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pay_to_account_id`) REFERENCES `fin_account`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recurring_bill_user_idx` ON `recurring_bill` (`user_id`);--> statement-breakpoint
DROP TABLE `budget_allocation`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `budget_mode`;