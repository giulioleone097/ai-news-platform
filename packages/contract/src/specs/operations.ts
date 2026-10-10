import * as z from "zod/v4";

import { commentAdminToolDefinitions } from "@atlasnews/core/comments/application/admin-tools";

import { enqueue, externalWrite, readOnly } from "../annotations";
import { defineSpec } from "../capability";
import { contentTrustSchema, untrustedDescription } from "../untrusted";

const idSchema = z.string().uuid();
const providerSchema = z.enum(["linkedin", "x", "whatsapp"]);
const outboxStatusSchema = z.enum(["pending", "processing", "sent", "failed", "cancelled"]);
const localeSchema = z.enum(["en", "it"]);
const record = z.record(z.string(), z.unknown());
const looseResult = z.looseObject({});
const operationalUnavailable =
  "The operational service is not configured or the request could not be completed.";

const socialPayloadSchema = z.object({
  text: z.string().trim().min(1).max(4_096),
  articleUrl: z.string().url().max(2_048).optional(),
  recipient: z.string().trim().min(5).max(64).optional(),
});
const socialEnqueueFields = {
  publicationId: idSchema,
  provider: providerSchema,
  payload: socialPayloadSchema,
  idempotencyKey: z.string().trim().min(16).max(160).optional(),
  scheduledFor: z.string().datetime().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
} as const;
const newsletterCampaignFields = {
  id: idSchema.optional(),
  locale: localeSchema,
  subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/u.test(value)),
  preheader: z.string().trim().max(300).default(""),
  fromName: z.string().trim().min(1).max(120).refine((value) => !/[\r\n<>]/u.test(value)),
  fromEmail: z.email().trim().toLowerCase().max(254),
  replyTo: z.union([z.email().trim().toLowerCase().max(254), z.literal("")]).default(""),
  contentMarkdown: z.string().max(200_000),
  audienceLocale: localeSchema,
  audienceStatus: z.literal("active").default("active"),
} as const;

const base = { surfaces: ["mcp"], unavailableMessage: operationalUnavailable } as const;

// Comment moderation: the titles, schemas and hints are owned by the comments context.
const comments = commentAdminToolDefinitions;

export const adminListComments = defineSpec({
  ...base,
  name: "admin_list_comments",
  title: comments.admin_list_comments.title,
  description: comments.admin_list_comments.description + untrustedDescription,
  input: comments.admin_list_comments.inputSchema,
  output: z.object({ page: looseResult, contentTrust: contentTrustSchema }),
  annotations: comments.admin_list_comments.annotations,
  scopes: ["newsroom.read"],
});

export const adminListCommentReports = defineSpec({
  ...base,
  name: "admin_list_comment_reports",
  title: comments.admin_list_comment_reports.title,
  description: comments.admin_list_comment_reports.description + untrustedDescription,
  input: comments.admin_list_comment_reports.inputSchema,
  output: z.object({ reports: looseResult, contentTrust: contentTrustSchema }),
  annotations: comments.admin_list_comment_reports.annotations,
  scopes: ["newsroom.read"],
});

export const adminModerateComment = defineSpec({
  ...base,
  name: "admin_moderate_comment",
  title: comments.admin_moderate_comment.title,
  description: comments.admin_moderate_comment.description,
  input: comments.admin_moderate_comment.inputSchema,
  output: z.object({ result: z.object({ moderatedId: z.string(), status: z.string() }) }),
  annotations: comments.admin_moderate_comment.annotations,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id, status }) => `Mark comment ${id} as ${status}?` },
});

export const adminListCommentAudit = defineSpec({
  ...base,
  name: "admin_list_comment_audit",
  title: comments.admin_list_comment_audit.title,
  description: comments.admin_list_comment_audit.description,
  input: comments.admin_list_comment_audit.inputSchema,
  output: z.object({ page: looseResult }),
  annotations: comments.admin_list_comment_audit.annotations,
  scopes: ["newsroom.read"],
});

export const adminCommentProcessNotifications = defineSpec({
  ...base,
  name: "admin_comment_process_notifications",
  title: "Process comment notification outbox",
  description: "Process one leased notification batch through the configured real email provider. This sends email.",
  input: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
  output: z.object({ batch: looseResult }),
  annotations: externalWrite,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ limit }) => `Send up to ${limit} queued comment notification emails now?` },
});

export const adminNewsletterListCampaigns = defineSpec({
  ...base,
  name: "admin_newsletter_list_campaigns",
  title: "List newsletter campaigns",
  description: "List persisted newsletter campaigns and aggregate delivery state for one locale.",
  input: z.object({
    locale: localeSchema,
    limit: z.number().int().min(1).max(100).default(30),
    offset: z.number().int().min(0).max(10_000).default(0),
  }),
  output: z.object({ page: looseResult }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminNewsletterGetCampaign = defineSpec({
  ...base,
  name: "admin_newsletter_get_campaign",
  title: "Get newsletter campaign",
  description: "Get a complete persisted newsletter campaign including delivery counters.",
  input: z.object({ id: idSchema }),
  output: z.object({ campaign: record.nullable() }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminNewsletterListRecipients = defineSpec({
  ...base,
  name: "admin_newsletter_list_recipients",
  title: "List newsletter campaign recipients",
  description: "List recipient delivery receipts. This contains personal data and requires an editor sign-in." + untrustedDescription,
  input: z.object({ id: idSchema, limit: z.number().int().min(1).max(500).default(100) }),
  output: z.object({ recipients: z.array(record), contentTrust: contentTrustSchema }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminNewsletterSaveCampaignDraft = defineSpec({
  ...base,
  name: "admin_newsletter_save_campaign_draft",
  title: "Create or update newsletter draft",
  description: "Create or update a campaign draft. This never sends email or queues recipients.",
  input: z.object(newsletterCampaignFields),
  output: z.object({ campaign: record }),
  annotations: enqueue,
  scopes: ["newsroom.write"],
});

export const adminNewsletterSendCampaign = defineSpec({
  ...base,
  name: "admin_newsletter_send_campaign",
  title: "Queue newsletter campaign now",
  description: "Freeze recipients and idempotently queue a draft campaign for delivery. It never sends inline.",
  input: z.object({ id: idSchema }),
  output: z.object({ campaign: record }),
  annotations: enqueue,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ id }) => `Queue newsletter campaign ${id} for delivery to its audience now?` },
});

export const adminNewsletterScheduleCampaign = defineSpec({
  ...base,
  name: "admin_newsletter_schedule_campaign",
  title: "Schedule newsletter campaign",
  description: "Freeze recipients and queue a campaign for a future UTC instant.",
  input: z.object({ id: idSchema, scheduledFor: z.string().datetime({ offset: true }) }),
  output: z.object({ campaign: record }),
  annotations: enqueue,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ id, scheduledFor }) => `Schedule newsletter campaign ${id} for ${scheduledFor}?` },
});

export const adminNewsletterCancelCampaign = defineSpec({
  ...base,
  name: "admin_newsletter_cancel_campaign",
  title: "Cancel newsletter campaign",
  description: "Cancel a scheduled or queued campaign before delivery.",
  input: z.object({ id: idSchema }),
  output: z.object({ campaign: record }),
  annotations: enqueue,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id }) => `Cancel newsletter campaign ${id}?` },
});

export const adminNewsletterRequestSubscription = defineSpec({
  ...base,
  name: "admin_newsletter_request_subscription",
  title: "Request newsletter subscription",
  description: "Send a one-time double-opt-in confirmation to the exact email address.",
  input: z.object({
    email: z.email().trim().toLowerCase().max(254),
    locale: localeSchema,
    source: z.string().trim().regex(/^[a-z0-9:_-]{2,80}$/u).default("mcp-admin"),
  }),
  output: z.object({ request: z.unknown() }),
  annotations: externalWrite,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ email }) => `Send a newsletter confirmation email to ${email}?` },
});

export const adminNewsletterEraseSubscription = defineSpec({
  ...base,
  name: "admin_newsletter_erase_subscription",
  title: "Erase newsletter subscriber data",
  description:
    "Pseudonymize one newsletter subscriber while preserving required suppression and audit records.",
  input: z.object({ subscriptionId: idSchema }),
  output: z.object({ erased: z.unknown() }),
  annotations: { ...externalWrite, destructiveHint: true },
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ subscriptionId }) => `Erase the personal data of newsletter subscriber ${subscriptionId}?` },
});

export const adminNewsletterProcessOutbox = defineSpec({
  ...base,
  name: "admin_newsletter_process_outbox",
  title: "Process newsletter outbox",
  description: "Process one leased batch through the configured real email provider. This sends email.",
  input: z.object({
    limit: z.number().int().min(1).max(50).default(10),
    leaseSeconds: z.number().int().min(30).max(900).default(120),
  }),
  output: z.object({ batch: z.unknown() }),
  annotations: externalWrite,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ limit }) => `Send up to ${limit} queued newsletter emails now?` },
});

export const adminSocialPreview = defineSpec({
  ...base,
  name: "admin_social_preview",
  title: "Preview social publication",
  description: "Validate and preview a LinkedIn, X, or WhatsApp publication without queueing or sending it.",
  input: z.object(socialEnqueueFields),
  output: z.object({ preview: looseResult }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminSocialEnqueue = defineSpec({
  ...base,
  name: "admin_social_enqueue",
  title: "Queue social publication",
  description: "Idempotently queue a validated social publication. It never calls the provider inline.",
  input: z.object(socialEnqueueFields),
  output: z.object({ job: looseResult }),
  annotations: enqueue,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ provider }) => `Queue this ${provider} post for publication?` },
});

export const adminSocialRequeue = defineSpec({
  ...base,
  name: "admin_social_requeue",
  title: "Correct and requeue social publication",
  description:
    "Atomically replace the payload of a cancelled or duplicate-safe failed job and return it to pending. Requires the latest revision.",
  input: z.object({
    id: idSchema,
    expectedRevision: z.number().int().nonnegative(),
    publicationId: socialEnqueueFields.publicationId,
    provider: socialEnqueueFields.provider,
    payload: socialEnqueueFields.payload,
    scheduledFor: socialEnqueueFields.scheduledFor,
    maxAttempts: socialEnqueueFields.maxAttempts,
  }),
  output: z.object({ job: looseResult }),
  annotations: enqueue,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id, provider }) => `Replace the payload of social job ${id} and requeue it for ${provider}?` },
});

export const adminSocialList = defineSpec({
  ...base,
  name: "admin_social_list",
  title: "List social outbox",
  description: "List redacted social outbox jobs and provider receipts.",
  input: z.object({
    provider: providerSchema.optional(),
    status: outboxStatusSchema.optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).max(10_000).default(0),
  }),
  output: z.object({ page: looseResult }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminSocialGet = defineSpec({
  ...base,
  name: "admin_social_get",
  title: "Get social outbox job",
  description: "Get one redacted social outbox job by ID or idempotency key.",
  input: z.object({
    id: idSchema.optional(),
    idempotencyKey: z.string().trim().min(16).max(160).optional(),
  }),
  output: z.object({ job: looseResult.nullable() }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminSocialCancel = defineSpec({
  ...base,
  name: "admin_social_cancel",
  title: "Cancel queued social publication",
  description: "Cancel a pending publication that has never been dispatched.",
  input: z.object({ id: idSchema }),
  output: z.object({ job: looseResult }),
  annotations: enqueue,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id }) => `Cancel queued social job ${id}?` },
});

export const adminSocialRetry = defineSpec({
  ...base,
  name: "admin_social_retry",
  title: "Retry failed social publication",
  description: "Retry only when the persisted provider receipt proves that a duplicate is safe.",
  input: z.object({ id: idSchema }),
  output: z.object({ job: looseResult }),
  annotations: enqueue,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id }) => `Retry failed social job ${id}?` },
});

export const adminSocialProcessOutbox = defineSpec({
  ...base,
  name: "admin_social_process_outbox",
  title: "Process social outbox",
  description: "Process one leased batch through configured real providers. This can publish externally.",
  input: z.object({}),
  output: z.object({ batch: looseResult }),
  annotations: externalWrite,
  scopes: ["newsroom.publish"],
  confirmation: { question: () => "Publish the queued social posts through the live providers now?" },
});
