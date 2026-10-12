import "server-only";

import type { NewsletterRepository } from "@atlasnews/core/editorial/domain/article-repository";
import { locales, type Locale } from "@/i18n";
import { createMutationCommentService, createSocialPublishingRuntime } from "@/server/composition";

/**
 * The figures of the dashboard's attention row. Each is null where its feature is not configured or the
 * store cannot be reached: a missing count must not take the dashboard down.
 */
export async function countPendingComments() {
  try {
    return (await createMutationCommentService()?.countByStatus("pending")) ?? null;
  } catch (error) {
    console.error("dashboard: pending comments count failed", error);
    return null;
  }
}

/** Subscribers whose address is confirmed, over every locale of the list. */
export async function countActiveSubscribers(newsletter: Pick<NewsletterRepository, "listSubscriptions">) {
  try {
    const pages = await Promise.all(locales.map((locale) => newsletter.listSubscriptions({ locale, status: "active", limit: 1 })));
    return pages.reduce((total, page) => total + page.total, 0);
  } catch (error) {
    console.error("dashboard: subscriber count failed", error);
    return null;
  }
}

/** Social posts that failed to send for this language; null where social publishing is not configured. */
export async function countFailedSocialPosts(
  distribution: { listPublications(locale: Locale): Promise<Array<{ id: string }>> },
  locale: Locale,
) {
  try {
    const [publications, queue] = await Promise.all([
      distribution.listPublications(locale),
      createSocialPublishingRuntime().service.list({ limit: 200 }),
    ]);
    const owned = new Set(publications.map((publication) => publication.id));
    return queue.items.filter((job) => job.status === "failed" && owned.has(job.publicationId)).length;
  } catch {
    return null;
  }
}
