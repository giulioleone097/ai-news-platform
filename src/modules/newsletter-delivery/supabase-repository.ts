import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  newsletterCampaignStatuses,
  newsletterDeliveryStatuses,
  type NewsletterCampaign,
  type NewsletterCampaignInput,
  type NewsletterCampaignRecipient,
  type NewsletterCampaignSummary,
  type NewsletterOutboxDelivery,
  type NewsletterProviderEvent,
} from "./domain";
import { renderSafeNewsletterMarkdown } from "./markdown";
import type {
  NewsletterCampaignPage,
  NewsletterDeliveryRepository,
} from "./ports";

const campaignColumns = [
  "id",
  "locale",
  "status",
  "subject",
  "preheader",
  "from_name",
  "from_email",
  "reply_to",
  "content_markdown",
  "content_html",
  "audience_locale",
  "audience_status",
  "scheduled_for",
  "started_at",
  "sent_at",
  "cancelled_at",
  "recipient_count",
  "sent_count",
  "delivered_count",
  "bounce_count",
  "complaint_count",
  "open_count",
  "click_count",
  "failure_count",
  "created_at",
  "updated_at",
].join(", ");

const campaignRowSchema = z.object({
  id: z.uuid(),
  locale: z.enum(["en", "it"]),
  status: z.enum(newsletterCampaignStatuses),
  subject: z.string(),
  preheader: z.string(),
  from_name: z.string(),
  from_email: z.string(),
  reply_to: z.string().nullable(),
  content_markdown: z.string(),
  content_html: z.string(),
  audience_locale: z.enum(["en", "it"]),
  audience_status: z.literal("active"),
  scheduled_for: z.string().nullable(),
  started_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  recipient_count: z.number().int().nonnegative(),
  sent_count: z.number().int().nonnegative(),
  delivered_count: z.number().int().nonnegative(),
  bounce_count: z.number().int().nonnegative(),
  complaint_count: z.number().int().nonnegative(),
  open_count: z.number().int().nonnegative(),
  click_count: z.number().int().nonnegative(),
  failure_count: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
});

const recipientRowSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  delivery_status: z.enum(newsletterDeliveryStatuses),
  provider_message_id: z.string().nullable(),
  sent_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  bounced_at: z.string().nullable(),
  complained_at: z.string().nullable(),
  opened_at: z.string().nullable(),
  clicked_at: z.string().nullable(),
  last_error: z.string().nullable(),
});

const outboxDeliverySchema = z.object({
  outbox_id: z.coerce.number().int().positive(),
  campaign_id: z.uuid(),
  recipient_id: z.uuid(),
  subscription_id: z.uuid(),
  recipient_email: z.string(),
  idempotency_key: z.string(),
  attempt: z.coerce.number().int().positive(),
  locale: z.enum(["en", "it"]),
  subject: z.string(),
  preheader: z.string(),
  from_name: z.string(),
  from_email: z.string(),
  reply_to: z.string().nullable(),
  content_markdown: z.string(),
});

function mapCampaign(row: z.infer<typeof campaignRowSchema>): NewsletterCampaign {
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

function throwIfError(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export class SupabaseNewsletterDeliveryRepository implements NewsletterDeliveryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listCampaigns(input: {
    locale: "en" | "it";
    limit?: number;
    offset?: number;
  }): Promise<NewsletterCampaignPage> {
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const offset = Math.max(0, input.offset ?? 0);
    const { data, error, count } = await this.client
      .from("newsletter_campaigns")
      .select(campaignColumns, { count: "exact" })
      .eq("locale", input.locale)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);
    throwIfError(error, "Unable to list newsletter campaigns");
    if (count === null) throw new Error("Unable to count newsletter campaigns");
    const campaigns = z.array(campaignRowSchema).parse(data ?? []).map(mapCampaign);
    return { items: campaigns as NewsletterCampaignSummary[], total: count };
  }

  async getCampaign(id: string) {
    const { data, error } = await this.client
      .from("newsletter_campaigns")
      .select(campaignColumns)
      .eq("id", id)
      .maybeSingle();
    throwIfError(error, "Unable to load newsletter campaign");
    return data ? mapCampaign(campaignRowSchema.parse(data)) : null;
  }

  async listRecipients(campaignId: string, limit = 100): Promise<NewsletterCampaignRecipient[]> {
    const { data, error } = await this.client
      .from("newsletter_campaign_recipients")
      .select("id, email, delivery_status, provider_message_id, sent_at, delivered_at, bounced_at, complained_at, opened_at, clicked_at, last_error")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(Math.min(500, Math.max(1, limit)));
    throwIfError(error, "Unable to list newsletter recipients");
    return z.array(recipientRowSchema).parse(data ?? []).map((row) => ({
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
    const values = {
      locale: input.locale,
      subject: input.subject,
      preheader: input.preheader,
      from_name: input.fromName,
      from_email: input.fromEmail,
      reply_to: input.replyTo,
      content_markdown: input.contentMarkdown,
      content_html: renderSafeNewsletterMarkdown(input.contentMarkdown),
      audience_locale: input.audienceLocale,
      audience_status: input.audienceStatus,
    };

    if (input.id) {
      const { data, error } = await this.client
        .from("newsletter_campaigns")
        .update(values)
        .eq("id", input.id)
        .eq("status", "draft")
        .select(campaignColumns)
        .single();
      throwIfError(error, "Unable to update newsletter draft");
      return mapCampaign(campaignRowSchema.parse(data));
    }

    const { data, error } = await this.client
      .from("newsletter_campaigns")
      .insert({ ...values, created_by: createdBy })
      .select(campaignColumns)
      .single();
    throwIfError(error, "Unable to create newsletter draft");
    return mapCampaign(campaignRowSchema.parse(data));
  }

  async queueCampaign(id: string, scheduledFor: string | null) {
    const { data, error } = await this.client
      .rpc("queue_newsletter_campaign", {
        p_campaign_id: id,
        p_scheduled_for: scheduledFor,
      })
      .single();
    throwIfError(error, "Unable to queue newsletter campaign");
    return mapCampaign(campaignRowSchema.parse(data));
  }

  async cancelCampaign(id: string) {
    const { data, error } = await this.client
      .rpc("cancel_newsletter_campaign", { p_campaign_id: id })
      .single();
    throwIfError(error, "Unable to cancel newsletter campaign");
    return mapCampaign(campaignRowSchema.parse(data));
  }

  async claimOutbox(input: { limit: number; workerId: string; leaseSeconds: number }) {
    const { data, error } = await this.client.rpc("claim_newsletter_outbox", {
      p_limit: input.limit,
      p_worker_id: input.workerId,
      p_lease_seconds: input.leaseSeconds,
    });
    throwIfError(error, "Unable to claim newsletter outbox");
    return z.array(outboxDeliverySchema).parse(data ?? []).map((row): NewsletterOutboxDelivery => ({
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
    const { data, error } = await this.client.rpc("start_newsletter_outbox_delivery", {
      p_outbox_id: input.outboxId,
      p_worker_id: input.workerId,
    });
    throwIfError(error, "Unable to start newsletter outbox delivery");
    return z.boolean().parse(data);
  }

  async completeOutbox(input: { outboxId: number; workerId: string; providerMessageId: string }) {
    const { data, error } = await this.client.rpc("complete_newsletter_outbox", {
      p_outbox_id: input.outboxId,
      p_worker_id: input.workerId,
      p_provider_message_id: input.providerMessageId,
    });
    throwIfError(error, "Unable to complete newsletter outbox");
    return z.boolean().parse(data);
  }

  async failOutbox(input: {
    outboxId: number;
    workerId: string;
    error: string;
    retryable: boolean;
    retryAfterSeconds: number;
  }) {
    const { data, error } = await this.client.rpc("fail_newsletter_outbox", {
      p_outbox_id: input.outboxId,
      p_worker_id: input.workerId,
      p_error: input.error,
      p_retryable: input.retryable,
      p_retry_after_seconds: input.retryAfterSeconds,
    });
    throwIfError(error, "Unable to fail newsletter outbox");
    return z.boolean().parse(data);
  }

  async recordProviderEvent(event: NewsletterProviderEvent) {
    const { data, error } = await this.client.rpc("record_newsletter_delivery_event", {
      p_webhook_id: event.webhookId,
      p_provider_message_id: event.providerMessageId,
      p_event_type: event.type,
      p_event_at: event.occurredAt,
      p_payload: event.payload,
    });
    throwIfError(error, "Unable to record newsletter event");
    return z.boolean().parse(data);
  }

  async registerSuppression(input: {
    providerMessageId: string;
    emailHash: string;
    reason: "bounce" | "complaint";
  }) {
    const { data, error } = await this.client.rpc("register_newsletter_suppression", {
      p_provider_message_id: input.providerMessageId,
      p_email_hash: input.emailHash,
      p_reason: input.reason,
    });
    throwIfError(error, "Unable to register newsletter suppression");
    return z.boolean().parse(data);
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
    const { data, error } = await this.client
      .rpc("request_newsletter_subscription", {
        p_email: input.email,
        p_source: input.source,
        p_locale: input.locale,
        p_token_hash: input.tokenHash,
        p_email_hash: input.emailHash,
        p_request_fingerprint: input.requestFingerprint,
        p_expires_at: input.expiresAt,
      })
      .single();
    throwIfError(error, "Unable to request newsletter subscription");
    return z.object({
      subscription_id: z.uuid().nullable(),
      subscription_status: z.string(),
      should_send: z.boolean(),
    }).transform((row) => ({
      subscriptionId: row.subscription_id,
      status: row.subscription_status,
      shouldSend: row.should_send,
    })).parse(data);
  }

  async confirmSubscription(input: { subscriptionId: string; tokenHash: string }) {
    const { data, error } = await this.client.rpc("confirm_newsletter_subscription", {
      p_subscription_id: input.subscriptionId,
      p_token_hash: input.tokenHash,
    });
    throwIfError(error, "Unable to confirm newsletter subscription");
    return z.boolean().parse(data);
  }

  async completeSubscriptionConfirmation(input: {
    subscriptionId: string;
    tokenHash: string;
    providerMessageId: string;
  }) {
    const { data, error } = await this.client.rpc("complete_newsletter_confirmation", {
      p_subscription_id: input.subscriptionId,
      p_token_hash: input.tokenHash,
      p_provider_message_id: input.providerMessageId,
    });
    throwIfError(error, "Unable to complete newsletter confirmation");
    return z.boolean().parse(data);
  }

  async releaseSubscriptionConfirmation(input: { subscriptionId: string; tokenHash: string }) {
    const { data, error } = await this.client.rpc("release_newsletter_confirmation", {
      p_subscription_id: input.subscriptionId,
      p_token_hash: input.tokenHash,
    });
    throwIfError(error, "Unable to release newsletter confirmation");
    return z.boolean().parse(data);
  }

  async unsubscribe(input: { subscriptionId: string; recipientId: string }) {
    const { data, error } = await this.client.rpc("unsubscribe_newsletter_recipient", {
      p_subscription_id: input.subscriptionId,
      p_recipient_id: input.recipientId,
    });
    throwIfError(error, "Unable to unsubscribe newsletter recipient");
    return z.boolean().parse(data);
  }

  async getSubscriptionEmail(subscriptionId: string) {
    const { data, error } = await this.client
      .from("newsletter_subscriptions")
      .select("email")
      .eq("id", subscriptionId)
      .maybeSingle();
    throwIfError(error, "Unable to load newsletter subscription");
    return data ? z.object({ email: z.email() }).parse(data).email : null;
  }

  async eraseSubscription(input: { subscriptionId: string; emailHash: string }) {
    const { data, error } = await this.client.rpc("erase_newsletter_subscription", {
      p_subscription_id: input.subscriptionId,
      p_email_hash: input.emailHash,
    });
    throwIfError(error, "Unable to erase newsletter subscription");
    return z.boolean().parse(data);
  }
}
