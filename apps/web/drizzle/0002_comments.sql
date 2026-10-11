-- 0002_comments: comments, reports, the append-only moderation audit, rate-limit buckets and comment notification subscriptions and outbox.
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL REFERENCES `articles`(`id`) ON DELETE CASCADE,
	`locale` text NOT NULL CHECK (`locale` IN ('en', 'it')),
	`parent_id` text REFERENCES `comments`(`id`) ON DELETE RESTRICT,
	`body` text NOT NULL CHECK (length(`body`) BETWEEN 1 AND 4000),
	`author_display_name` text NOT NULL CHECK (length(`author_display_name`) BETWEEN 2 AND 60),
	`author_kind` text NOT NULL CHECK (`author_kind` IN ('authenticated', 'guest')),
	`author_user_id` text,
	`guest_identity_hash` text,
	`status` text NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'approved', 'rejected', 'spam', 'deleted')),
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`edited_at` text,
	`deleted_at` text,
	CONSTRAINT `comments_actor_shape_check` CHECK (
		(`author_kind` = 'authenticated' AND `author_user_id` IS NOT NULL AND `guest_identity_hash` IS NULL)
		OR (`author_kind` = 'guest' AND `author_user_id` IS NULL AND length(`guest_identity_hash`) = 64
			AND `guest_identity_hash` NOT GLOB '*[^0-9a-f]*')
	),
	CONSTRAINT `comments_deleted_state_check` CHECK (`status` <> 'deleted' OR `deleted_at` IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `comment_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL REFERENCES `comments`(`id`) ON DELETE CASCADE,
	`reporter_kind` text NOT NULL CHECK (`reporter_kind` IN ('authenticated', 'guest')),
	`reporter_user_id` text,
	`reporter_guest_identity_hash` text,
	`reason` text NOT NULL CHECK (`reason` IN ('spam', 'harassment', 'hate', 'misinformation', 'privacy', 'other')),
	`details` text CHECK (`details` IS NULL OR length(`details`) <= 500),
	`status` text NOT NULL DEFAULT 'open' CHECK (`status` IN ('open', 'resolved', 'dismissed')),
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`resolved_at` text,
	`resolved_by` text,
	CONSTRAINT `comment_reports_actor_shape_check` CHECK (
		(`reporter_kind` = 'authenticated' AND `reporter_user_id` IS NOT NULL AND `reporter_guest_identity_hash` IS NULL)
		OR (`reporter_kind` = 'guest' AND `reporter_user_id` IS NULL AND length(`reporter_guest_identity_hash`) = 64
			AND `reporter_guest_identity_hash` NOT GLOB '*[^0-9a-f]*')
	)
);
--> statement-breakpoint
CREATE TABLE `comment_moderation_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comment_id` text REFERENCES `comments`(`id`) ON DELETE SET NULL,
	`action` text NOT NULL CHECK (`action` IN (
		'created', 'edited', 'owner_deleted', 'reported',
		'approved', 'rejected', 'marked_spam', 'moderator_deleted'
	)),
	`actor_kind` text NOT NULL CHECK (`actor_kind` IN ('authenticated', 'guest', 'moderator', 'system')),
	`actor_user_id` text,
	`actor_label` text CHECK (`actor_label` IS NULL OR length(`actor_label`) BETWEEN 2 AND 80),
	`previous_status` text CHECK (`previous_status` IS NULL OR `previous_status` IN ('pending', 'approved', 'rejected', 'spam', 'deleted')),
	`next_status` text CHECK (`next_status` IS NULL OR `next_status` IN ('pending', 'approved', 'rejected', 'spam', 'deleted')),
	`reason` text CHECK (`reason` IS NULL OR length(`reason`) <= 500),
	`metadata` text NOT NULL DEFAULT '{}' CHECK (json_valid(`metadata`)),
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE TABLE `comment_rate_limits` (
	`identity_hash` text NOT NULL CHECK (length(`identity_hash`) = 64 AND `identity_hash` NOT GLOB '*[^0-9a-f]*'),
	`action` text NOT NULL CHECK (length(`action`) BETWEEN 2 AND 40 AND `action` NOT GLOB '*[^a-z_]*'),
	`window_started_at` text NOT NULL,
	`hits` integer NOT NULL DEFAULT 1 CHECK (`hits` > 0),
	`max_hits` integer NOT NULL CHECK (`max_hits` BETWEEN 1 AND 1000),
	`expires_at` text NOT NULL,
	PRIMARY KEY (`identity_hash`, `action`, `window_started_at`),
	-- Raised when a bucket's counter passes its limit; it aborts the whole batch the hit belongs to.
	CONSTRAINT `comment_rate_limited` CHECK (`hits` <= `max_hits`)
);
--> statement-breakpoint
CREATE TABLE `comment_notification_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL UNIQUE REFERENCES `comments`(`id`) ON DELETE CASCADE,
	`email` text NOT NULL CHECK (
		`email` = lower(trim(`email`))
		AND length(`email`) <= 254
		AND length(`email`) - length(replace(`email`, '@', '')) = 1
		AND `email` GLOB '?*@?*.?*'
		AND `email` NOT GLOB '*[ 	]*'
	),
	`email_hash` text NOT NULL CHECK (length(`email_hash`) = 64 AND `email_hash` NOT GLOB '*[^0-9a-f]*'),
	`verification_token_hash` text NOT NULL CHECK (length(`verification_token_hash`) = 64 AND `verification_token_hash` NOT GLOB '*[^0-9a-f]*'),
	`verification_expires_at` text NOT NULL,
	`verified_at` text,
	`notify_on_replies` integer NOT NULL DEFAULT 1 CHECK (`notify_on_replies` IN (0, 1)),
	`notify_on_moderation` integer NOT NULL DEFAULT 1 CHECK (`notify_on_moderation` IN (0, 1)),
	`unsubscribed_at` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CONSTRAINT `comment_notification_preference_check` CHECK (`notify_on_replies` = 1 OR `notify_on_moderation` = 1)
);
--> statement-breakpoint
CREATE TABLE `comment_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL REFERENCES `comment_notification_subscriptions`(`id`) ON DELETE CASCADE,
	`comment_id` text REFERENCES `comments`(`id`) ON DELETE SET NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('verification', 'reply', 'moderation')),
	`recipient_email` text NOT NULL CHECK (length(`recipient_email`) <= 254),
	`recipient_email_hash` text NOT NULL CHECK (length(`recipient_email_hash`) = 64 AND `recipient_email_hash` NOT GLOB '*[^0-9a-f]*'),
	`locale` text NOT NULL CHECK (`locale` IN ('en', 'it')),
	`payload` text NOT NULL DEFAULT '{}' CHECK (json_valid(`payload`)),
	`dedupe_key` text NOT NULL UNIQUE CHECK (length(`dedupe_key`) BETWEEN 8 AND 180),
	`status` text NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
	`attempts` integer NOT NULL DEFAULT 0 CHECK (`attempts` BETWEEN 0 AND 20),
	`available_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`locked_at` text,
	`worker_id` text CHECK (`worker_id` IS NULL OR length(`worker_id`) BETWEEN 2 AND 100),
	`dispatch_started_at` text,
	`provider_message_id` text,
	`last_error` text CHECK (`last_error` IS NULL OR length(`last_error`) <= 1000),
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`processed_at` text
);
--> statement-breakpoint
CREATE INDEX `comments_public_roots_idx` ON `comments` (`article_id`, `locale`, `created_at` DESC, `id` DESC) WHERE `status` = 'approved' AND `parent_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `comments_public_replies_idx` ON `comments` (`parent_id`, `created_at` DESC, `id` DESC) WHERE `status` = 'approved' AND `parent_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `comments_moderation_queue_idx` ON `comments` (`status`, `created_at` DESC, `id` DESC) WHERE `status` IN ('pending', 'rejected', 'spam');
--> statement-breakpoint
CREATE INDEX `comments_article_id_idx` ON `comments` (`article_id`);
--> statement-breakpoint
CREATE INDEX `comments_parent_id_idx` ON `comments` (`parent_id`) WHERE `parent_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `comments_author_user_id_idx` ON `comments` (`author_user_id`) WHERE `author_user_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `comments_guest_identity_idx` ON `comments` (`guest_identity_hash`) WHERE `guest_identity_hash` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_reports_user_once_idx` ON `comment_reports` (`comment_id`, `reporter_user_id`) WHERE `reporter_user_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_reports_guest_once_idx` ON `comment_reports` (`comment_id`, `reporter_guest_identity_hash`) WHERE `reporter_guest_identity_hash` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `comment_reports_comment_status_idx` ON `comment_reports` (`comment_id`, `status`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX `comment_audit_comment_id_idx` ON `comment_moderation_audit` (`comment_id`, `id` DESC);
--> statement-breakpoint
CREATE INDEX `comment_rate_limits_expiry_idx` ON `comment_rate_limits` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `comment_notification_email_hash_idx` ON `comment_notification_subscriptions` (`email_hash`);
--> statement-breakpoint
CREATE INDEX `comment_notifications_delivery_idx` ON `comment_notifications` (`available_at`, `created_at`, `id`) WHERE `status` IN ('pending', 'failed', 'processing');
--> statement-breakpoint
-- A comment carries the locale of its article (Postgres used a composite foreign key on (id, locale)).
CREATE TRIGGER `comments_enforce_article_locale_insert` BEFORE INSERT ON `comments`
WHEN NOT EXISTS (SELECT 1 FROM `articles` a WHERE a.`id` = NEW.`article_id` AND a.`locale` = NEW.`locale`)
BEGIN
	SELECT RAISE(ABORT, 'comment_article_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `comments_enforce_article_locale_update` BEFORE UPDATE OF `article_id`, `locale` ON `comments`
WHEN NOT EXISTS (SELECT 1 FROM `articles` a WHERE a.`id` = NEW.`article_id` AND a.`locale` = NEW.`locale`)
BEGIN
	SELECT RAISE(ABORT, 'comment_article_invalid');
END;
--> statement-breakpoint
-- A reply hangs off a root comment of the same article and locale; replies to replies are refused.
CREATE TRIGGER `comments_enforce_parent_depth_insert` BEFORE INSERT ON `comments`
WHEN NEW.`parent_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `comments` p
	WHERE p.`id` = NEW.`parent_id` AND p.`parent_id` IS NULL
		AND p.`article_id` = NEW.`article_id` AND p.`locale` = NEW.`locale`
)
BEGIN
	SELECT RAISE(ABORT, 'comment_parent_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `comments_enforce_parent_depth_update` BEFORE UPDATE OF `parent_id`, `article_id`, `locale` ON `comments`
WHEN NEW.`parent_id` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `comments` p
	WHERE p.`id` = NEW.`parent_id` AND p.`parent_id` IS NULL
		AND p.`article_id` = NEW.`article_id` AND p.`locale` = NEW.`locale`
)
BEGIN
	SELECT RAISE(ABORT, 'comment_parent_invalid');
END;
--> statement-breakpoint
-- The audit trail only grows; the one permitted change is the ON DELETE SET NULL of its comment reference.
CREATE TRIGGER `comment_moderation_audit_no_update` BEFORE UPDATE ON `comment_moderation_audit`
WHEN NEW.`comment_id` IS NOT NULL
	OR NEW.`id` IS NOT OLD.`id` OR NEW.`action` IS NOT OLD.`action` OR NEW.`actor_kind` IS NOT OLD.`actor_kind`
	OR NEW.`actor_user_id` IS NOT OLD.`actor_user_id` OR NEW.`actor_label` IS NOT OLD.`actor_label`
	OR NEW.`previous_status` IS NOT OLD.`previous_status` OR NEW.`next_status` IS NOT OLD.`next_status`
	OR NEW.`reason` IS NOT OLD.`reason` OR NEW.`metadata` IS NOT OLD.`metadata` OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
	SELECT RAISE(ABORT, 'comment_audit_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER `comment_moderation_audit_no_delete` BEFORE DELETE ON `comment_moderation_audit`
BEGIN
	SELECT RAISE(ABORT, 'comment_audit_append_only');
END;
