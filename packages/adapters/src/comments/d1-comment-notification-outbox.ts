import { CommentOperationError } from "@atlasnews/core/comments/application/errors";
import type { CommentNotificationOutbox } from "@atlasnews/core/comments/application/notification-outbox";
import type { CommentLocale, CommentNotificationKind } from "@atlasnews/core/comments/domain/comment";
import type { D1Database } from "../sites/cloudflare";

type NotificationRow = {
  id: string;
  subscription_id: string;
  comment_id: string | null;
  kind: CommentNotificationKind;
  recipient_email: string;
  locale: CommentLocale;
  payload: string;
  attempts: number;
};

const workerIdPattern = /^[a-zA-Z0-9:_-]{2,100}$/;
/** A claim that no worker finished within this long is handed to another worker. */
const leaseSeconds = 15 * 60;

const unavailable = (message: string) => new CommentOperationError("storage_error", message, 503);
const plusSeconds = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1_000).toISOString();

/** The delivery queue of comment notifications on D1: lease, dispatch boundary, completion with backoff. */
export class D1CommentNotificationOutbox implements CommentNotificationOutbox {
  constructor(private readonly database: D1Database) {}

  async claim(workerId: string, limit: number) {
    const worker = workerId.trim();
    if (!workerIdPattern.test(worker) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw unavailable("Notification outbox is unavailable.");
    }
    try {
      const now = new Date().toISOString();
      // One UPDATE picks and leases the rows, so two concurrent claims never receive the same one.
      const { results } = await this.database
        .prepare(
          `UPDATE comment_notifications SET status = 'processing', attempts = attempts + 1, locked_at = ?,
             worker_id = ?, dispatch_started_at = NULL, last_error = NULL
           WHERE id IN (
             SELECT id FROM comment_notifications
             WHERE (status IN ('pending', 'failed') OR (status = 'processing' AND locked_at < ?))
               AND available_at <= ? AND attempts < 20
             ORDER BY available_at, created_at, id LIMIT ?)
           RETURNING id, subscription_id, comment_id, kind, recipient_email, locale, payload, attempts`,
        )
        .bind(now, worker, plusSeconds(now, -leaseSeconds), now, limit)
        .all<NotificationRow>();
      return results.map((row) => ({
        id: row.id,
        subscriptionId: row.subscription_id,
        commentId: row.comment_id,
        kind: row.kind,
        recipientEmail: row.recipient_email,
        locale: row.locale,
        payload: JSON.parse(row.payload) as Record<string, unknown>,
        attempts: row.attempts,
      }));
    } catch {
      throw unavailable("Notification outbox is unavailable.");
    }
  }

  async start(input: { id: string; workerId: string }) {
    const worker = input.workerId.trim();
    if (!workerIdPattern.test(worker)) throw unavailable("Notification dispatch boundary failed.");
    try {
      const now = new Date().toISOString();
      // Marks the send as started only while the subscription still wants it; otherwise the second
      // statement cancels the notification (it only matches when the first one did not start it).
      const [started] = await this.database.batch([
        this.database
          .prepare(
            `UPDATE comment_notifications SET dispatch_started_at = ?
             WHERE id = ? AND status = 'processing' AND worker_id = ? AND dispatch_started_at IS NULL
               AND EXISTS (
                 SELECT 1 FROM comment_notification_subscriptions s
                 WHERE s.id = comment_notifications.subscription_id AND s.unsubscribed_at IS NULL
                   AND ((comment_notifications.kind = 'verification' AND s.verified_at IS NULL AND s.verification_expires_at >= ?)
                     OR (comment_notifications.kind IN ('reply', 'moderation') AND s.verified_at IS NOT NULL)))`,
          )
          .bind(now, input.id, worker, now),
        this.database
          .prepare(
            `UPDATE comment_notifications SET status = 'cancelled', processed_at = ?, locked_at = NULL, worker_id = NULL
             WHERE id = ? AND status = 'processing' AND worker_id = ? AND dispatch_started_at IS NULL`,
          )
          .bind(now, input.id, worker),
      ]);
      return (started?.meta.changes ?? 0) > 0;
    } catch {
      throw unavailable("Notification dispatch boundary failed.");
    }
  }

  async complete(input: {
    id: string;
    workerId: string;
    succeeded: boolean;
    providerMessageId?: string | null;
    error?: string | null;
  }) {
    const failure = () => unavailable("Notification outbox update failed.");
    try {
      const now = new Date().toISOString();
      const ok = input.succeeded ? 1 : 0;
      const { meta } = await this.database
        .prepare(
          `UPDATE comment_notifications SET
             status = CASE WHEN ? THEN 'sent' ELSE 'failed' END,
             provider_message_id = CASE WHEN ? THEN nullif(trim(?), '') ELSE NULL END,
             last_error = CASE WHEN ? THEN NULL ELSE substr(coalesce(trim(?), 'delivery failed'), 1, 1000) END,
             available_at = CASE WHEN ? THEN available_at ELSE strftime(
               '%Y-%m-%dT%H:%M:%fZ', ?, '+' || min(3600, 30 * (1 << min(attempts, 7))) || ' seconds') END,
             processed_at = CASE WHEN ? THEN ? ELSE NULL END,
             locked_at = NULL, worker_id = NULL,
             dispatch_started_at = CASE WHEN ? THEN dispatch_started_at ELSE NULL END
           WHERE id = ? AND status = 'processing' AND worker_id = ? AND dispatch_started_at IS NOT NULL`,
        )
        .bind(ok, ok, input.providerMessageId ?? null, ok, input.error ?? null, ok, now, ok, now, ok, input.id, input.workerId.trim())
        .run();
      if (meta.changes === 0) throw failure();
    } catch (error) {
      throw error instanceof CommentOperationError ? error : failure();
    }
  }
}
