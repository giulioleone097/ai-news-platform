import * as z from "zod/v4";

import {
  newsletterCampaignStatuses,
  newsletterDeliveryStatuses,
} from "@atlasnews/core/newsletter/domain/newsletter";

import { destructive, dispatch, enqueue, externalWrite, irreversible, readOnly } from "../annotations";
import { defineSpec } from "../capability";
import { contentTrustSchema, untrustedDescription } from "../untrusted";
import { editorLocaleSchema as localeSchema, idSchema, patchNote } from "./editorial";
import { deliveryBatchOutputSchema, operationsBase, workerBase } from "./operations";

const count = z.number().int().nonnegative();
const emailSchema = z.email().trim().toLowerCase().max(254);

// The fields of a draft, without defaults: a save fills the gaps with them, a patch leaves them alone.
const draftFields = {
  locale: localeSchema,
  subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/u.test(value)),
  preheader: z.string().trim().max(300),
  fromName: z.string().trim().min(1).max(120).refine((value) => !/[\r\n<>]/u.test(value)),
  fromEmail: emailSchema,
  replyTo: z.union([emailSchema, z.literal("")]),
  contentMarkdown: z.string().max(200_000),
  audienceLocale: localeSchema,
  audienceStatus: z.literal("active"),
} as const;

const campaignSummarySchema = z.object({
  id: z.string(),
  locale: localeSchema,
  status: z.enum(newsletterCampaignStatuses),
  subject: z.string(),
  scheduledFor: z.string().nullable(),
  sentAt: z.string().nullable(),
  recipientCount: count,
  sentCount: count,
  deliveredCount: count,
  bounceCount: count,
  complaintCount: count,
  failureCount: count,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const campaignSchema = campaignSummarySchema.extend({
  preheader: z.string(),
  fromName: z.string(),
  fromEmail: z.string(),
  replyTo: z.string().nullable(),
  contentMarkdown: z.string(),
  contentHtml: z.string(),
  audienceLocale: localeSchema,
  audienceStatus: z.literal("active"),
  startedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  openCount: count,
  clickCount: count,
});
const campaignResult = z.object({ campaign: campaignSchema });

const recipientSchema = z.object({
  id: z.string(),
  email: z.string(),
  deliveryStatus: z.enum(newsletterDeliveryStatuses),
  providerMessageId: z.string().nullable(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  bouncedAt: z.string().nullable(),
  complainedAt: z.string().nullable(),
  openedAt: z.string().nullable(),
  clickedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

const draftsOnly = "Only a draft campaign can be changed or deleted; once it is scheduled, sent or cancelled it stays as a record.";

export const adminNewsletterListCampaigns = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_list_campaigns",
  title: "List newsletter campaigns",
  description: "List persisted newsletter campaigns and aggregate delivery state for one locale.",
  input: z.object({
    locale: localeSchema,
    limit: z.number().int().min(1).max(100).default(30),
    offset: z.number().int().min(0).max(10_000).default(0),
  }),
  output: z.object({ page: z.object({ items: z.array(campaignSummarySchema), total: count }) }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminNewsletterGetCampaign = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_get_campaign",
  title: "Get newsletter campaign",
  description: "Get a complete persisted newsletter campaign including delivery counters.",
  input: z.object({ id: idSchema }),
  output: z.object({ campaign: campaignSchema.nullable() }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminNewsletterListRecipients = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_list_recipients",
  title: "List newsletter campaign recipients",
  description: "List recipient delivery receipts. This contains personal data and requires an editor sign-in." + untrustedDescription,
  input: z.object({ id: idSchema, limit: z.number().int().min(1).max(500).default(100) }),
  output: z.object({ recipients: z.array(recipientSchema), contentTrust: contentTrustSchema }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
});

export const adminNewsletterSaveCampaignDraft = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_save_campaign_draft",
  title: "Create or replace newsletter draft",
  description:
    "Create a campaign draft, or replace every field of the draft whose id you pass. This never sends email or queues recipients. "
    + "To change only some fields of a draft, use admin_newsletter_update_campaign_draft. " + draftsOnly,
  input: z.object({
    id: idSchema.optional(),
    ...draftFields,
    preheader: draftFields.preheader.default(""),
    replyTo: draftFields.replyTo.default(""),
    audienceStatus: draftFields.audienceStatus.default("active"),
  }),
  output: campaignResult,
  annotations: enqueue,
  scopes: ["newsroom.write"],
});

export const adminNewsletterUpdateCampaignDraft = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_update_campaign_draft",
  title: "Update newsletter draft",
  description:
    `Change selected fields of a campaign draft; send at least one besides the id. ${patchNote} `
    + `This never sends email or queues recipients. ${draftsOnly}`,
  input: z.object({ id: idSchema, ...z.object(draftFields).partial().shape }),
  output: campaignResult,
  annotations: enqueue,
  scopes: ["newsroom.write"],
});

export const adminNewsletterDeleteCampaignDraft = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_delete_campaign_draft",
  title: "Delete newsletter draft",
  description: `Permanently delete a campaign draft that was never queued. ${draftsOnly}`,
  input: z.object({ id: idSchema }),
  output: z.object({ deletedId: z.string() }),
  annotations: destructive,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id }) => `Permanently delete newsletter draft ${id}?` },
});

export const adminNewsletterSendCampaign = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_send_campaign",
  title: "Queue newsletter campaign now",
  description: "Freeze recipients and idempotently queue a draft campaign for delivery. It never sends inline.",
  input: z.object({ id: idSchema }),
  output: campaignResult,
  annotations: irreversible,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ id }) => `Queue newsletter campaign ${id} for delivery to its audience now?` },
});

export const adminNewsletterScheduleCampaign = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_schedule_campaign",
  title: "Schedule newsletter campaign",
  description: "Freeze recipients and queue a campaign for a future UTC instant.",
  input: z.object({ id: idSchema, scheduledFor: z.string().datetime({ offset: true }) }),
  output: campaignResult,
  annotations: enqueue,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ id, scheduledFor }) => `Schedule newsletter campaign ${id} for ${scheduledFor}?` },
});

export const adminNewsletterCancelCampaign = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_cancel_campaign",
  title: "Cancel newsletter campaign",
  description: "Cancel a scheduled or queued campaign before delivery.",
  input: z.object({ id: idSchema }),
  output: campaignResult,
  annotations: irreversible,
  scopes: ["newsroom.write"],
  confirmation: { question: ({ id }) => `Cancel newsletter campaign ${id}?` },
});

export const adminNewsletterRequestSubscription = defineSpec({
  ...operationsBase,
  name: "admin_newsletter_request_subscription",
  title: "Request newsletter subscription",
  description: "Send a one-time double-opt-in confirmation to the exact email address.",
  input: z.object({
    email: emailSchema,
    locale: localeSchema,
    source: z.string().trim().regex(/^[a-z0-9:_-]{2,80}$/u).default("mcp-admin"),
  }),
  output: z.object({ request: z.object({ accepted: z.literal(true) }) }),
  annotations: externalWrite,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ email }) => `Send a newsletter confirmation email to ${email}?` },
});

export const adminNewsletterEraseSubscription = defineSpec({
  ...workerBase,
  name: "admin_newsletter_erase_subscription",
  title: "Erase newsletter subscriber data",
  description:
    "Pseudonymize one newsletter subscriber while preserving required suppression and audit records. "
    + "`erased` is false when no subscriber has this id.",
  input: z.object({ subscriptionId: idSchema }),
  output: z.object({ erased: z.boolean() }),
  annotations: irreversible,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ subscriptionId }) => `Erase the personal data of newsletter subscriber ${subscriptionId}?` },
});

export const adminNewsletterProcessOutbox = defineSpec({
  ...workerBase,
  name: "admin_newsletter_process_outbox",
  title: "Process newsletter outbox",
  description: "Process one leased batch through the configured real email provider. This sends email.",
  input: z.object({
    limit: z.number().int().min(1).max(50).default(10),
    leaseSeconds: z.number().int().min(30).max(900).default(120),
  }),
  output: z.object({ batch: deliveryBatchOutputSchema }),
  annotations: dispatch,
  scopes: ["newsroom.publish"],
  confirmation: { question: ({ limit }) => `Send up to ${limit} queued newsletter emails now?` },
});

export const newsletterSpecs = [
  adminNewsletterListCampaigns, adminNewsletterGetCampaign, adminNewsletterListRecipients, adminNewsletterSaveCampaignDraft,
  adminNewsletterUpdateCampaignDraft, adminNewsletterDeleteCampaignDraft, adminNewsletterSendCampaign,
  adminNewsletterScheduleCampaign, adminNewsletterCancelCampaign, adminNewsletterRequestSubscription,
  adminNewsletterEraseSubscription, adminNewsletterProcessOutbox,
] as const;
