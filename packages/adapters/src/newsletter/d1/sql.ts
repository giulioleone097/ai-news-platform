import {
  type NewsletterCampaign,
  type NewsletterCampaignStatus,
  type NewsletterDeliveryStatus,
} from "@atlasnews/core/newsletter/domain/newsletter";
import type { D1Result } from "../../sites/cloudflare";

// The D1 counterpart of supabase-repository.ts and of the Postgres functions in
// supabase/migrations/20260810130000_newsletter_campaigns.sql. D1 has no interactive transactions, so each
// operation reads what it needs to validate, then applies every write as one `batch` whose statements
// re-check their own preconditions: a write that lost a race changes nothing.

export const campaignColumns = [
  "id", "locale", "status", "subject", "preheader", "from_name", "from_email", "reply_to",
  "content_markdown", "content_html", "audience_locale", "audience_status", "scheduled_for",
  "started_at", "sent_at", "cancelled_at", "recipient_count", "sent_count", "delivered_count",
  "bounce_count", "complaint_count", "open_count", "click_count", "failure_count", "created_at",
  "updated_at",
].join(", ");

export interface CampaignRow {
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

export interface RecipientRow {
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

export interface OutboxDeliveryRow {
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

export function mapCampaign(row: CampaignRow): NewsletterCampaign {
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
export function refusal(operation: string, message: string) {
  return new Error(`Unable to ${operation}: ${message}`);
}

export function rowsOf<T>(result: D1Result<unknown>) {
  return result.results as T[];
}

export function toIso(value: string, operation: string, message: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw refusal(operation, message);
  return new Date(time).toISOString();
}

export const addressShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
export const hashShape = /^[a-f0-9]{64}$/u;
export const sourceShape = /^[a-z0-9:_-]{2,80}$/u;

/** A random version 4 UUID, built in SQL so that a snapshot of recipients is one INSERT ... SELECT. */
export const sqlUuid = `(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2)
  || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))`;

export const openOutbox = "'pending', 'retry', 'processing'";

/** Outbox rows (alias `o`) that a cancellation may take: not those whose provider call may be in flight. */
export const cancellableOutbox = `o.status IN (${openOutbox}) AND (o.status <> 'processing' OR o.dispatch_started_at IS NULL)`;

/** Whether the recipient (SQL reference `recipientId`) has a provider call that may be in flight. */
export const dispatchInFlight = (recipientId: string) => `EXISTS (
  SELECT 1 FROM newsletter_outbox AS d
  WHERE d.recipient_id = ${recipientId} AND d.status = 'processing' AND d.dispatch_started_at IS NOT NULL)`;

/** The subscriber is still confirmed and the campaign still sending, for the outbox row aliased `o`. */
export const deliveryAuthorized = (options: { recipientSending: boolean }) => `EXISTS (
  SELECT 1 FROM newsletter_campaign_recipients AS r
  JOIN newsletter_subscriptions AS s ON s.id = r.subscription_id
  JOIN newsletter_campaigns AS c ON c.id = r.campaign_id
  WHERE r.id = o.recipient_id
    ${options.recipientSending ? "AND r.delivery_status = 'sending'" : ""}
    AND s.status = 'active' AND s.confirmed_at IS NOT NULL
    AND c.id = o.campaign_id AND c.status = 'sending')`;

export const revokedMessage = "Delivery authorization was revoked before provider dispatch.";

/** The provider events of the message `?1` that carry one of `types`. */
export const hasEvent = (...types: string[]) => `EXISTS (
  SELECT 1 FROM newsletter_delivery_events
  WHERE provider_message_id = ?1 AND event_type IN (${types.map((type) => `'${type}'`).join(", ")}))`;

export const eventTime = (aggregate: "max" | "min", type: string) => `(
  SELECT ${aggregate}(event_at) FROM newsletter_delivery_events
  WHERE provider_message_id = ?1 AND event_type = '${type}')`;

export const requesterLimit = 10;
export const globalLimit = 200;

/**
 * Counts a request in the fixed window that starts at `?2`; a counter from an earlier window restarts at 1.
 * `scope` is the counter's key as SQL (`?1` for a requester, `'global'` for the site) and `condition` gates it.
 */
export const countRequest = (scope: string, condition: string) => `
  INSERT INTO newsletter_subscription_request_limits (scope_key, window_started_at, request_count, updated_at)
  SELECT ${scope}, ?2, 1, ?3 WHERE ${condition}
  ON CONFLICT (scope_key) DO UPDATE SET
    request_count = CASE WHEN window_started_at = excluded.window_started_at THEN request_count + 1 ELSE 1 END,
    window_started_at = excluded.window_started_at,
    updated_at = excluded.updated_at
  RETURNING request_count`;

/** The requester counter (key bound to parameter `key`) has not passed its limit. */
export const withinRequesterLimit = (key: string) =>
  `(SELECT request_count FROM newsletter_subscription_request_limits WHERE scope_key = ${key}) <= ${requesterLimit}`;
