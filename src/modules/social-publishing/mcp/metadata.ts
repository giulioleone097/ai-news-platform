export const socialPublishingMcpToolMetadata = [
  {
    name: "social_outbox_preview",
    description: "Validate and preview a provider-specific social publication without enqueueing or sending it.",
    inputSchema: {
      type: "object",
      required: ["publicationId", "provider", "payload"],
      properties: {
        publicationId: { type: "string", format: "uuid" },
        provider: { type: "string", enum: ["linkedin", "x", "whatsapp"] },
        payload: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", minLength: 1, maxLength: 4096 },
            articleUrl: { type: "string", format: "uri" },
            recipient: {
              type: "string",
              description: "Required explicit E.164/wa_id target for WhatsApp only. Redacted in output.",
            },
          },
          additionalProperties: false,
        },
        idempotencyKey: { type: "string", minLength: 16, maxLength: 160 },
        scheduledFor: { type: "string", format: "date-time" },
        maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "social_outbox_enqueue",
    description: "Idempotently enqueue a validated social publication. Requires explicit confirmation and never sends inline.",
    inputSchema: {
      type: "object",
      required: ["publicationId", "provider", "payload", "confirm"],
      properties: {
        publicationId: { type: "string", format: "uuid" },
        provider: { type: "string", enum: ["linkedin", "x", "whatsapp"] },
        payload: { type: "object" },
        idempotencyKey: { type: "string", minLength: 16, maxLength: 160 },
        scheduledFor: { type: "string", format: "date-time" },
        maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
        confirm: { type: "boolean", const: true },
      },
      additionalProperties: false,
    },
  },
  {
    name: "social_outbox_list",
    description: "List redacted social outbox state and provider receipts.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["linkedin", "x", "whatsapp"] },
        status: { type: "string", enum: ["pending", "processing", "sent", "failed", "cancelled"] },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        offset: { type: "integer", minimum: 0, maximum: 10000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "social_outbox_requeue",
    description: "Correct and requeue a cancelled or duplicate-safe failed job using its latest version. Requires explicit confirmation.",
    inputSchema: {
      type: "object",
      required: ["id", "expectedRevision", "publicationId", "provider", "payload", "confirm"],
      properties: {
        id: { type: "string", format: "uuid" },
        expectedRevision: { type: "integer", minimum: 0 },
        publicationId: { type: "string", format: "uuid" },
        provider: { type: "string", enum: ["linkedin", "x", "whatsapp"] },
        payload: { type: "object" },
        scheduledFor: { type: "string", format: "date-time" },
        maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
        confirm: { type: "boolean", const: true },
      },
      additionalProperties: false,
    },
  },
  {
    name: "social_outbox_get",
    description: "Get one redacted social outbox job by ID or idempotency key.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        idempotencyKey: { type: "string", minLength: 16, maxLength: 160 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "social_outbox_cancel",
    description: "Cancel a pending, never-dispatched job. Requires explicit confirmation.",
    inputSchema: {
      type: "object",
      required: ["id", "confirm"],
      properties: {
        id: { type: "string", format: "uuid" },
        confirm: { type: "boolean", const: true },
      },
      additionalProperties: false,
    },
  },
  {
    name: "social_outbox_retry",
    description: "Retry a failed job only when its persisted receipt proves retry is duplicate-safe. Requires explicit confirmation.",
    inputSchema: {
      type: "object",
      required: ["id", "confirm"],
      properties: {
        id: { type: "string", format: "uuid" },
        confirm: { type: "boolean", const: true },
      },
      additionalProperties: false,
    },
  },
  {
    name: "social_outbox_process",
    description: "Claim and dispatch one bounded outbox batch through configured real providers. Requires explicit confirmation.",
    inputSchema: {
      type: "object",
      required: ["confirm"],
      properties: { confirm: { type: "boolean", const: true } },
      additionalProperties: false,
    },
  },
] as const;

export const socialPublishingCapabilities = {
  providers: ["linkedin", "x", "whatsapp"],
  delivery: "supabase-outbox",
  whatsapp: {
    directMessageOnly: true,
    explicitRecipientRequired: true,
    deliveryStatusWebhook: true,
    unsendSupported: false,
  },
  externalDeleteSupported: false,
} as const;
