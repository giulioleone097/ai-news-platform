import { canonicalArticleUrl, findPublication } from "@atlasnews/core/editorial/domain/editorial-operations";
import { locales, type Locale } from "@atlasnews/core/locale";
import { SocialProviderError, SocialPublishingError } from "@atlasnews/core/social-publishing/domain/errors";

import { CapabilityFailure, implement } from "../capability";
import type { CapabilityPorts } from "../ports";
import {
  adminSocialCancel,
  adminSocialCancelJobs,
  adminSocialEnqueue,
  adminSocialGet,
  adminSocialList,
  adminSocialPreview,
  adminSocialProcessOutbox,
  adminSocialRequeue,
  adminSocialRetry,
  adminSocialUpdate,
} from "../specs/social";
import { createSocialPublishingMcpHandlers, type SocialPublishingMcpHandlers } from "./social-outbox";

// The adapter has already collected the confirmation of these tools; the social handlers
// keep their own guard, so they are told it was given.
const confirmed = { confirm: true } as const;

/** What the caller got wrong and can fix: a bad field, an unknown job, a job that changed since it was read. */
const callerCodes = new Set(["invalid_input", "not_found", "conflict"]);

/**
 * Runs one social handler. A mistake of the caller reaches them with its own message (a provider only
 * refuses a payload here, in `validate`); a storage or configuration failure keeps the generic message.
 */
async function social<T>(ports: CapabilityPorts, call: (handlers: SocialPublishingMcpHandlers) => Promise<T>) {
  try {
    return await call(createSocialPublishingMcpHandlers(await ports.social()));
  } catch (error) {
    if (error instanceof SocialProviderError || (error instanceof SocialPublishingError && callerCodes.has(error.code))) {
      throw new CapabilityFailure(error.message);
    }
    throw error;
  }
}

const badPost = (message: string) => new CapabilityFailure(message, { code: "social.invalidInput" });

/**
 * ceiling: the publications of both languages as `listPublications` returns them (the most recent 200 of each),
 * which is also everything the Studio and `admin_list_distribution` show. Upgrade trigger: a newsroom with more
 * live publications than that adds `getPublication(id)` to `DistributionRepository` and this reads it instead.
 */
async function publicationsOf(ports: CapabilityPorts) {
  const editorial = await ports.editorial();
  return (await Promise.all(locales.map((locale) => editorial.listPublications(locale)))).flat();
}

/** The address a post about `publication` links to: the article on the public site, and no other. */
function articleUrlOf(ports: CapabilityPorts, publication: { articleLocale: Locale; articleSlug: string }) {
  return canonicalArticleUrl(new URL(ports.site.absolute("/")), publication.articleLocale, publication.articleSlug);
}

/**
 * The post as every caller gets it queued, previewed or requeued. The publication must exist and be made for the
 * channel, and the link is the canonical address of its article: one a caller passes in `payload.articleUrl` is
 * replaced, so a post cannot point at another page, another language's article or an address off the site.
 */
async function postOf<T extends { publicationId: string; provider: string; payload: { articleUrl?: string } }>(
  ports: CapabilityPorts,
  input: T,
): Promise<T> {
  const publication = findPublication(await publicationsOf(ports), input.publicationId);
  if (!publication) throw badPost(`There is no social publication with the ID ${input.publicationId}.`);
  if (publication.channel !== input.provider) {
    throw badPost(`Publication ${publication.id} is for ${publication.channel}, not ${input.provider}.`);
  }
  return { ...input, payload: { ...input.payload, articleUrl: articleUrlOf(ports, publication) } };
}

/** An edit that changes the link keeps it canonical too: it becomes the address of the article of the job's publication. */
async function editOf<T extends { id: string; payload?: { articleUrl?: string } }>(ports: CapabilityPorts, input: T): Promise<T> {
  if (!input.payload || input.payload.articleUrl === undefined) return input;
  const job = await social(ports, (handlers) => handlers.social_outbox_get({ id: input.id }));
  if (!job) return input;
  const publication = findPublication(await publicationsOf(ports), job.publicationId);
  if (!publication) throw badPost(`The publication of job ${input.id} no longer exists, so its article link cannot be changed.`);
  // Where the site has no public https address there is no canonical link, and the one asked for is dropped.
  const payload = { ...input.payload };
  const articleUrl = articleUrlOf(ports, publication);
  if (articleUrl) payload.articleUrl = articleUrl;
  else delete payload.articleUrl;
  return { ...input, payload };
}

/** The queue of posts to LinkedIn, X and WhatsApp. The workers that call the providers are MCP-only. */
export const socialCapabilities = [
  implement(adminSocialPreview, async (ports, input) => ({
    preview: await social(ports, async (handlers) => handlers.social_outbox_preview(await postOf(ports, input))),
  })),
  implement(adminSocialEnqueue, async (ports, input) => ({
    job: await social(ports, async (handlers) => handlers.social_outbox_enqueue({ ...await postOf(ports, input), ...confirmed })),
  })),
  implement(adminSocialUpdate, async (ports, input) => ({
    job: await social(ports, async (handlers) => handlers.social_outbox_update({ ...await editOf(ports, input), ...confirmed })),
  })),
  implement(adminSocialRequeue, async (ports, input) => ({
    job: await social(ports, async (handlers) => handlers.social_outbox_requeue({ ...await postOf(ports, input), ...confirmed })),
  })),
  implement(adminSocialList, async (ports, input) => ({
    page: await social(ports, (handlers) => handlers.social_outbox_list(input)),
  })),
  implement(adminSocialGet, async (ports, input) => ({
    job: await social(ports, (handlers) => handlers.social_outbox_get(input)),
  })),
  implement(adminSocialCancel, async (ports, input) => ({
    job: await social(ports, (handlers) => handlers.social_outbox_cancel({ ...input, ...confirmed })),
  })),
  implement(adminSocialCancelJobs, async (ports, input) => {
    const jobs = await social(ports, (handlers) => handlers.social_outbox_cancel_many({ ...input, ...confirmed }));
    return {
      count: jobs.length,
      items: jobs.map((job, index) => ({ index, action: "cancelled" as const, id: job.id, provider: job.provider })),
    };
  }),
  implement(adminSocialRetry, async (ports, input) => ({
    job: await social(ports, (handlers) => handlers.social_outbox_retry({ ...input, ...confirmed })),
  })),
  implement(adminSocialProcessOutbox, async (ports) => ({
    batch: { ...await social(ports, (handlers) => handlers.social_outbox_process(confirmed)) },
  })),
];
