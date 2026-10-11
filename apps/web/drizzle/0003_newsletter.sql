-- 0003_newsletter: double opt-in subscriptions, suppressions and request limits, campaigns with their recipient snapshot, the delivery outbox and provider events.
CREATE TABLE `newsletter_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`source` text NOT NULL DEFAULT 'site' CHECK (length(`source`) BETWEEN 2 AND 80),
	`locale` text NOT NULL DEFAULT 'en' CHECK (`locale` GLOB '[a-z][a-z]' OR `locale` GLOB '[a-z][a-z]-[A-Z][A-Z]'),
	`status` text NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'active', 'unsubscribed', 'suppressed')),
	`consented_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`unsubscribed_at` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`confirmation_token_hash` text,
	`confirmation_expires_at` text,
	`confirmation_sent_at` text,
	`confirmation_claimed_at` text,
	`confirmation_provider_message_id` text,
	`confirmed_at` text,
	`suppressed_at` text,
	`suppression_reason` text,
	CONSTRAINT `newsletter_email_normalized` UNIQUE (`email`),
	CONSTRAINT `newsletter_email_shape` CHECK (
		`email` = lower(trim(`email`))
		AND length(`email`) - length(replace(`email`, '@', '')) = 1
		AND `email` GLOB '?*@?*.?*'
		AND `email` NOT GLOB '* *'
	),
	CONSTRAINT `newsletter_subscriptions_active_confirmation_check` CHECK (`status` <> 'active' OR `confirmed_at` IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `newsletter_subscriptions_locale_created_idx` ON `newsletter_subscriptions` (`locale`, `created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `newsletter_subscriptions_confirmation_idx` ON `newsletter_subscriptions` (`confirmation_expires_at`, `id`) WHERE `status` = 'pending';
--> statement-breakpoint
CREATE TABLE `newsletter_suppressions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email_hash` text NOT NULL UNIQUE CHECK (length(`email_hash`) = 64 AND `email_hash` NOT GLOB '*[^a-f0-9]*'),
	`reason` text NOT NULL CHECK (`reason` IN ('bounce', 'complaint', 'erasure')),
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE TABLE `newsletter_subscription_request_limits` (
	`scope_key` text PRIMARY KEY NOT NULL CHECK (
		`scope_key` = 'global' OR (length(`scope_key`) = 64 AND `scope_key` NOT GLOB '*[^a-f0-9]*')
	),
	`window_started_at` text NOT NULL,
	`request_count` integer NOT NULL DEFAULT 0 CHECK (`request_count` >= 0),
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `newsletter_subscription_request_limits_updated_idx` ON `newsletter_subscription_request_limits` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `newsletter_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`locale` text NOT NULL CHECK (`locale` IN ('en', 'it')),
	`status` text NOT NULL DEFAULT 'draft' CHECK (`status` IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
	`subject` text NOT NULL CHECK (length(`subject`) BETWEEN 1 AND 200),
	`preheader` text NOT NULL DEFAULT '' CHECK (length(`preheader`) <= 300),
	`from_name` text NOT NULL CHECK (length(`from_name`) BETWEEN 1 AND 120),
	`from_email` text NOT NULL,
	`reply_to` text,
	`content_markdown` text NOT NULL DEFAULT '' CHECK (length(`content_markdown`) <= 200000),
	`content_html` text NOT NULL DEFAULT '' CHECK (length(`content_html`) <= 500000),
	`audience_locale` text NOT NULL CHECK (`audience_locale` IN ('en', 'it')),
	`audience_status` text NOT NULL DEFAULT 'active' CHECK (`audience_status` = 'active'),
	`scheduled_for` text,
	`started_at` text,
	`sent_at` text,
	`cancelled_at` text,
	`recipient_count` integer NOT NULL DEFAULT 0 CHECK (`recipient_count` >= 0),
	`sent_count` integer NOT NULL DEFAULT 0 CHECK (`sent_count` >= 0),
	`delivered_count` integer NOT NULL DEFAULT 0 CHECK (`delivered_count` >= 0),
	`bounce_count` integer NOT NULL DEFAULT 0 CHECK (`bounce_count` >= 0),
	`complaint_count` integer NOT NULL DEFAULT 0 CHECK (`complaint_count` >= 0),
	`open_count` integer NOT NULL DEFAULT 0 CHECK (`open_count` >= 0),
	`click_count` integer NOT NULL DEFAULT 0 CHECK (`click_count` >= 0),
	`failure_count` integer NOT NULL DEFAULT 0 CHECK (`failure_count` >= 0),
	-- The editor's id as the delivery layer knows it. Not a foreign key: editors are not keyed by it on Sites.
	`created_by` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT `newsletter_campaign_from_email_shape` CHECK (
		`from_email` = lower(trim(`from_email`))
		AND length(`from_email`) - length(replace(`from_email`, '@', '')) = 1
		AND `from_email` GLOB '?*@?*.?*'
		AND `from_email` NOT GLOB '* *'
	),
	CONSTRAINT `newsletter_campaign_reply_to_shape` CHECK (
		`reply_to` IS NULL OR (
			`reply_to` = lower(trim(`reply_to`))
			AND length(`reply_to`) - length(replace(`reply_to`, '@', '')) = 1
			AND `reply_to` GLOB '?*@?*.?*'
			AND `reply_to` NOT GLOB '* *'
		)
	),
	CONSTRAINT `newsletter_campaign_schedule_state` CHECK (`status` <> 'scheduled' OR `scheduled_for` IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `newsletter_campaigns_locale_created_idx` ON `newsletter_campaigns` (`locale`, `created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `newsletter_campaigns_scheduled_idx` ON `newsletter_campaigns` (`scheduled_for`, `id`) WHERE `status` = 'scheduled';
--> statement-breakpoint
CREATE TABLE `newsletter_campaign_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL REFERENCES `newsletter_campaigns`(`id`) ON DELETE CASCADE,
	`subscription_id` text REFERENCES `newsletter_subscriptions`(`id`) ON DELETE SET NULL,
	`email` text NOT NULL,
	`locale` text NOT NULL CHECK (`locale` IN ('en', 'it')),
	`delivery_status` text NOT NULL DEFAULT 'pending' CHECK (
		`delivery_status` IN ('pending', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'cancelled')
	),
	`provider_message_id` text,
	`sent_at` text,
	`delivered_at` text,
	`bounced_at` text,
	`complained_at` text,
	`opened_at` text,
	`clicked_at` text,
	`last_error` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT `newsletter_recipient_email_shape` CHECK (
		`email` = lower(trim(`email`))
		AND length(`email`) - length(replace(`email`, '@', '')) = 1
		AND `email` GLOB '?*@?*.?*'
		AND `email` NOT GLOB '* *'
	),
	CONSTRAINT `newsletter_recipient_campaign_subscription_key` UNIQUE (`campaign_id`, `subscription_id`),
	CONSTRAINT `newsletter_recipient_campaign_email_key` UNIQUE (`campaign_id`, `email`),
	CONSTRAINT `newsletter_recipient_provider_message_key` UNIQUE (`provider_message_id`)
);
--> statement-breakpoint
CREATE INDEX `newsletter_recipients_campaign_status_idx` ON `newsletter_campaign_recipients` (`campaign_id`, `delivery_status`, `id`);
--> statement-breakpoint
CREATE INDEX `newsletter_recipients_subscription_idx` ON `newsletter_campaign_recipients` (`subscription_id`);
--> statement-breakpoint
CREATE TABLE `newsletter_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL REFERENCES `newsletter_campaigns`(`id`) ON DELETE CASCADE,
	`recipient_id` text NOT NULL REFERENCES `newsletter_campaign_recipients`(`id`) ON DELETE CASCADE,
	`status` text NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'processing', 'retry', 'sent', 'dead', 'cancelled')),
	`attempts` integer NOT NULL DEFAULT 0 CHECK (`attempts` BETWEEN 0 AND 20),
	`max_attempts` integer NOT NULL DEFAULT 5 CHECK (`max_attempts` BETWEEN 1 AND 20),
	`available_at` text NOT NULL,
	`lease_expires_at` text,
	`worker_id` text,
	`idempotency_key` text NOT NULL CHECK (length(`idempotency_key`) BETWEEN 1 AND 256),
	`provider_message_id` text,
	`last_error` text,
	`dispatch_started_at` text,
	`sent_at` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT `newsletter_outbox_recipient_key` UNIQUE (`recipient_id`),
	CONSTRAINT `newsletter_outbox_idempotency_key` UNIQUE (`idempotency_key`),
	CONSTRAINT `newsletter_outbox_provider_message_key` UNIQUE (`provider_message_id`)
);
--> statement-breakpoint
CREATE INDEX `newsletter_outbox_campaign_idx` ON `newsletter_outbox` (`campaign_id`);
--> statement-breakpoint
CREATE INDEX `newsletter_outbox_ready_idx` ON `newsletter_outbox` (`available_at`, `id`) WHERE `status` IN ('pending', 'retry', 'processing');
--> statement-breakpoint
CREATE TABLE `newsletter_delivery_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`webhook_id` text NOT NULL UNIQUE CHECK (length(`webhook_id`) BETWEEN 1 AND 255),
	`provider_message_id` text NOT NULL CHECK (length(`provider_message_id`) BETWEEN 1 AND 255),
	`event_type` text NOT NULL CHECK (length(`event_type`) BETWEEN 1 AND 100),
	`event_at` text NOT NULL,
	`campaign_id` text REFERENCES `newsletter_campaigns`(`id`) ON DELETE SET NULL,
	`recipient_id` text REFERENCES `newsletter_campaign_recipients`(`id`) ON DELETE SET NULL,
	`payload` text NOT NULL CHECK (json_valid(`payload`)),
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE INDEX `newsletter_events_provider_idx` ON `newsletter_delivery_events` (`provider_message_id`, `event_at`, `id`);
--> statement-breakpoint
CREATE INDEX `newsletter_events_campaign_idx` ON `newsletter_delivery_events` (`campaign_id`, `event_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `newsletter_events_recipient_idx` ON `newsletter_delivery_events` (`recipient_id`, `event_at`, `id`);
--> statement-breakpoint
-- Like the Postgres set_updated_at triggers: any update that does not set `updated_at` itself refreshes it.
CREATE TRIGGER `newsletter_campaigns_set_updated_at` AFTER UPDATE ON `newsletter_campaigns` FOR EACH ROW WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
	UPDATE `newsletter_campaigns` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `newsletter_recipients_set_updated_at` AFTER UPDATE ON `newsletter_campaign_recipients` FOR EACH ROW WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
	UPDATE `newsletter_campaign_recipients` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `newsletter_outbox_set_updated_at` AFTER UPDATE ON `newsletter_outbox` FOR EACH ROW WHEN NEW.`updated_at` = OLD.`updated_at`
BEGIN
	UPDATE `newsletter_outbox` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` = NEW.`id`;
END;
