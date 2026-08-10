import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  commentAdminToolDefinitions,
  createCommentAdminToolHandlers,
} from "@/modules/comments/application/admin-tools";

const idSchema = z.string().uuid();
const providerSchema = z.enum(["linkedin", "x", "whatsapp"]);
const outboxStatusSchema = z.enum(["pending", "processing", "sent", "failed", "cancelled"]);
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
const socialRequeueFields = {
  id: idSchema,
  expectedRevision: z.number().int().nonnegative(),
  publicationId: socialEnqueueFields.publicationId,
  provider: socialEnqueueFields.provider,
  payload: socialEnqueueFields.payload,
  scheduledFor: socialEnqueueFields.scheduledFor,
  maxAttempts: socialEnqueueFields.maxAttempts,
} as const;
const localeSchema = z.enum(["en", "it"]);
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

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const enqueue = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
const externalWrite = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

function success(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function failure(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function safely(key: string, operation: () => Promise<unknown>) {
  try {
    return success({ [key]: await operation() });
  } catch {
    return failure("The operational service is not configured or the request could not be completed.");
  }
}

async function getSocialHandlers() {
  const [{ createSocialPublishingRuntime }, { createSocialPublishingMcpHandlers }] = await Promise.all([
    import("@/modules/social-publishing/server"),
    import("@/modules/social-publishing"),
  ]);
  const runtime = createSocialPublishingRuntime();
  return createSocialPublishingMcpHandlers(runtime);
}

async function getCommentHandlers() {
  const { createMutationCommentService } = await import("@/modules/comments/infrastructure/container");
  const service = createMutationCommentService();
  if (!service) throw new Error("Comment moderation is not configured.");
  return createCommentAdminToolHandlers(service, {
    kind: "system",
    userId: null,
    label: "mcp-admin",
  });
}

async function getNewsletterServices() {
  const [{ getAdminNewsletterCampaignService, getNewsletterDeliveryService }, { getSupabaseAdminEnvironment }] = await Promise.all([
    import("@/modules/newsletter-delivery/container"),
    import("@/config/env"),
  ]);
  const admin = getSupabaseAdminEnvironment();
  if (!admin) throw new Error("Newsletter administration is not configured.");
  return {
    campaign: getAdminNewsletterCampaignService(),
    delivery: getNewsletterDeliveryService(),
    authorId: admin.authorId,
  };
}

export function registerAdminOperationalTools(server: McpServer) {
  const listComments = commentAdminToolDefinitions.admin_list_comments;
  server.registerTool("admin_list_comments", {
    ...listComments,
    inputSchema: listComments.inputSchema.shape,
  }, async (input) => safely("page", async () => (await getCommentHandlers()).admin_list_comments(input)));

  const listReports = commentAdminToolDefinitions.admin_list_comment_reports;
  server.registerTool("admin_list_comment_reports", {
    ...listReports,
    inputSchema: listReports.inputSchema.shape,
  }, async (input) => safely("reports", async () => (await getCommentHandlers()).admin_list_comment_reports(input)));

  const moderateComment = commentAdminToolDefinitions.admin_moderate_comment;
  server.registerTool("admin_moderate_comment", {
    ...moderateComment,
    description: `${moderateComment.description} Explicit confirmation is required.`,
    inputSchema: { ...moderateComment.inputSchema.shape, confirm: z.literal(true) },
  }, async (input) => safely("result", async () => (await getCommentHandlers()).admin_moderate_comment(input)));

  const listAudit = commentAdminToolDefinitions.admin_list_comment_audit;
  server.registerTool("admin_list_comment_audit", {
    ...listAudit,
    inputSchema: listAudit.inputSchema.shape,
  }, async (input) => safely("page", async () => (await getCommentHandlers()).admin_list_comment_audit(input)));

  server.registerTool("admin_comment_process_notifications", {
    title: "Process comment notification outbox",
    description: "Process one leased notification batch through the configured real email provider. This sends email and requires explicit confirmation.",
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(10),
      confirm: z.literal(true),
    },
    annotations: externalWrite,
  }, async ({ limit }) => safely("batch", async () => {
    const { createCommentNotificationDeliveryService } = await import(
      "@/modules/comments/infrastructure/container"
    );
    const service = createCommentNotificationDeliveryService();
    if (!service) throw new Error("Comment notification delivery is not configured.");
    return service.processBatch({ limit });
  }));

  server.registerTool("admin_newsletter_list_campaigns", {
    title: "List newsletter campaigns",
    description: "List persisted newsletter campaigns and aggregate delivery state for one locale.",
    inputSchema: {
      locale: localeSchema,
      limit: z.number().int().min(1).max(100).default(30),
      offset: z.number().int().min(0).max(10_000).default(0),
    },
    annotations: readOnly,
  }, async (input) => safely("page", async () => (await getNewsletterServices()).campaign.listCampaigns(input)));

  server.registerTool("admin_newsletter_get_campaign", {
    title: "Get newsletter campaign",
    description: "Get a complete persisted newsletter campaign including delivery counters.",
    inputSchema: { id: idSchema },
    annotations: readOnly,
  }, async ({ id }) => safely("campaign", async () => (await getNewsletterServices()).campaign.getCampaign(id)));

  server.registerTool("admin_newsletter_list_recipients", {
    title: "List newsletter campaign recipients",
    description: "List recipient delivery receipts. This contains personal data and requires admin authentication.",
    inputSchema: { id: idSchema, limit: z.number().int().min(1).max(500).default(100) },
    annotations: readOnly,
  }, async ({ id, limit }) => safely("recipients", async () => (await getNewsletterServices()).campaign.listRecipients(id, limit)));

  server.registerTool("admin_newsletter_save_campaign_draft", {
    title: "Create or update newsletter draft",
    description: "Create or update a campaign draft. This never sends email or queues recipients.",
    inputSchema: newsletterCampaignFields,
    annotations: enqueue,
  }, async (input) => safely("campaign", async () => {
    const services = await getNewsletterServices();
    return services.campaign.saveDraft(input, services.authorId);
  }));

  server.registerTool("admin_newsletter_send_campaign", {
    title: "Queue newsletter campaign now",
    description: "Freeze recipients and idempotently queue a draft campaign for delivery. Requires explicit confirmation and never sends inline.",
    inputSchema: { id: idSchema, confirm: z.literal(true) },
    annotations: enqueue,
  }, async ({ id }) => safely("campaign", async () => (await getNewsletterServices()).campaign.sendNow(id)));

  server.registerTool("admin_newsletter_schedule_campaign", {
    title: "Schedule newsletter campaign",
    description: "Freeze recipients and queue a campaign for a future UTC instant. Requires explicit confirmation.",
    inputSchema: { id: idSchema, scheduledFor: z.string().datetime({ offset: true }), confirm: z.literal(true) },
    annotations: enqueue,
  }, async ({ id, scheduledFor }) => safely("campaign", async () => (await getNewsletterServices()).campaign.schedule(id, scheduledFor)));

  server.registerTool("admin_newsletter_cancel_campaign", {
    title: "Cancel newsletter campaign",
    description: "Cancel a scheduled or queued campaign before delivery. Requires explicit confirmation.",
    inputSchema: { id: idSchema, confirm: z.literal(true) },
    annotations: enqueue,
  }, async ({ id }) => safely("campaign", async () => (await getNewsletterServices()).campaign.cancel(id)));

  server.registerTool("admin_newsletter_request_subscription", {
    title: "Request newsletter subscription",
    description: "Send a one-time double-opt-in confirmation to the exact email address. Requires explicit confirmation.",
    inputSchema: {
      email: z.email().trim().toLowerCase().max(254),
      locale: localeSchema,
      source: z.string().trim().regex(/^[a-z0-9:_-]{2,80}$/u).default("mcp-admin"),
      confirm: z.literal(true),
    },
    annotations: externalWrite,
  }, async ({ email, locale, source }) => safely("request", async () => {
    const services = await getNewsletterServices();
    return services.delivery.requestSubscription(
      { email, locale, source },
      { requester: `mcp:${services.authorId}` },
    );
  }));

  server.registerTool("admin_newsletter_erase_subscription", {
    title: "Erase newsletter subscriber data",
    description: "Pseudonymize one newsletter subscriber while preserving required suppression and audit records. Requires explicit confirmation.",
    inputSchema: { subscriptionId: idSchema, confirm: z.literal(true) },
    annotations: { ...externalWrite, destructiveHint: true },
  }, async ({ subscriptionId }) => safely("erased", async () => (await getNewsletterServices()).campaign.eraseSubscription(subscriptionId)));

  server.registerTool("admin_newsletter_process_outbox", {
    title: "Process newsletter outbox",
    description: "Process one leased batch through the configured real email provider. This sends email and requires explicit confirmation.",
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(10),
      leaseSeconds: z.number().int().min(30).max(900).default(120),
      confirm: z.literal(true),
    },
    annotations: externalWrite,
  }, async ({ limit, leaseSeconds }) => safely("batch", async () => (await getNewsletterServices()).delivery.processOutboxBatch({ limit, leaseSeconds })));

  server.registerTool("admin_social_preview", {
    title: "Preview social publication",
    description: "Validate and preview a LinkedIn, X, or WhatsApp publication without queueing or sending it.",
    inputSchema: socialEnqueueFields,
    annotations: readOnly,
  }, async (input) => safely("preview", async () => (await getSocialHandlers()).social_outbox_preview(input)));

  server.registerTool("admin_social_enqueue", {
    title: "Queue social publication",
    description: "Idempotently queue a validated social publication. It never calls the provider inline and requires explicit confirmation.",
    inputSchema: { ...socialEnqueueFields, confirm: z.literal(true) },
    annotations: enqueue,
  }, async (input) => safely("job", async () => (await getSocialHandlers()).social_outbox_enqueue(input)));

  server.registerTool("admin_social_requeue", {
    title: "Correct and requeue social publication",
    description: "Atomically replace the payload of a cancelled or duplicate-safe failed job and return it to pending. Requires the latest revision and explicit confirmation.",
    inputSchema: { ...socialRequeueFields, confirm: z.literal(true) },
    annotations: enqueue,
  }, async (input) => safely("job", async () => (await getSocialHandlers()).social_outbox_requeue(input)));

  server.registerTool("admin_social_list", {
    title: "List social outbox",
    description: "List redacted social outbox jobs and provider receipts.",
    inputSchema: {
      provider: providerSchema.optional(),
      status: outboxStatusSchema.optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).max(10_000).default(0),
    },
    annotations: readOnly,
  }, async (input) => safely("page", async () => (await getSocialHandlers()).social_outbox_list(input)));

  server.registerTool("admin_social_get", {
    title: "Get social outbox job",
    description: "Get one redacted social outbox job by ID or idempotency key.",
    inputSchema: {
      id: idSchema.optional(),
      idempotencyKey: z.string().trim().min(16).max(160).optional(),
    },
    annotations: readOnly,
  }, async (input) => safely("job", async () => (await getSocialHandlers()).social_outbox_get(input)));

  server.registerTool("admin_social_cancel", {
    title: "Cancel queued social publication",
    description: "Cancel a pending publication that has never been dispatched. Requires explicit confirmation.",
    inputSchema: { id: idSchema, confirm: z.literal(true) },
    annotations: enqueue,
  }, async (input) => safely("job", async () => (await getSocialHandlers()).social_outbox_cancel(input)));

  server.registerTool("admin_social_retry", {
    title: "Retry failed social publication",
    description: "Retry only when the persisted provider receipt proves that a duplicate is safe. Requires explicit confirmation.",
    inputSchema: { id: idSchema, confirm: z.literal(true) },
    annotations: enqueue,
  }, async (input) => safely("job", async () => (await getSocialHandlers()).social_outbox_retry(input)));

  server.registerTool("admin_social_process_outbox", {
    title: "Process social outbox",
    description: "Process one leased batch through configured real providers. This can publish externally and requires explicit confirmation.",
    inputSchema: { confirm: z.literal(true) },
    annotations: externalWrite,
  }, async (input) => safely("batch", async () => (await getSocialHandlers()).social_outbox_process(input)));
}
