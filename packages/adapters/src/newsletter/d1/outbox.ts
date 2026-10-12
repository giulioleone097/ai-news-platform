import type { NewsletterOutboxDelivery } from "@atlasnews/core/newsletter/domain/newsletter";
import type { NewsletterOutboxRepository } from "@atlasnews/core/newsletter/domain/ports";
import { D1NewsletterAccess } from "./access";
import {
  type OutboxDeliveryRow,
  refusal,
  rowsOf,
  openOutbox,
  deliveryAuthorized,
  revokedMessage,
} from "./sql";

/** The queue the delivery worker drains. */
export class D1NewsletterOutboxRepository extends D1NewsletterAccess implements NewsletterOutboxRepository {
  async claimOutbox(input: { limit: number; workerId: string; leaseSeconds: number }) {
    const operation = "claim newsletter outbox";
    if (!(input.limit >= 1 && input.limit <= 50)) throw refusal(operation, "Invalid newsletter batch size");
    const workerLength = input.workerId.trim().length;
    if (workerLength < 8 || workerLength > 120) throw refusal(operation, "Invalid newsletter worker id");
    if (!(input.leaseSeconds >= 30 && input.leaseSeconds <= 900)) throw refusal(operation, "Invalid newsletter lease");

    const now = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + input.leaseSeconds * 1000).toISOString();
    const exhausted = `o.status = 'processing' AND o.lease_expires_at <= ?1
      AND (o.dispatch_started_at IS NOT NULL OR o.attempts >= o.max_attempts)`;
    const [, exhaustedOutbox, , , , claimed] = await this.database.batch([
      // Leases that ran out on the last attempt, or after the provider may have been called, are not retried.
      this.statement(
        `UPDATE newsletter_campaign_recipients SET delivery_status = 'failed', last_error = CASE
           WHEN o.dispatch_started_at IS NOT NULL
             THEN 'Delivery outcome is unknown after the provider dispatch lease expired; automatic retry was stopped.'
           ELSE coalesce(o.last_error, 'Delivery lease expired after the final attempt.') END
         FROM newsletter_outbox AS o
         WHERE newsletter_campaign_recipients.id = o.recipient_id AND ${exhausted}`,
        now,
      ),
      this.statement(
        `UPDATE newsletter_outbox AS o SET status = 'dead', worker_id = NULL, lease_expires_at = NULL,
           last_error = CASE
             WHEN o.dispatch_started_at IS NOT NULL
               THEN 'Delivery outcome is unknown after the provider dispatch lease expired; automatic retry was stopped.'
             ELSE coalesce(o.last_error, 'Delivery lease expired after the final attempt.') END
         WHERE ${exhausted}
         RETURNING campaign_id`,
        now,
      ),
      this.statement(
        `UPDATE newsletter_campaigns SET status = 'sending', started_at = coalesce(started_at, ?1)
         WHERE status = 'scheduled' AND scheduled_for <= ?1
           AND EXISTS (
             SELECT 1 FROM newsletter_outbox AS due WHERE due.campaign_id = newsletter_campaigns.id
               AND due.status IN (${openOutbox}))`,
        now,
      ),
      // Replaces FOR UPDATE SKIP LOCKED: SQLite applies one write at a time, so two claims never share a row.
      this.statement(
        `UPDATE newsletter_outbox SET status = 'processing', worker_id = ?2, lease_expires_at = ?3,
           dispatch_started_at = NULL, last_error = NULL
         WHERE id IN (
           SELECT o.id FROM newsletter_outbox AS o
           JOIN newsletter_campaigns AS c ON c.id = o.campaign_id
           WHERE c.status = 'sending' AND o.available_at <= ?1
             AND (o.status IN ('pending', 'retry')
               OR (o.status = 'processing' AND o.lease_expires_at <= ?1 AND o.dispatch_started_at IS NULL))
             AND o.attempts < o.max_attempts
           ORDER BY o.available_at, o.id
           LIMIT ?4)`,
        now,
        input.workerId,
        leaseUntil,
        input.limit,
      ),
      this.statement(
        `UPDATE newsletter_campaign_recipients SET delivery_status = 'sending', last_error = NULL
         WHERE id IN (
           SELECT recipient_id FROM newsletter_outbox
           WHERE worker_id = ?1 AND lease_expires_at = ?2 AND status = 'processing' AND dispatch_started_at IS NULL)`,
        input.workerId,
        leaseUntil,
      ),
      this.statement(
        `SELECT o.id AS outbox_id, o.campaign_id, r.id AS recipient_id, r.subscription_id,
           r.email AS recipient_email, o.idempotency_key, o.attempts + 1 AS attempt, c.locale, c.subject,
           c.preheader, c.from_name, c.from_email, c.reply_to, c.content_markdown
         FROM newsletter_outbox AS o
         JOIN newsletter_campaigns AS c ON c.id = o.campaign_id
         JOIN newsletter_campaign_recipients AS r ON r.id = o.recipient_id
         WHERE o.worker_id = ?1 AND o.lease_expires_at = ?2 AND o.status = 'processing' AND o.dispatch_started_at IS NULL
         ORDER BY o.id`,
        input.workerId,
        leaseUntil,
      ),
    ]);

    // The counts of campaigns that lost recipients to the dead letter state are recomputed right after; a
    // crash in between only delays them to the next event of the campaign.
    const failedCampaigns = [...new Set(rowsOf<{ campaign_id: string }>(exhaustedOutbox).map((row) => row.campaign_id))];
    if (failedCampaigns.length > 0) {
      await this.database.batch(failedCampaigns.flatMap((campaignId) => this.refreshMetrics(campaignId, now)));
    }

    return rowsOf<OutboxDeliveryRow>(claimed).map((row): NewsletterOutboxDelivery => ({
      outboxId: row.outbox_id,
      campaignId: row.campaign_id,
      recipientId: row.recipient_id,
      subscriptionId: row.subscription_id,
      recipientEmail: row.recipient_email,
      idempotencyKey: row.idempotency_key,
      attempt: row.attempt,
      locale: row.locale,
      subject: row.subject,
      preheader: row.preheader,
      fromName: row.from_name,
      fromEmail: row.from_email,
      replyTo: row.reply_to,
      contentMarkdown: row.content_markdown,
    }));
  }

  async startOutboxDelivery(input: { outboxId: number; workerId: string }) {
    const now = new Date().toISOString();
    const leaseHeld = `o.id = ?1 AND o.status = 'processing' AND o.worker_id = ?2 AND o.lease_expires_at > ?3
      AND o.dispatch_started_at IS NULL AND o.attempts < o.max_attempts`;
    const authorized = deliveryAuthorized({ recipientSending: true });
    const [started, , revoked] = await this.database.batch([
      this.statement(
        `UPDATE newsletter_outbox AS o SET attempts = o.attempts + 1, dispatch_started_at = ?3
         WHERE ${leaseHeld} AND ${authorized}`,
        input.outboxId,
        input.workerId,
        now,
      ),
      // Not (or no longer) allowed to send: drop the delivery instead of calling the provider. The recipient is
      // updated first because its statement reads the outbox row that the next one changes.
      this.statement(
        `UPDATE newsletter_campaign_recipients SET delivery_status = 'cancelled', last_error = ?4
         FROM newsletter_outbox AS o
         WHERE ${leaseHeld} AND NOT ${authorized} AND newsletter_campaign_recipients.id = o.recipient_id
           AND newsletter_campaign_recipients.delivery_status IN ('pending', 'sending')`,
        input.outboxId,
        input.workerId,
        now,
        revokedMessage,
      ),
      this.statement(
        `UPDATE newsletter_outbox AS o SET status = 'cancelled', worker_id = NULL, lease_expires_at = NULL,
           dispatch_started_at = NULL, last_error = ?4
         WHERE ${leaseHeld} AND NOT ${authorized}`,
        input.outboxId,
        input.workerId,
        now,
        revokedMessage,
      ),
    ]);
    if (started.meta.changes > 0) return true;
    if (revoked.meta.changes > 0) {
      const row = await this.statement("SELECT campaign_id FROM newsletter_outbox WHERE id = ?1", input.outboxId)
        .first<{ campaign_id: string }>();
      if (row) await this.database.batch(this.refreshMetrics(row.campaign_id, now));
    }
    return false;
  }

  async completeOutbox(input: { outboxId: number; workerId: string; providerMessageId: string }) {
    const row = await this.statement(
      `SELECT campaign_id, status, worker_id, dispatch_started_at, provider_message_id
       FROM newsletter_outbox WHERE id = ?1`,
      input.outboxId,
    ).first<{
      campaign_id: string;
      status: string;
      worker_id: string | null;
      dispatch_started_at: string | null;
      provider_message_id: string | null;
    }>();
    if (!row) return false;
    if (row.status === "sent") return row.provider_message_id === input.providerMessageId;
    if (row.status !== "processing" || row.worker_id !== input.workerId || row.dispatch_started_at === null) {
      return false;
    }

    const now = new Date().toISOString();
    const dispatched = "o.id = ?1 AND o.status = 'processing' AND o.worker_id = ?2 AND o.dispatch_started_at IS NOT NULL";
    const [, completed] = await this.database.batch([
      this.statement(
        `UPDATE newsletter_campaign_recipients SET delivery_status = 'sent', provider_message_id = ?3,
           sent_at = coalesce(newsletter_campaign_recipients.sent_at, ?4)
         FROM newsletter_outbox AS o
         WHERE ${dispatched} AND newsletter_campaign_recipients.id = o.recipient_id`,
        input.outboxId,
        input.workerId,
        input.providerMessageId,
        now,
      ),
      this.statement(
        `UPDATE newsletter_outbox AS o SET status = 'sent', provider_message_id = ?3, sent_at = ?4,
           worker_id = NULL, lease_expires_at = NULL
         WHERE ${dispatched}`,
        input.outboxId,
        input.workerId,
        input.providerMessageId,
        now,
      ),
      ...this.reconcileRecipient(input.providerMessageId, row.campaign_id, now),
    ]);
    return completed.meta.changes > 0;
  }

  async failOutbox(input: {
    outboxId: number;
    workerId: string;
    error: string;
    retryable: boolean;
    retryAfterSeconds: number;
  }) {
    const now = new Date().toISOString();
    const row = await this.statement(
      "SELECT campaign_id FROM newsletter_outbox WHERE id = ?1 AND status = 'processing' AND worker_id = ?2",
      input.outboxId,
      input.workerId,
    ).first<{ campaign_id: string }>();
    if (!row) return false;

    const retryAt = new Date(Date.now() + Math.max(1, Math.min(input.retryAfterSeconds, 86_400)) * 1000).toISOString();
    const message = input.error.slice(0, 2000);
    const owned = "o.id = ?1 AND o.status = 'processing' AND o.worker_id = ?2";
    const authorized = deliveryAuthorized({ recipientSending: false });
    const retry = `(${authorized} AND ?3 = 1 AND o.attempts < o.max_attempts)`;
    const [, failed] = await this.database.batch([
      this.statement(
        `UPDATE newsletter_campaign_recipients SET
           delivery_status = CASE WHEN NOT ${authorized} THEN 'cancelled' WHEN ${retry} THEN 'pending' ELSE 'failed' END,
           last_error = ?5
         FROM newsletter_outbox AS o
         WHERE ${owned} AND newsletter_campaign_recipients.id = o.recipient_id`,
        input.outboxId,
        input.workerId,
        input.retryable ? 1 : 0,
        retryAt,
        message,
      ),
      this.statement(
        `UPDATE newsletter_outbox AS o SET
           status = CASE WHEN NOT ${authorized} THEN 'cancelled' WHEN ${retry} THEN 'retry' ELSE 'dead' END,
           available_at = CASE WHEN ${retry} THEN ?4 ELSE o.available_at END,
           last_error = ?5, worker_id = NULL, lease_expires_at = NULL, dispatch_started_at = NULL
         WHERE ${owned}`,
        input.outboxId,
        input.workerId,
        input.retryable ? 1 : 0,
        retryAt,
        message,
      ),
      ...this.refreshMetrics(row.campaign_id, now),
    ]);
    return failed.meta.changes > 0;
  }
}
