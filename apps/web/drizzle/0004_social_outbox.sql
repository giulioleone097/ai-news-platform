-- 0004_social_outbox: the social publishing outbox, one leased job per distribution publication.
CREATE TABLE `social_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL UNIQUE REFERENCES `social_publications`(`id`) ON DELETE CASCADE,
	`provider` text NOT NULL CHECK (`provider` IN ('linkedin', 'x', 'whatsapp')),
	`idempotency_key` text NOT NULL UNIQUE CHECK (
		length(`idempotency_key`) BETWEEN 16 AND 160
		AND `idempotency_key` GLOB '[A-Za-z0-9]*'
		AND `idempotency_key` NOT GLOB '*[^A-Za-z0-9:._/-]*'
	),
	`payload` text NOT NULL CHECK (
		json_valid(`payload`) AND json_type(`payload`) = 'object' AND length(CAST(`payload` AS BLOB)) <= 16384
	),
	`status` text NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
	`attempts` integer NOT NULL DEFAULT 0 CHECK (`attempts` BETWEEN 0 AND 100),
	`max_attempts` integer NOT NULL DEFAULT 5 CHECK (`max_attempts` BETWEEN 1 AND 10),
	`available_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`lease_token` text,
	`lease_expires_at` text,
	`dispatch_started_at` text,
	`provider_message_id` text CHECK (length(`provider_message_id`) <= 512),
	`provider_url` text CHECK (length(`provider_url`) <= 2048),
	`provider_status` text CHECK (length(`provider_status`) <= 80),
	`provider_status_at` text,
	`revision` integer NOT NULL DEFAULT 0 CHECK (`revision` >= 0),
	`requeue_source_revision` integer CHECK (`requeue_source_revision` >= 0),
	`retry_safe` integer NOT NULL DEFAULT 1 CHECK (`retry_safe` IN (0, 1)),
	`last_error_code` text CHECK (length(`last_error_code`) <= 80),
	`last_error_message` text CHECK (length(`last_error_message`) <= 400),
	`sent_at` text,
	`failed_at` text,
	`delivered_at` text,
	`read_at` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT `social_outbox_lease_state_check` CHECK (
		(`status` = 'processing' AND `lease_token` IS NOT NULL AND `lease_expires_at` IS NOT NULL)
		OR (`status` <> 'processing' AND `lease_token` IS NULL AND `lease_expires_at` IS NULL)
	)
);
--> statement-breakpoint
CREATE INDEX `social_outbox_pending_idx` ON `social_outbox` (`available_at`, `created_at`, `id`) WHERE `status` = 'pending';
--> statement-breakpoint
CREATE INDEX `social_outbox_processing_lease_idx` ON `social_outbox` (`lease_expires_at`, `id`) WHERE `status` = 'processing';
--> statement-breakpoint
CREATE INDEX `social_outbox_created_idx` ON `social_outbox` (`created_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_outbox_provider_message_idx` ON `social_outbox` (`provider`, `provider_message_id`) WHERE `provider_message_id` IS NOT NULL;
