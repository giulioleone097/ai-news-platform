import type { NewsletterSubscriptionFlowRepository } from "@atlasnews/core/newsletter/domain/ports";
import { D1NewsletterAccess } from "./access";
import {
  refusal,
  rowsOf,
  toIso,
  addressShape,
  hashShape,
  sourceShape,
  dispatchInFlight,
  requesterLimit,
  globalLimit,
  countRequest,
  withinRequesterLimit,
} from "./sql";

/** A reader's subscription: the double opt-in, unsubscribing and erasure. */
export class D1NewsletterSubscriptionFlowRepository extends D1NewsletterAccess implements NewsletterSubscriptionFlowRepository {
  async requestSubscription(input: {
    email: string;
    source: string;
    locale: "en" | "it";
    tokenHash: string;
    emailHash: string;
    requestFingerprint: string;
    expiresAt: string;
  }) {
    const operation = "request newsletter subscription";
    const email = input.email.trim().toLowerCase();
    const source = input.source.trim();
    if (email.length > 254 || !addressShape.test(email)) throw refusal(operation, "Invalid newsletter email");
    if (!sourceShape.test(source)) throw refusal(operation, "Invalid newsletter source");
    if (input.locale !== "en" && input.locale !== "it") throw refusal(operation, "Invalid newsletter locale");
    if (![input.tokenHash, input.emailHash, input.requestFingerprint].every((hash) => hashShape.test(hash))) {
      throw refusal(operation, "Invalid newsletter token");
    }
    const nowMs = Date.now();
    const expiresAt = toIso(input.expiresAt, operation, "Invalid newsletter confirmation expiry");
    const now = new Date(nowMs).toISOString();
    if (expiresAt <= now || expiresAt > new Date(nowMs + 48 * 3_600_000).toISOString()) {
      throw refusal(operation, "Invalid newsletter confirmation expiry");
    }

    const suppressed = await this.statement(
      "SELECT 1 AS found FROM newsletter_suppressions WHERE email_hash = ?1",
      input.emailHash,
    ).first();
    if (suppressed) return { subscriptionId: null, status: "suppressed", shouldSend: false };

    const existing = await this.statement(
      `SELECT id, status, confirmation_claimed_at, confirmation_sent_at
       FROM newsletter_subscriptions WHERE email = ?1`,
      email,
    ).first<{
      id: string;
      status: string;
      confirmation_claimed_at: string | null;
      confirmation_sent_at: string | null;
    }>();
    const recentlyAsked = new Date(nowMs - 5 * 60_000).toISOString();
    if (existing && (existing.status === "active" || existing.status === "suppressed")) {
      return { subscriptionId: existing.id, status: existing.status, shouldSend: false };
    }
    if (
      existing?.status === "pending"
      && ((existing.confirmation_claimed_at ?? "") > recentlyAsked || (existing.confirmation_sent_at ?? "") > recentlyAsked)
    ) {
      return { subscriptionId: existing.id, status: existing.status, shouldSend: false };
    }

    // Fixed windows: ten minutes per requester, one minute for the whole site. The site counter only moves while
    // the requester is within its limit, and the subscription is only written while both are.
    const requesterWindow = new Date(Math.floor(nowMs / 600_000) * 600_000).toISOString();
    const globalWindow = new Date(Math.floor(nowMs / 60_000) * 60_000).toISOString();
    const [, requester, site, , stored] = await this.database.batch([
      this.statement(
        `DELETE FROM newsletter_subscription_request_limits WHERE scope_key IN (
           SELECT scope_key FROM newsletter_subscription_request_limits
           WHERE scope_key <> 'global' AND updated_at < ?1 ORDER BY updated_at LIMIT 16)`,
        new Date(nowMs - 30 * 86_400_000).toISOString(),
      ),
      this.statement(countRequest("?1", "true"), input.requestFingerprint, requesterWindow, now),
      this.statement(
        countRequest("'global'", withinRequesterLimit("?1")),
        input.requestFingerprint,
        globalWindow,
        now,
      ),
      this.statement(
        `INSERT INTO newsletter_subscriptions (id, email, source, locale, status, consented_at,
           confirmation_token_hash, confirmation_expires_at, confirmation_claimed_at, created_at)
         SELECT ?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7, ?5, ?5
         WHERE ${withinRequesterLimit("?8")}
           AND (SELECT request_count FROM newsletter_subscription_request_limits WHERE scope_key = 'global') <= ${globalLimit}
         ON CONFLICT (email) DO UPDATE SET
           source = excluded.source, locale = excluded.locale, status = 'pending',
           consented_at = excluded.consented_at, unsubscribed_at = NULL, confirmed_at = NULL,
           confirmation_token_hash = excluded.confirmation_token_hash,
           confirmation_expires_at = excluded.confirmation_expires_at,
           confirmation_claimed_at = excluded.confirmation_claimed_at,
           confirmation_sent_at = NULL, confirmation_provider_message_id = NULL,
           suppressed_at = NULL, suppression_reason = NULL
         WHERE newsletter_subscriptions.status IN ('pending', 'unsubscribed')
           AND NOT (newsletter_subscriptions.status = 'pending'
             AND (coalesce(newsletter_subscriptions.confirmation_claimed_at, '') > ?9
               OR coalesce(newsletter_subscriptions.confirmation_sent_at, '') > ?9))`,
        crypto.randomUUID(),
        email,
        source,
        input.locale,
        now,
        input.tokenHash,
        expiresAt,
        input.requestFingerprint,
        recentlyAsked,
      ),
      this.statement(
        "SELECT id, status, confirmation_token_hash FROM newsletter_subscriptions WHERE email = ?1",
        email,
      ),
    ]);

    const requesterCount = rowsOf<{ request_count: number }>(requester)[0]?.request_count ?? 0;
    const siteCount = rowsOf<{ request_count: number }>(site)[0]?.request_count ?? 0;
    if (requesterCount > requesterLimit || siteCount > globalLimit) {
      return { subscriptionId: existing?.id ?? null, status: "rate_limited", shouldSend: false };
    }
    const row = rowsOf<{ id: string; status: string; confirmation_token_hash: string | null }>(stored)[0];
    if (!row) return { subscriptionId: existing?.id ?? null, status: "rate_limited", shouldSend: false };
    // Only the request that stored its own token may send the confirmation mail.
    return {
      subscriptionId: row.id,
      status: row.status,
      shouldSend: row.status === "pending" && row.confirmation_token_hash === input.tokenHash,
    };
  }

  async completeSubscriptionConfirmation(input: { subscriptionId: string; tokenHash: string; providerMessageId: string }) {
    const result = await this.statement(
      `UPDATE newsletter_subscriptions SET confirmation_sent_at = ?4, confirmation_provider_message_id = ?3,
         confirmation_claimed_at = NULL
       WHERE id = ?1 AND status = 'pending' AND confirmation_token_hash = ?2`,
      input.subscriptionId,
      input.tokenHash,
      input.providerMessageId,
      new Date().toISOString(),
    ).run();
    return result.meta.changes > 0;
  }

  async releaseSubscriptionConfirmation(input: { subscriptionId: string; tokenHash: string }) {
    const result = await this.statement(
      `UPDATE newsletter_subscriptions SET confirmation_claimed_at = NULL
       WHERE id = ?1 AND status = 'pending' AND confirmation_token_hash = ?2 AND confirmation_sent_at IS NULL`,
      input.subscriptionId,
      input.tokenHash,
    ).run();
    return result.meta.changes > 0;
  }

  async confirmSubscription(input: { subscriptionId: string; tokenHash: string }) {
    const now = new Date().toISOString();
    const result = await this.statement(
      `UPDATE newsletter_subscriptions SET status = 'active', confirmed_at = ?3, confirmation_token_hash = NULL,
         confirmation_expires_at = NULL, confirmation_claimed_at = NULL
       WHERE id = ?1 AND status = 'pending' AND confirmation_token_hash = ?2 AND confirmation_expires_at > ?3`,
      input.subscriptionId,
      input.tokenHash,
      now,
    ).run();
    return result.meta.changes > 0;
  }

  async unsubscribe(input: { subscriptionId: string; recipientId: string }) {
    const recipient = await this.statement(
      "SELECT 1 AS found FROM newsletter_campaign_recipients WHERE id = ?1 AND subscription_id = ?2",
      input.recipientId,
      input.subscriptionId,
    ).first();
    return recipient ? this.unsubscribeSubscription(input.subscriptionId, false) : false;
  }

  /** What `admin_unsubscribe_newsletter_subscription` does for an editor; a suppressed address stays suppressed. */
  async adminUnsubscribe(subscriptionId: string) {
    const subscription = await this.statement(
      "SELECT status FROM newsletter_subscriptions WHERE id = ?1",
      subscriptionId,
    ).first<{ status: string }>();
    if (!subscription || subscription.status === "suppressed") return false;
    return this.unsubscribeSubscription(subscriptionId, true);
  }

  private async unsubscribeSubscription(subscriptionId: string, keepSuppressed: boolean) {
    const now = new Date().toISOString();
    const campaignIds = await this.campaignIdsOfSubscription(subscriptionId);
    const [unsubscribed] = await this.database.batch([
      this.statement(
        `UPDATE newsletter_subscriptions SET status = 'unsubscribed', confirmed_at = NULL,
           unsubscribed_at = coalesce(unsubscribed_at, ?2), confirmation_token_hash = NULL,
           confirmation_expires_at = NULL, confirmation_claimed_at = NULL
         WHERE id = ?1 ${keepSuppressed ? "AND status <> 'suppressed'" : ""}`,
        subscriptionId,
        now,
      ),
      ...this.cancelDeliveries(subscriptionId),
      ...campaignIds.flatMap((campaignId) => this.refreshMetrics(campaignId, now)),
    ]);
    return unsubscribed.meta.changes > 0;
  }

  async getSubscriptionEmail(subscriptionId: string) {
    const row = await this.statement("SELECT email FROM newsletter_subscriptions WHERE id = ?1", subscriptionId)
      .first<{ email: string }>();
    return row?.email ?? null;
  }

  async eraseSubscription(input: { subscriptionId: string; emailHash: string }) {
    if (!hashShape.test(input.emailHash)) throw refusal("erase newsletter subscription", "Invalid newsletter erasure hash");
    const exists = await this.getSubscriptionEmail(input.subscriptionId);
    if (!exists) return false;

    const now = new Date().toISOString();
    const campaignIds = await this.campaignIdsOfSubscription(input.subscriptionId);
    const erasedAddress = (id: string) => `'erased+' || ${id} || '@invalid.local'`;
    await this.database.batch([
      this.statement(
        `INSERT INTO newsletter_suppressions (email_hash, reason, created_at) VALUES (?1, 'erasure', ?2)
         ON CONFLICT (email_hash) DO UPDATE SET reason = 'erasure'`,
        input.emailHash,
        now,
      ),
      // Provider payloads keep their audit value but lose the address.
      this.statement(
        `UPDATE newsletter_delivery_events SET payload = json_remove(payload, '$.to', '$.from', '$.email',
           '$.data.to', '$.data.from', '$.data.email')
         WHERE recipient_id IN (SELECT id FROM newsletter_campaign_recipients WHERE subscription_id = ?1)`,
        input.subscriptionId,
      ),
      this.cancelOutbox(input.subscriptionId),
      this.statement(
        `UPDATE newsletter_campaign_recipients SET email = ${erasedAddress("id")}, subscription_id = NULL,
           delivery_status = CASE
             WHEN delivery_status IN ('pending', 'sending') AND NOT ${dispatchInFlight("newsletter_campaign_recipients.id")}
               THEN 'cancelled' ELSE delivery_status END
         WHERE subscription_id = ?1`,
        input.subscriptionId,
      ),
      ...campaignIds.flatMap((campaignId) => this.refreshMetrics(campaignId, now)),
      this.statement(
        `UPDATE newsletter_subscriptions SET email = ${erasedAddress("id")}, source = 'erased', status = 'suppressed',
           confirmation_token_hash = NULL, confirmation_expires_at = NULL, confirmed_at = NULL,
           unsubscribed_at = coalesce(unsubscribed_at, ?2), suppressed_at = coalesce(suppressed_at, ?2),
           suppression_reason = 'erasure'
         WHERE id = ?1`,
        input.subscriptionId,
        now,
      ),
    ]);
    return true;
  }
}
