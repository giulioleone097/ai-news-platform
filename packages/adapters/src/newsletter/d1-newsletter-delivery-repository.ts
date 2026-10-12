import {
  type NewsletterCampaign,
  type NewsletterCampaignInput,
  type NewsletterCampaignRecipient,
  type NewsletterCampaignStatus,
  type NewsletterCampaignSummary,
  type NewsletterDeliveryStatus,
  type NewsletterOutboxDelivery,
  type NewsletterProviderEvent,
} from "@atlasnews/core/newsletter/domain/newsletter";
import { renderSafeNewsletterMarkdown } from "@atlasnews/core/newsletter/application/markdown";
import type {
  NewsletterCampaignPage,
  NewsletterDeliveryRepository,
} from "@atlasnews/core/newsletter/domain/ports";
import type { D1Database, D1PreparedStatement, D1Result } from "../sites/cloudflare";

// The D1 counterpart of supabase-repository.ts and of the Postgres functions in
// supabase/migrations/20260810130000_newsletter_campaigns.sql. D1 has no interactive transactions, so each
// operation reads what it needs to validate, then applies every write as one `batch` whose statements
// re-check their own preconditions: a write that lost a race changes nothing.

const campaignColumns = [
  "id", "locale", "status", "subject", "preheader", "from_name", "from_email", "reply_to",
  "content_markdown", "content_html", "audience_locale", "audience_status", "scheduled_for",
  "started_at", "sent_at", "cancelled_at", "recipient_count", "sent_count", "delivered_count",
  "bounce_count", "complaint_count", "open_count", "click_count", "failure_count", "created_at",
  "updated_at",
].join(", ");

interface CampaignRow {
  id: string;
  locale: "en" | "it";
  status: NewsletterCampaignStatus;
  subject: string;
  preheader: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  content_markdown: string;
  content_html: string;
  audience_locale: "en" | "it";
  audience_status: "active";
  scheduled_for: string | null;
  started_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  recipient_count: number;
  sent_count: number;
  delivered_count: number;
  bounce_count: number;
  complaint_count: number;
  open_count: number;
  click_count: number;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

interface RecipientRow {
  id: string;
  email: string;
  delivery_status: NewsletterDeliveryStatus;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  last_error: string | null;
}

interface OutboxDeliveryRow {
  outbox_id: number;
  campaign_id: string;
  recipient_id: string;
  subscription_id: string;
  recipient_email: string;
  idempotency_key: string;
  attempt: number;
  locale: "en" | "it";
  subject: string;
  preheader: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  content_markdown: string;
}

function mapCampaign(row: CampaignRow): NewsletterCampaign {
  return {
    id: row.id,
    locale: row.locale,
    status: row.status,
    subject: row.subject,
    preheader: row.preheader,
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    contentMarkdown: row.content_markdown,
    contentHtml: row.content_html,
    audienceLocale: row.audience_locale,
    audienceStatus: row.audience_status,
    scheduledFor: row.scheduled_for,
    startedAt: row.started_at,
    sentAt: row.sent_at,
    cancelledAt: row.cancelled_at,
    recipientCount: row.recipient_count,
    sentCount: row.sent_count,
    deliveredCount: row.delivered_count,
    bounceCount: row.bounce_count,
    complaintCount: row.complaint_count,
    openCount: row.open_count,
    clickCount: row.click_count,
    failureCount: row.failure_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The message a Postgres function would have raised, in the shape the Supabase adapter reports it. */
function refusal(operation: string, message: string) {
  return new Error(`Unable to ${operation}: ${message}`);
}

function rowsOf<T>(result: D1Result<unknown>) {
  return result.results as T[];
}

function toIso(value: string, operation: string, message: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw refusal(operation, message);
  return new Date(time).toISOString();
}

const addressShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const hashShape = /^[a-f0-9]{64}$/u;
const sourceShape = /^[a-z0-9:_-]{2,80}$/u;

/** A random version 4 UUID, built in SQL so that a snapshot of recipients is one INSERT ... SELECT. */
const sqlUuid = `(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2)
  || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))`;

const openOutbox = "'pending', 'retry', 'processing'";

/** Outbox rows (alias `o`) that a cancellation may take: not those whose provider call may be in flight. */
const cancellableOutbox = `o.status IN (${openOutbox}) AND (o.status <> 'processing' OR o.dispatch_started_at IS NULL)`;

/** Whether the recipient (SQL reference `recipientId`) has a provider call that may be in flight. */
const dispatchInFlight = (recipientId: string) => `EXISTS (
  SELECT 1 FROM newsletter_outbox AS d
  WHERE d.recipient_id = ${recipientId} AND d.status = 'processing' AND d.dispatch_started_at IS NOT NULL)`;

/** The subscriber is still confirmed and the campaign still sending, for the outbox row aliased `o`. */
const deliveryAuthorized = (options: { recipientSending: boolean }) => `EXISTS (
  SELECT 1 FROM newsletter_campaign_recipients AS r
  JOIN newsletter_subscriptions AS s ON s.id = r.subscription_id
  JOIN newsletter_campaigns AS c ON c.id = r.campaign_id
  WHERE r.id = o.recipient_id
    ${options.recipientSending ? "AND r.delivery_status = 'sending'" : ""}
    AND s.status = 'active' AND s.confirmed_at IS NOT NULL
    AND c.id = o.campaign_id AND c.status = 'sending')`;

const revokedMessage = "Delivery authorization was revoked before provider dispatch.";

/** The provider events of the message `?1` that carry one of `types`. */
const hasEvent = (...types: string[]) => `EXISTS (
  SELECT 1 FROM newsletter_delivery_events
  WHERE provider_message_id = ?1 AND event_type IN (${types.map((type) => `'${type}'`).join(", ")}))`;

const eventTime = (aggregate: "max" | "min", type: string) => `(
  SELECT ${aggregate}(event_at) FROM newsletter_delivery_events
  WHERE provider_message_id = ?1 AND event_type = '${type}')`;

const requesterLimit = 10;
const globalLimit = 200;

/**
 * Counts a request in the fixed window that starts at `?2`; a counter from an earlier window restarts at 1.
 * `scope` is the counter's key as SQL (`?1` for a requester, `'global'` for the site) and `condition` gates it.
 */
const countRequest = (scope: string, condition: string) => `
  INSERT INTO newsletter_subscription_request_limits (scope_key, window_started_at, request_count, updated_at)
  SELECT ${scope}, ?2, 1, ?3 WHERE ${condition}
  ON CONFLICT (scope_key) DO UPDATE SET
    request_count = CASE WHEN window_started_at = excluded.window_started_at THEN request_count + 1 ELSE 1 END,
    window_started_at = excluded.window_started_at,
    updated_at = excluded.updated_at
  RETURNING request_count`;

/** The requester counter (key bound to parameter `key`) has not passed its limit. */
const withinRequesterLimit = (key: string) =>
  `(SELECT request_count FROM newsletter_subscription_request_limits WHERE scope_key = ${key}) <= ${requesterLimit}`;

export class D1NewsletterDeliveryRepository implements NewsletterDeliveryRepository {
  constructor(private readonly database: D1Database) {}

  private statement(text: string, ...values: unknown[]) {
    return this.database.prepare(text).bind(...values);
  }

  private selectCampaign(id: string) {
    return this.statement(`SELECT ${campaignColumns} FROM newsletter_campaigns WHERE id = ?1`, id);
  }

  private async findCampaign(id: string) {
    return (await this.selectCampaign(id).first<CampaignRow>()) ?? null;
  }

  /** Runs `writes`, then reads the campaign back in the same batch, so the result reflects those writes. */
  private async writeCampaign(id: string, writes: D1PreparedStatement[]) {
    const results = await this.database.batch([...writes, this.selectCampaign(id)]);
    return { results, campaign: rowsOf<CampaignRow>(results[results.length - 1])[0] ?? null };
  }

  private async campaignIdsOfSubscription(subscriptionId: string) {
    const { results } = await this.statement(
      "SELECT DISTINCT campaign_id FROM newsletter_campaign_recipients WHERE subscription_id = ?1",
      subscriptionId,
    ).all<{ campaign_id: string }>();
    return results.map((row) => row.campaign_id);
  }

  /** refresh_newsletter_campaign_metrics: recount from the recipients and events, and close a drained campaign. */
  private refreshMetrics(campaignId: string, now: string) {
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

  private cancelOutbox(subscriptionId: string) {
    return this.statement(
      `UPDATE newsletter_outbox AS o SET status = 'cancelled', worker_id = NULL, lease_expires_at = NULL
       WHERE o.recipient_id IN (SELECT id FROM newsletter_campaign_recipients WHERE subscription_id = ?1)
         AND ${cancellableOutbox}`,
      subscriptionId,
    );
  }

  /** Stops the queued mail of a subscriber, except what may already be in flight at the provider. */
  private cancelDeliveries(subscriptionId: string, exceptMessageId: string | null = null) {
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
  private reconcileRecipient(providerMessageId: string, campaignId: string | null, now: string) {
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

  async listCampaigns(input: { locale: "en" | "it"; limit?: number; offset?: number }): Promise<NewsletterCampaignPage> {
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const offset = Math.max(0, input.offset ?? 0);
    const [page, count] = await this.database.batch([
      this.statement(
        `SELECT ${campaignColumns} FROM newsletter_campaigns WHERE locale = ?1
         ORDER BY created_at DESC, id DESC LIMIT ?2 OFFSET ?3`,
        input.locale,
        limit,
        offset,
      ),
      this.statement("SELECT count(*) AS total FROM newsletter_campaigns WHERE locale = ?1", input.locale),
    ]);
    return {
      items: rowsOf<CampaignRow>(page).map(mapCampaign) as NewsletterCampaignSummary[],
      total: rowsOf<{ total: number }>(count)[0]?.total ?? 0,
    };
  }

  async getCampaign(id: string) {
    const row = await this.findCampaign(id);
    return row ? mapCampaign(row) : null;
  }

  async listRecipients(campaignId: string, limit = 100): Promise<NewsletterCampaignRecipient[]> {
    const { results } = await this.statement(
      `SELECT id, email, delivery_status, provider_message_id, sent_at, delivered_at, bounced_at, complained_at,
         opened_at, clicked_at, last_error
       FROM newsletter_campaign_recipients WHERE campaign_id = ?1
       ORDER BY created_at ASC, rowid ASC LIMIT ?2`,
      campaignId,
      Math.min(500, Math.max(1, limit)),
    ).all<RecipientRow>();
    return results.map((row) => ({
      id: row.id,
      email: row.email,
      deliveryStatus: row.delivery_status,
      providerMessageId: row.provider_message_id,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      bouncedAt: row.bounced_at,
      complainedAt: row.complained_at,
      openedAt: row.opened_at,
      clickedAt: row.clicked_at,
      lastError: row.last_error,
    }));
  }

  async saveDraft(input: NewsletterCampaignInput, createdBy: string) {
    const content = [
      input.locale,
      input.subject,
      input.preheader,
      input.fromName,
      input.fromEmail,
      input.replyTo,
      input.contentMarkdown,
      renderSafeNewsletterMarkdown(input.contentMarkdown),
      input.audienceLocale,
      input.audienceStatus,
    ];

    if (input.id) {
      const { results, campaign } = await this.writeCampaign(input.id, [
        this.statement(
          `UPDATE newsletter_campaigns SET locale = ?2, subject = ?3, preheader = ?4, from_name = ?5, from_email = ?6,
             reply_to = ?7, content_markdown = ?8, content_html = ?9, audience_locale = ?10, audience_status = ?11
           WHERE id = ?1 AND status = 'draft'`,
          input.id,
          ...content,
        ),
      ]);
      if (results[0].meta.changes === 0 || !campaign) {
        throw refusal("update newsletter draft", "no draft campaign with that id");
      }
      return mapCampaign(campaign);
    }

    const id = crypto.randomUUID();
    const { campaign } = await this.writeCampaign(id, [
      this.statement(
        `INSERT INTO newsletter_campaigns (id, locale, subject, preheader, from_name, from_email, reply_to,
           content_markdown, content_html, audience_locale, audience_status, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        id,
        ...content,
        createdBy,
      ),
    ]);
    if (!campaign) throw refusal("create newsletter draft", "the campaign was not stored");
    return mapCampaign(campaign);
  }

  async deleteDraft(id: string) {
    // A draft has no recipients or outbox rows yet, so the row goes alone; a campaign that left draft stays.
    const result = await this.statement("DELETE FROM newsletter_campaigns WHERE id = ?1 AND status = 'draft'", id).run();
    return result.meta.changes > 0;
  }

  async queueCampaign(id: string, scheduledFor: string | null) {
    const operation = "queue newsletter campaign";
    const now = new Date().toISOString();
    const scheduled = scheduledFor === null
      ? null
      : toIso(scheduledFor, operation, "Scheduled delivery must be in the future");
    const campaign = await this.findCampaign(id);
    if (!campaign) throw refusal(operation, "Newsletter campaign not found");

    // Queueing twice is a no-op, as in the Postgres function.
    if ((campaign.status === "sending" || campaign.status === "sent") && scheduled === null) {
      return mapCampaign(campaign);
    }
    if (campaign.status === "scheduled" && scheduled !== null && campaign.scheduled_for === scheduled) {
      return mapCampaign(campaign);
    }
    if (campaign.status !== "draft") throw refusal(operation, "Only draft campaigns can be queued");
    if (campaign.content_markdown.trim().length < 20) throw refusal(operation, "Campaign content is incomplete");
    if (scheduled !== null && scheduled <= now) throw refusal(operation, "Scheduled delivery must be in the future");

    // The snapshot, the outbox and the state change land together; every statement only acts on a campaign
    // that is still a draft, so a concurrent queue turns this one into a no-op.
    const { campaign: queued } = await this.writeCampaign(id, [
      this.statement(
        `INSERT INTO newsletter_campaign_recipients (id, campaign_id, subscription_id, email, locale)
         SELECT ${sqlUuid}, c.id, s.id, s.email, s.locale
         FROM newsletter_campaigns AS c
         JOIN newsletter_subscriptions AS s ON s.locale = c.audience_locale AND s.status = c.audience_status
         WHERE c.id = ?1 AND c.status = 'draft'
         ORDER BY s.id
         ON CONFLICT (campaign_id, subscription_id) DO NOTHING`,
        id,
      ),
      this.statement(
        `INSERT INTO newsletter_outbox (campaign_id, recipient_id, available_at, idempotency_key)
         SELECT r.campaign_id, r.id, ?2, 'newsletter:' || r.campaign_id || ':' || r.id
         FROM newsletter_campaign_recipients AS r
         JOIN newsletter_campaigns AS c ON c.id = r.campaign_id
         WHERE r.campaign_id = ?1 AND c.status = 'draft'
         ORDER BY r.id
         ON CONFLICT (recipient_id) DO NOTHING`,
        id,
        scheduled ?? now,
      ),
      this.statement(
        `UPDATE newsletter_campaigns SET
           status = CASE WHEN ?2 IS NULL THEN 'sending' ELSE 'scheduled' END,
           scheduled_for = ?2,
           started_at = CASE WHEN ?2 IS NULL THEN coalesce(started_at, ?3) ELSE NULL END,
           recipient_count = (SELECT count(*) FROM newsletter_campaign_recipients WHERE campaign_id = ?1)
         WHERE id = ?1 AND status = 'draft'
           AND EXISTS (SELECT 1 FROM newsletter_campaign_recipients WHERE campaign_id = ?1)`,
        id,
        scheduled,
        now,
      ),
    ]);
    if (!queued) throw refusal(operation, "Newsletter campaign not found");
    // Still a draft means no subscriber matched, and then nothing above wrote anything.
    if (queued.status === "draft") throw refusal(operation, "Campaign audience is empty");
    return mapCampaign(queued);
  }

  async cancelCampaign(id: string) {
    const operation = "cancel newsletter campaign";
    const current = await this.findCampaign(id);
    if (!current) throw refusal(operation, "Newsletter campaign not found");
    if (current.status === "cancelled") return mapCampaign(current);
    if (!["draft", "scheduled", "sending"].includes(current.status)) {
      throw refusal(operation, "Only draft, scheduled or sending campaigns can be cancelled");
    }

    const now = new Date().toISOString();
    const { campaign } = await this.writeCampaign(id, [
      this.statement(
        `UPDATE newsletter_outbox AS o SET status = 'cancelled', worker_id = NULL, lease_expires_at = NULL
         WHERE o.campaign_id = ?1 AND ${cancellableOutbox}`,
        id,
      ),
      this.statement(
        `UPDATE newsletter_campaign_recipients AS r SET delivery_status = 'cancelled'
         WHERE r.campaign_id = ?1 AND r.delivery_status IN ('pending', 'sending')
           AND NOT ${dispatchInFlight("r.id")}`,
        id,
      ),
      this.statement(
        `UPDATE newsletter_campaigns SET status = 'cancelled', cancelled_at = ?2
         WHERE id = ?1 AND status IN ('draft', 'scheduled', 'sending')`,
        id,
        now,
      ),
    ]);
    if (campaign?.status !== "cancelled") {
      throw refusal(operation, "Only draft, scheduled or sending campaigns can be cancelled");
    }
    return mapCampaign(campaign);
  }

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
