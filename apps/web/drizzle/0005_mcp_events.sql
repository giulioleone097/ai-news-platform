-- 0005_mcp_events: MCP Events webhook subscriptions and the outbox of signed deliveries.
CREATE TABLE `mcp_event_subscriptions` (
	`id` text PRIMARY KEY NOT NULL CHECK (
		length(`id`) = 68 AND `id` GLOB 'sub_*' AND substr(`id`, 5) NOT GLOB '*[^0-9a-f]*'
	),
	`principal` text NOT NULL CHECK (length(`principal`) BETWEEN 1 AND 80),
	`event_name` text NOT NULL CHECK (`event_name` IN ('article.published')),
	`arguments` text NOT NULL DEFAULT '{}' CHECK (
		json_valid(`arguments`) AND json_type(`arguments`) = 'object' AND length(CAST(`arguments` AS BLOB)) <= 1024
	),
	`callback_url` text NOT NULL CHECK (length(`callback_url`) <= 2048 AND `callback_url` GLOB 'https://*'),
	`callback_host` text NOT NULL CHECK (length(`callback_host`) BETWEEN 1 AND 255),
	`secret` text NOT NULL CHECK (`secret` GLOB 'whsec_*' AND length(`secret`) <= 128),
	`previous_secret` text CHECK (`previous_secret` GLOB 'whsec_*' AND length(`previous_secret`) <= 128),
	`previous_secret_expires_at` text,
	`status` text NOT NULL DEFAULT 'active' CHECK (`status` IN ('active', 'unsubscribed', 'gone')),
	`expires_at` text NOT NULL,
	`verified_at` text NOT NULL,
	`checkpoint` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT `mcp_event_subscriptions_rotation_check` CHECK (
		(`previous_secret` IS NULL) = (`previous_secret_expires_at` IS NULL)
	)
);
--> statement-breakpoint
CREATE INDEX `mcp_event_subscriptions_host_idx` ON `mcp_event_subscriptions` (`callback_host`) WHERE `status` = 'active';
--> statement-breakpoint
CREATE INDEX `mcp_event_subscriptions_live_idx` ON `mcp_event_subscriptions` (`status`, `expires_at`);
--> statement-breakpoint
CREATE INDEX `mcp_event_subscriptions_verification_idx` ON `mcp_event_subscriptions` (`principal`, `callback_url`, `verified_at`);
--> statement-breakpoint
CREATE TABLE `mcp_event_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL REFERENCES `mcp_event_subscriptions`(`id`) ON DELETE CASCADE,
	`article_id` text NOT NULL CHECK (length(`article_id`) BETWEEN 1 AND 128),
	`event_id` text NOT NULL CHECK (
		length(`event_id`) = 68 AND `event_id` GLOB 'evt_*' AND substr(`event_id`, 5) NOT GLOB '*[^0-9a-f]*'
	),
	`event` text NOT NULL CHECK (
		json_valid(`event`) AND json_type(`event`) = 'object' AND length(CAST(`event` AS BLOB)) <= 262144
	),
	`status` text NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'processing', 'delivered', 'failed', 'cancelled')),
	`attempts` integer NOT NULL DEFAULT 0 CHECK (`attempts` BETWEEN 0 AND 100),
	`max_attempts` integer NOT NULL DEFAULT 8 CHECK (`max_attempts` BETWEEN 1 AND 20),
	`available_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`lease_token` text,
	`lease_expires_at` text,
	`last_error_code` text CHECK (length(`last_error_code`) <= 80),
	`delivered_at` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT `mcp_event_deliveries_one_per_article` UNIQUE (`subscription_id`, `article_id`),
	CONSTRAINT `mcp_event_deliveries_lease_state_check` CHECK (
		(`status` = 'processing' AND `lease_token` IS NOT NULL AND `lease_expires_at` IS NOT NULL)
		OR (`status` <> 'processing' AND `lease_token` IS NULL AND `lease_expires_at` IS NULL)
	)
);
--> statement-breakpoint
CREATE INDEX `mcp_event_deliveries_pending_idx` ON `mcp_event_deliveries` (`available_at`, `created_at`, `id`) WHERE `status` = 'pending';
--> statement-breakpoint
CREATE INDEX `mcp_event_deliveries_processing_lease_idx` ON `mcp_event_deliveries` (`lease_expires_at`, `id`) WHERE `status` = 'processing';
--> statement-breakpoint
CREATE INDEX `mcp_event_deliveries_finished_idx` ON `mcp_event_deliveries` (`updated_at`) WHERE `status` IN ('delivered', 'failed', 'cancelled');
