import { z } from "zod";
import type { Locale } from "@/i18n";

export const newsletterCampaignStatuses = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
] as const;

export type NewsletterCampaignStatus = (typeof newsletterCampaignStatuses)[number];

export const newsletterDeliveryStatuses = [
  "pending",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "cancelled",
] as const;

export type NewsletterDeliveryStatus = (typeof newsletterDeliveryStatuses)[number];

export const newsletterProviderEventTypes = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.opened",
  "email.clicked",
  "email.failed",
  "email.suppressed",
] as const;

export type NewsletterProviderEventType = (typeof newsletterProviderEventTypes)[number];

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const localeSchema = z.enum(["en", "it"]);

export const newsletterCampaignInputSchema = z.object({
  id: z.uuid().optional(),
  locale: localeSchema,
  subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/u.test(value)),
  preheader: z.string().trim().max(300).default(""),
  fromName: z.string().trim().min(1).max(120).refine((value) => !/[\r\n<>]/u.test(value)),
  fromEmail: emailSchema,
  replyTo: z.union([emailSchema, z.literal("")]).transform((value) => value || null),
  contentMarkdown: z.string().max(200_000),
  audienceLocale: localeSchema,
  audienceStatus: z.literal("active").default("active"),
});

export type NewsletterCampaignInput = z.infer<typeof newsletterCampaignInputSchema>;

export type NewsletterCampaign = {
  id: string;
  locale: Locale;
  status: NewsletterCampaignStatus;
  subject: string;
  preheader: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  contentMarkdown: string;
  contentHtml: string;
  audienceLocale: Locale;
  audienceStatus: "active";
  scheduledFor: string | null;
  startedAt: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  bounceCount: number;
  complaintCount: number;
  openCount: number;
  clickCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
};

export type NewsletterCampaignSummary = Pick<
  NewsletterCampaign,
  | "id"
  | "locale"
  | "status"
  | "subject"
  | "scheduledFor"
  | "sentAt"
  | "recipientCount"
  | "sentCount"
  | "deliveredCount"
  | "bounceCount"
  | "complaintCount"
  | "failureCount"
  | "createdAt"
  | "updatedAt"
>;

export type NewsletterCampaignRecipient = {
  id: string;
  email: string;
  deliveryStatus: NewsletterDeliveryStatus;
  providerMessageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  lastError: string | null;
};

export type NewsletterOutboxDelivery = {
  outboxId: number;
  campaignId: string;
  recipientId: string;
  subscriptionId: string;
  recipientEmail: string;
  idempotencyKey: string;
  attempt: number;
  locale: Locale;
  subject: string;
  preheader: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  contentMarkdown: string;
};

export type NewsletterProviderEvent = {
  webhookId: string;
  providerMessageId: string;
  type: NewsletterProviderEventType | string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export class NewsletterDeliveryConfigurationError extends Error {
  constructor(message = "Newsletter delivery is not configured.") {
    super(message);
    this.name = "NewsletterDeliveryConfigurationError";
  }
}

export class NewsletterDeliveryProviderError extends Error {
  readonly retryable: boolean;
  readonly retryAfterSeconds: number;

  constructor(
    message: string,
    options: { retryable: boolean; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = "NewsletterDeliveryProviderError";
    this.retryable = options.retryable;
    this.retryAfterSeconds = Math.max(1, options.retryAfterSeconds ?? 60);
  }
}
