import { locales, type Locale } from "../../locale";

import {
  matchesArticleFilter,
  type McpWebhookEvent,
  type PublishedArticle,
} from "../domain/events";
import type { McpEventsRepository, PublishedArticleSource } from "../domain/ports";
import type { EventSubscription, NewDelivery } from "../domain/subscription";
import { deriveEventId } from "./canonical-json";
import { maximumDeliveryAttempts } from "./delivery-backoff";

/**
 * A publishedAt can lag behind the moment an article becomes visible (scheduled publishing),
 * so the checkpoint trails the clock by this window. Re-scanning it is harmless because
 * deliveries are unique per (subscription, article).
 */
export const checkpointLookbackMs = 15 * 60 * 1000;
// ceiling: one worker run reads at most 100 live subscriptions; upgrade by paging listLive when exceeded.
const subscriptionBatchSize = 100;

export function toWebhookEvent(
  subscription: EventSubscription,
  article: PublishedArticle,
  siteUrl: string,
): McpWebhookEvent {
  return {
    eventId: deriveEventId(subscription.id, article.id),
    name: "article.published",
    timestamp: article.publishedAt,
    data: {
      article_slug: article.slug,
      locale: article.locale,
      title: article.title,
      excerpt: article.excerpt,
      category_slug: article.categorySlug,
      category_name: article.categoryName,
      url: new URL(`/${article.locale}/articles/${article.slug}`, siteUrl).toString(),
      published_at: article.publishedAt,
      claim_status: article.claimStatus,
      entity_slugs: article.entitySlugs,
    },
    cursor: null,
  };
}

/** Turns newly published articles into outbox deliveries for matching live subscriptions. */
export class EventEnqueuer {
  constructor(
    private readonly repository: McpEventsRepository,
    private readonly articles: PublishedArticleSource,
    private readonly siteUrl: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run() {
    const now = this.clock();
    const subscriptions = await this.repository.listLive(now, subscriptionBatchSize);
    if (!subscriptions.length) return { subscriptions: 0, enqueued: 0 };

    const newestFirst = new Map<Locale, PublishedArticle[]>();
    for (const locale of locales) {
      const interested = subscriptions.filter(
        (subscription) => !subscription.arguments.locale || subscription.arguments.locale === locale,
      );
      if (!interested.length) continue;
      const oldest = Math.min(...interested.map((subscription) => Date.parse(subscription.checkpoint)));
      newestFirst.set(locale, await this.articles.listPublishedAfter(locale, new Date(oldest)));
    }

    const published = [...newestFirst.values()].flat();
    const deliveries: NewDelivery[] = [];
    for (const subscription of subscriptions) {
      const checkpoint = Date.parse(subscription.checkpoint);
      for (const article of published) {
        const publishedAt = Date.parse(article.publishedAt);
        if (publishedAt <= checkpoint || publishedAt > now.getTime()) continue;
        if (!matchesArticleFilter(subscription.arguments, article)) continue;
        const event = toWebhookEvent(subscription, article, this.siteUrl);
        deliveries.push({
          subscriptionId: subscription.id,
          articleId: article.id,
          eventId: event.eventId,
          event,
        });
      }
    }

    const enqueued = deliveries.length
      ? await this.repository.enqueue(deliveries, maximumDeliveryAttempts, now)
      : 0;
    const trailing = new Date(now.getTime() - checkpointLookbackMs).toISOString();
    await Promise.all(
      subscriptions
        .filter((subscription) => trailing > subscription.checkpoint)
        .map((subscription) => this.repository.advanceCheckpoint(subscription.id, trailing)),
    );
    return { subscriptions: subscriptions.length, enqueued };
  }
}
