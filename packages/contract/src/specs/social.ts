import * as z from "zod/v4";

import { batchLimit } from "@atlasnews/core/editorial/domain/errors";
import { socialOutboxStatuses, socialProviders } from "@atlasnews/core/social-publishing/domain/social-publication";

import { dispatch, enqueue, irreversible, readOnly } from "../annotations";
import { defineSpec } from "../capability";
import { batchNote, idSchema, patchNote } from "./editorial";
import { operationsBase, workerBase } from "./operations";
import { batchOutput } from "./shared";

const count = z.number().int().nonnegative();
const providerSchema = z.enum(socialProviders);

const payloadSchema = z.object({
  text: z.string().trim().min(1).max(4_096),
  articleUrl: z.string().url().max(2_048).optional(),
  recipient: z.string().trim().min(5).max(64).optional(),
});
const enqueueFields = {
  publicationId: idSchema,
  provider: providerSchema,
  payload: payloadSchema,
  idempotencyKey: z.string().trim().min(16).max(160).optional(),
  scheduledFor: z.string().datetime().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
} as const;

/** A job as the outbox shows it: the message itself and the recipient of a WhatsApp post are left out. */
const jobSchema = z.object({
  id: z.string(),
  publicationId: z.string(),
  provider: providerSchema,
  idempotencyKey: z.string(),
  status: z.enum(socialOutboxStatuses),
  attempts: count,
  maxAttempts: count,
  availableAt: z.string().describe("The earliest time the job may be sent."),
  providerMessageId: z.string().nullable(),
  providerUrl: z.string().nullable(),
  providerStatus: z.string().nullable(),
  providerStatusAt: z.string().nullable(),
  revision: count.describe("Changes with every edit; pass it as expectedRevision when you edit or requeue."),
  retrySafe: z.boolean(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  sentAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const jobResult = z.object({ job: jobSchema });

const previewSchema = z.object({
  publicationId: z.string(),
  provider: providerSchema,
  idempotencyKey: z.string(),
  text: z.string().describe("The text as the provider will receive it, with the article link."),
  articleUrl: z.string().nullable(),
  recipient: z.literal("[redacted]").nullable(),
  scheduledFor: z.string().nullable(),
  maxAttempts: count,
  valid: z.literal(true),
});

export const adminSocialPreview = defineSpec({
  ...operationsBase,
  name: "admin_social_preview",
  title: "Preview social publication",
  description: "Validate and preview a LinkedIn, X, or WhatsApp publication without queueing or sending it.",
  input: z.object(enqueueFields),
  output: z.object({ preview: previewSchema }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminSocialEnqueue = defineSpec({
  ...operationsBase,
  name: "admin_social_enqueue",
  title: "Queue social publication",
  description: "Idempotently queue a validated social publication. It never calls the provider inline.",
  input: z.object(enqueueFields),
  output: jobResult,
  annotations: enqueue,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ provider }) => `Queue this ${provider} post for publication?` },
});

export const adminSocialUpdate = defineSpec({
  ...operationsBase,
  name: "admin_social_update",
  title: "Edit queued social publication",
  description:
    "Change the text, link, recipient, send time or attempt limit of a job that is still pending and was never dispatched. "
    + `${patchNote} Pass the job's current revision; a job that changed since you read it is refused. `
    + "A cancelled or failed job goes through admin_social_requeue instead, and a sent job cannot change.",
  input: z.object({
    id: idSchema,
    expectedRevision: z.number().int().nonnegative(),
    payload: payloadSchema.partial().optional().describe("The message fields to change."),
    scheduledFor: z.string().datetime().nullable().optional().describe("A new send time, or null to send as soon as possible."),
    maxAttempts: enqueueFields.maxAttempts,
  }),
  output: jobResult,
  annotations: irreversible,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id }) => `Change the queued social job ${id}?` },
});

export const adminSocialRequeue = defineSpec({
  ...operationsBase,
  name: "admin_social_requeue",
  title: "Correct and requeue social publication",
  description:
    "Atomically replace the payload of a cancelled or duplicate-safe failed job and return it to pending. Requires the latest revision.",
  input: z.object({
    id: idSchema,
    expectedRevision: z.number().int().nonnegative(),
    publicationId: enqueueFields.publicationId,
    provider: enqueueFields.provider,
    payload: enqueueFields.payload,
    scheduledFor: enqueueFields.scheduledFor,
    maxAttempts: enqueueFields.maxAttempts,
  }),
  output: jobResult,
  annotations: irreversible,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id, provider }) => `Replace the payload of social job ${id} and requeue it for ${provider}?` },
});

export const adminSocialList = defineSpec({
  ...operationsBase,
  name: "admin_social_list",
  title: "List social outbox",
  description: "List redacted social outbox jobs and provider receipts.",
  input: z.object({
    provider: providerSchema.optional(),
    status: z.enum(socialOutboxStatuses).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).max(10_000).default(0),
  }),
  output: z.object({
    page: z.object({ items: z.array(jobSchema), total: count, limit: count, offset: count, hasMore: z.boolean() }),
  }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminSocialGet = defineSpec({
  ...operationsBase,
  name: "admin_social_get",
  title: "Get social outbox job",
  description: "Get one redacted social outbox job by ID or idempotency key.",
  input: z.object({
    id: idSchema.optional(),
    idempotencyKey: z.string().trim().min(16).max(160).optional(),
  }),
  output: z.object({ job: jobSchema.nullable() }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminSocialCancel = defineSpec({
  ...operationsBase,
  name: "admin_social_cancel",
  title: "Cancel queued social publication",
  description: "Cancel a pending publication that has never been dispatched.",
  input: z.object({ id: idSchema }),
  output: jobResult,
  annotations: irreversible,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id }) => `Cancel queued social job ${id}?` },
});

export const adminSocialCancelJobs = defineSpec({
  ...operationsBase,
  name: "admin_social_cancel_jobs",
  title: "Cancel many queued social publications",
  description:
    `Cancel several pending publications that have never been dispatched; each is shaped like admin_social_cancel.${batchNote("job ids")}`,
  input: z.object({ ids: z.array(idSchema).min(1).max(batchLimit) }),
  output: batchOutput(z.literal("cancelled"), { id: z.string(), provider: providerSchema }),
  annotations: irreversible,
  scopes: ["newsroom.write"],
  confirmation: {
    question: ({ ids }) => `Cancel ${ids.length} queued social job${ids.length === 1 ? "" : "s"}?`,
  },
});

export const adminSocialRetry = defineSpec({
  ...operationsBase,
  name: "admin_social_retry",
  title: "Retry failed social publication",
  description: "Retry only when the persisted provider receipt proves that a duplicate is safe.",
  input: z.object({ id: idSchema }),
  output: jobResult,
  annotations: enqueue,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id }) => `Retry failed social job ${id}?` },
});

export const adminSocialProcessOutbox = defineSpec({
  ...workerBase,
  name: "admin_social_process_outbox",
  title: "Process social outbox",
  description: "Process one leased batch through configured real providers. This can publish externally.",
  input: z.object({}),
  output: z.object({
    batch: z.object({ claimed: count, sent: count, retried: count, failed: count, unresolved: count }),
  }),
  annotations: dispatch,
  scopes: ["newsroom.publish"],
  confirmation: { question: () => "Publish the queued social posts through the live providers now?" },
});

export const socialSpecs = [
  adminSocialPreview, adminSocialEnqueue, adminSocialUpdate, adminSocialRequeue, adminSocialList, adminSocialGet,
  adminSocialCancel, adminSocialCancelJobs, adminSocialRetry, adminSocialProcessOutbox,
] as const;
