import type { NewsletterProviderEvent } from "@atlasnews/core/newsletter/domain/newsletter";
import type { NewsletterProviderEventRepository } from "@atlasnews/core/newsletter/domain/ports";
import { D1NewsletterAccess } from "./access";
import {
  refusal,
  toIso,
  hashShape,
} from "./sql";

/** What the email provider reports back. */
export class D1NewsletterProviderEventRepository extends D1NewsletterAccess implements NewsletterProviderEventRepository {
  async recordProviderEvent(event: NewsletterProviderEvent) {
    const operation = "record newsletter event";
    const eventAt = toIso(event.occurredAt, operation, "Invalid newsletter event time");
    const now = new Date().toISOString();
    const known = await this.statement(
      "SELECT 1 AS found FROM newsletter_delivery_events WHERE webhook_id = ?1",
      event.webhookId,
    ).first();
    if (known) return false;
    const recipient = await this.statement(
      "SELECT campaign_id FROM newsletter_campaign_recipients WHERE provider_message_id = ?1",
      event.providerMessageId,
    ).first<{ campaign_id: string }>();

    const [inserted] = await this.database.batch([
      this.statement(
        `INSERT INTO newsletter_delivery_events (webhook_id, provider_message_id, event_type, event_at, payload)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (webhook_id) DO NOTHING`,
        event.webhookId,
        event.providerMessageId,
        event.type,
        eventAt,
        JSON.stringify(event.payload),
      ),
      ...this.reconcileRecipient(event.providerMessageId, recipient?.campaign_id ?? null, now),
    ]);
    return inserted.meta.changes > 0;
  }

  async registerSuppression(input: { providerMessageId: string; emailHash: string; reason: "bounce" | "complaint" }) {
    const operation = "register newsletter suppression";
    if (!hashShape.test(input.emailHash) || !["bounce", "complaint"].includes(input.reason)) {
      throw refusal(operation, "Invalid newsletter suppression");
    }
    const recipient = await this.statement(
      "SELECT subscription_id FROM newsletter_campaign_recipients WHERE provider_message_id = ?1",
      input.providerMessageId,
    ).first<{ subscription_id: string | null }>();
    const subscriptionId = recipient?.subscription_id;
    if (!subscriptionId) return false;

    const now = new Date().toISOString();
    const campaignIds = await this.campaignIdsOfSubscription(subscriptionId);
    await this.database.batch([
      this.statement(
        `INSERT INTO newsletter_suppressions (email_hash, reason, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (email_hash) DO UPDATE SET reason = excluded.reason`,
        input.emailHash,
        input.reason,
        now,
      ),
      ...this.cancelDeliveries(subscriptionId, input.providerMessageId),
      this.statement(
        `UPDATE newsletter_subscriptions SET status = 'suppressed', confirmed_at = NULL,
           suppressed_at = coalesce(suppressed_at, ?3), suppression_reason = ?2,
           confirmation_token_hash = NULL, confirmation_expires_at = NULL
         WHERE id = ?1`,
        subscriptionId,
        input.reason,
        now,
      ),
      ...campaignIds.flatMap((campaignId) => this.refreshMetrics(campaignId, now)),
    ]);
    return true;
  }
}
