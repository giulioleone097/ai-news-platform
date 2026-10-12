import * as z from "zod/v4";

import { socialChannels } from "@atlasnews/core/editorial/domain/article";
import { distributionStatuses, newsletterStatuses } from "@atlasnews/core/editorial/domain/editorial-operations";

import { readOnly, write } from "../annotations";
import { defineSpec } from "../capability";
import { contentTrustSchema, untrustedDescription } from "../untrusted";
import { editorLocaleSchema as localeSchema, editorialUnavailable } from "./editorial";

const entityIdSchema = z.string().trim().min(1).max(160);
const webUrlSchema = z.string().trim().max(2_048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
});

const publicationSchema = z.object({
  id: z.string(),
  articleId: z.string(),
  articleLocale: localeSchema,
  articleSlug: z.string(),
  articleTitle: z.string(),
  channel: z.enum(socialChannels),
  status: z.enum(distributionStatuses),
  message: z.string(),
  externalUrl: z.string().nullable(),
  scheduledFor: z.string().nullable(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
});

const subscriptionSchema = z.object({
  id: z.string(),
  email: z.string(),
  source: z.string(),
  locale: localeSchema,
  status: z.enum(newsletterStatuses),
  consentedAt: z.string(),
  unsubscribedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const adminListDistribution = defineSpec({
  name: "admin_list_distribution",
  title: "List distribution workflow",
  description: "List saved newsletter and social publication workflow items for one locale.",
  input: z.object({ locale: localeSchema }),
  output: z.object({ items: z.array(publicationSchema) }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
  surfaces: ["mcp", "studio"],
  unavailableMessage: editorialUnavailable,
});

export const adminUpdateDistribution = defineSpec({
  name: "admin_update_distribution",
  title: "Update distribution workflow",
  description:
    "Update channel copy, scheduling, external URL and verified workflow status. This does not post to an external network.",
  input: z.object({
    id: entityIdSchema,
    status: z.enum(distributionStatuses),
    message: z.string().trim().max(1_000).optional(),
    externalUrl: webUrlSchema.optional(),
    scheduledFor: z.string().datetime().nullable().optional(),
  }),
  output: z.object({ publication: publicationSchema }),
  annotations: write,
  scopes: ["newsroom.write"],
  surfaces: ["mcp", "studio"],
  unavailableMessage: editorialUnavailable,
});

export const adminListNewsletterSubscriptions = defineSpec({
  name: "admin_list_newsletter_subscriptions",
  title: "List newsletter subscriptions",
  description:
    "List the consented newsletter registry for one locale. Results contain personal data and require an editor sign-in."
    + untrustedDescription,
  input: z.object({
    locale: localeSchema,
    query: z.string().trim().min(1).max(120).optional(),
    status: z.enum(newsletterStatuses).optional(),
    limit: z.number().int().min(1).max(500).default(100),
    offset: z.number().int().min(0).max(1_000_000).default(0),
  }),
  output: z.object({
    items: z.array(subscriptionSchema),
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    contentTrust: contentTrustSchema,
  }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
  surfaces: ["mcp", "studio"],
  unavailableMessage: editorialUnavailable,
});

export const adminGetNewsletterSubscription = defineSpec({
  name: "admin_get_newsletter_subscription",
  title: "Get newsletter subscription",
  description:
    "Get one entry of the consented newsletter registry by id: its status, source and consent dates. "
    + "The result contains personal data and requires an editor sign-in."
    + untrustedDescription,
  input: z.object({ id: entityIdSchema }),
  output: z.object({ subscription: subscriptionSchema, contentTrust: contentTrustSchema }),
  annotations: readOnly,
  scopes: ["newsroom.read"],
  surfaces: ["mcp", "studio"],
  unavailableMessage: editorialUnavailable,
});

export const adminUpdateNewsletterSubscription = defineSpec({
  name: "admin_update_newsletter_subscription",
  title: "Update newsletter subscription",
  description:
    "Unsubscribe a consent-registry entry without deleting its audit record. Reactivation always requires double opt-in.",
  input: z.object({ id: entityIdSchema, status: z.literal("unsubscribed") }),
  output: z.object({ id: z.string(), status: z.literal("unsubscribed") }),
  annotations: write,
  scopes: ["newsroom.write"],
  surfaces: ["mcp", "studio"],
  unavailableMessage: editorialUnavailable,
});

export const newsroomSpecs = [
  adminListDistribution, adminUpdateDistribution, adminListNewsletterSubscriptions, adminGetNewsletterSubscription,
  adminUpdateNewsletterSubscription,
] as const;
