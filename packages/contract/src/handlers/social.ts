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

/** The queue of posts to LinkedIn, X and WhatsApp. The workers that call the providers are MCP-only. */
export const socialCapabilities = [
  implement(adminSocialPreview, async (ports, input) => ({
    preview: await social(ports, (handlers) => handlers.social_outbox_preview(input)),
  })),
  implement(adminSocialEnqueue, async (ports, input) => ({
    job: await social(ports, (handlers) => handlers.social_outbox_enqueue({ ...input, ...confirmed })),
  })),
  implement(adminSocialUpdate, async (ports, input) => ({
    job: await social(ports, (handlers) => handlers.social_outbox_update({ ...input, ...confirmed })),
  })),
  implement(adminSocialRequeue, async (ports, input) => ({
    job: await social(ports, (handlers) => handlers.social_outbox_requeue({ ...input, ...confirmed })),
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
