import { createCommentNotificationDeliveryService } from "@atlasnews/adapters/comments/container";
import { getNewsletterDeliveryEnvironment } from "@atlasnews/adapters/config/env";
import { createMcpEventsWorker } from "@atlasnews/adapters/mcp-events/runtime";
import { getNewsletterDeliveryService } from "@atlasnews/adapters/newsletter/container";
import { getSitesBindings } from "@atlasnews/adapters/sites/bindings";
import { claimJobRun, releaseJobRun } from "@atlasnews/adapters/sites/jobs";
import { createSocialPublishingRuntime } from "@atlasnews/adapters/social-publishing/runtime";

/** One batch of each worker that is configured; a worker without its configuration is skipped. */
const jobs: Record<string, () => Promise<unknown> | null> = {
  "social-outbox": () => createSocialPublishingRuntime().processor.processBatch(),
  "newsletter-outbox": () => getNewsletterDeliveryEnvironment() ? getNewsletterDeliveryService().processOutboxBatch() : null,
  "comment-notifications": () => createCommentNotificationDeliveryService()?.processBatch() ?? null,
  "mcp-events": () => createMcpEventsWorker()?.run() ?? null,
};

/** Runs every job once. A failing job is reported and does not stop the others. */
export async function runDueJobs() {
  const results: Record<string, unknown> = {};
  for (const [name, run] of Object.entries(jobs)) {
    try {
      const pending = run();
      results[name] = pending ? await pending : "not_configured";
    } catch {
      results[name] = "failed";
    }
  }
  return results;
}

const interval = { intervalMs: 60_000, leaseMs: 120_000 };
let checkedAt = 0;

/**
 * Sites has no scheduler: the Worker calls this in the background of its requests (`ctx.waitUntil`).
 * Each isolate looks at most every 30 seconds, and the D1 lease lets one run start per minute across
 * every isolate. Quiet sites run their jobs when the next visitor, editor or agent arrives.
 */
export async function runDueJobsOnSites(now = Date.now()) {
  const bindings = getSitesBindings();
  if (!bindings || now - checkedAt < 30_000) return null;
  checkedAt = now;
  if (!(await claimJobRun(bindings.database, "scheduled-jobs", interval))) return null;
  try {
    return await runDueJobs();
  } finally {
    await releaseJobRun(bindings.database, "scheduled-jobs");
  }
}
