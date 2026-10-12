import type { D1Database } from "../../sites/cloudflare";
import {
  openOutbox,
  cancellableOutbox,
  dispatchInFlight,
  hasEvent,
  eventTime,
} from "./sql";

/** What every D1 newsletter port needs: the database and the statements that several operations repeat. */
export class D1NewsletterAccess {
  constructor(protected readonly database: D1Database) {}

  protected statement(text: string, ...values: unknown[]) {
    return this.database.prepare(text).bind(...values);
  }

  protected async campaignIdsOfSubscription(subscriptionId: string) {
    const { results } = await this.statement(
      "SELECT DISTINCT campaign_id FROM newsletter_campaign_recipients WHERE subscription_id = ?1",
      subscriptionId,
    ).all<{ campaign_id: string }>();
    return results.map((row) => row.campaign_id);
  }

  /** refresh_newsletter_campaign_metrics: recount from the recipients and events, and close a drained campaign. */
  protected refreshMetrics(campaignId: string, now: string) {
    return [
      this.statement(
        `UPDATE newsletter_campaigns SET
           recipient_count = m.recipient_count, sent_count = m.sent_count, delivered_count = m.delivered_count,
           bounce_count = m.bounce_count, complaint_count = m.complaint_count, failure_count = m.failure_count,
           open_count = e.open_count, click_count = e.click_count
         FROM (
           SELECT count(*) AS recipient_count,
             coalesce(sum(delivery_status IN ('sent', 'delivered', 'bounced', 'complained')), 0) AS sent_count,
             coalesce(sum(delivery_status = 'delivered'), 0) AS delivered_count,
             coalesce(sum(delivery_status = 'bounced'), 0) AS bounce_count,
             coalesce(sum(delivery_status = 'complained'), 0) AS complaint_count,
             coalesce(sum(delivery_status = 'failed'), 0) AS failure_count
           FROM newsletter_campaign_recipients WHERE campaign_id = ?1
         ) AS m, (
           SELECT coalesce(sum(event_type = 'email.opened'), 0) AS open_count,
             coalesce(sum(event_type = 'email.clicked'), 0) AS click_count
           FROM newsletter_delivery_events WHERE campaign_id = ?1
         ) AS e
         WHERE newsletter_campaigns.id = ?1`,
        campaignId,
      ),
      this.statement(
        `UPDATE newsletter_campaigns SET status = 'sent', sent_at = coalesce(sent_at, ?2)
         WHERE id = ?1 AND status IN ('scheduled', 'sending')
           AND NOT EXISTS (
             SELECT 1 FROM newsletter_outbox WHERE campaign_id = ?1 AND status IN (${openOutbox}))`,
        campaignId,
        now,
      ),
    ];
  }

  protected cancelOutbox(subscriptionId: string) {
    return this.statement(
      `UPDATE newsletter_outbox AS o SET status = 'cancelled', worker_id = NULL, lease_expires_at = NULL
       WHERE o.recipient_id IN (SELECT id FROM newsletter_campaign_recipients WHERE subscription_id = ?1)
         AND ${cancellableOutbox}`,
      subscriptionId,
    );
  }

  /** Stops the queued mail of a subscriber, except what may already be in flight at the provider. */
  protected cancelDeliveries(subscriptionId: string, exceptMessageId: string | null = null) {
    return [
      this.cancelOutbox(subscriptionId),
      this.statement(
        `UPDATE newsletter_campaign_recipients AS r SET delivery_status = 'cancelled'
         WHERE r.subscription_id = ?1 AND r.delivery_status IN ('pending', 'sending')
           AND (?2 IS NULL OR r.provider_message_id IS NOT ?2)
           AND NOT ${dispatchInFlight("r.id")}`,
        subscriptionId,
        exceptMessageId,
      ),
    ];
  }

  /** reconcile_newsletter_recipient: derive a recipient's state from the events of its provider message. */
  protected reconcileRecipient(providerMessageId: string, campaignId: string | null, now: string) {
    const statements = [
      this.statement(
        `UPDATE newsletter_delivery_events SET campaign_id = r.campaign_id, recipient_id = r.id
         FROM newsletter_campaign_recipients AS r
         WHERE r.provider_message_id = ?1 AND newsletter_delivery_events.provider_message_id = ?1
           AND newsletter_delivery_events.recipient_id IS NULL`,
        providerMessageId,
      ),
      this.statement(
        `UPDATE newsletter_campaign_recipients SET
           delivery_status = CASE
             WHEN ${hasEvent("email.complained")} THEN 'complained'
             WHEN ${hasEvent("email.bounced")} THEN 'bounced'
             WHEN ${hasEvent("email.delivered")} THEN 'delivered'
             WHEN ${hasEvent("email.failed", "email.suppressed")} THEN 'failed'
             ELSE 'sent' END,
           delivered_at = ${eventTime("max", "email.delivered")},
           bounced_at = ${eventTime("max", "email.bounced")},
           complained_at = ${eventTime("max", "email.complained")},
           opened_at = ${eventTime("min", "email.opened")},
           clicked_at = ${eventTime("min", "email.clicked")}
         WHERE provider_message_id = ?1`,
        providerMessageId,
      ),
      this.statement(
        `UPDATE newsletter_subscriptions SET
           status = 'suppressed', confirmed_at = NULL, suppressed_at = coalesce(suppressed_at, ?2),
           suppression_reason = CASE r.delivery_status WHEN 'bounced' THEN 'bounce' ELSE 'complaint' END,
           confirmation_token_hash = NULL, confirmation_expires_at = NULL
         FROM newsletter_campaign_recipients AS r
         WHERE r.provider_message_id = ?1 AND r.delivery_status IN ('bounced', 'complained')
           AND newsletter_subscriptions.id = r.subscription_id`,
        providerMessageId,
        now,
      ),
    ];
    return campaignId ? [...statements, ...this.refreshMetrics(campaignId, now)] : statements;
  }
}
