-- 0007_contact_messages: messages from the public contact form and the rate-limit buckets that guard it.
CREATE TABLE `contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`locale` text NOT NULL CHECK (`locale` IN ('en', 'it')),
	`name` text NOT NULL CHECK (length(`name`) BETWEEN 2 AND 100),
	`email` text NOT NULL,
	`subject` text NOT NULL CHECK (length(`subject`) BETWEEN 3 AND 150),
	`body` text NOT NULL CHECK (length(`body`) BETWEEN 10 AND 4000),
	`status` text NOT NULL DEFAULT 'new' CHECK (`status` IN ('new', 'handled', 'archived')),
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT `contact_messages_email_shape` CHECK (
		`email` = lower(trim(`email`))
		AND length(`email`) <= 254
		AND length(`email`) - length(replace(`email`, '@', '')) = 1
		AND `email` GLOB '?*@?*.?*'
		AND `email` NOT GLOB '* *'
	)
);
--> statement-breakpoint
CREATE INDEX `contact_messages_created_idx` ON `contact_messages` (`created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `contact_messages_status_created_idx` ON `contact_messages` (`status`, `created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE TABLE `contact_request_limits` (
	`scope_key` text PRIMARY KEY NOT NULL CHECK (
		`scope_key` = 'global' OR (length(`scope_key`) = 64 AND `scope_key` NOT GLOB '*[^a-f0-9]*')
	),
	`window_started_at` text NOT NULL,
	`request_count` integer NOT NULL DEFAULT 0 CHECK (`request_count` >= 0),
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_request_limits_updated_idx` ON `contact_request_limits` (`updated_at`);
