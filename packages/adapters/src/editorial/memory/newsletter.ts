import type { NewsletterRepository } from "@atlasnews/core/editorial/domain/article-repository";
import {
  canEditorSetNewsletterStatus,
  type NewsletterQuery,
  type NewsletterStatus,
} from "@atlasnews/core/editorial/domain/editorial-operations";
import type { Locale } from "@atlasnews/core/locale";
import type { MemoryEditorialStore } from "./store";

/** The subscribers of the demo newsletter. */
export class MemoryNewsletterRepository implements NewsletterRepository {
  constructor(private readonly store: MemoryEditorialStore) {}

  async subscribe(email: string, source: string, locale: Locale) {
    const normalized = email.trim().toLowerCase();
    const existing = this.store.subscribers.get(normalized);
    if (existing) {
      if (existing.status === "unsubscribed") return;
      existing.locale = locale;
      existing.source = source;
      return;
    }
    const now = new Date().toISOString();
    this.store.subscribers.set(normalized, {
      id: crypto.randomUUID(),
      email: normalized,
      source,
      locale,
      status: "active",
      consentedAt: now,
      unsubscribedAt: null,
      createdAt: now,
    });
  }

  async listSubscriptions(query: NewsletterQuery) {
    const normalizedQuery = query.query?.trim().toLowerCase();
    const offset = Math.max(query.offset ?? 0, 0);
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 1_000);
    const subscriptions = [...this.store.subscribers.values()]
      .filter((subscription) => subscription.locale === query.locale)
      .filter((subscription) => !query.status || subscription.status === query.status)
      .filter((subscription) => !normalizedQuery || subscription.email.includes(normalizedQuery))
      .sort((left, right) => {
        const byDate = right.createdAt.localeCompare(left.createdAt);
        return byDate || right.id.localeCompare(left.id);
      });
    const items = subscriptions.slice(offset, offset + limit);

    return {
      items: structuredClone(items),
      total: subscriptions.length,
      offset,
      limit,
      hasMore: offset + items.length < subscriptions.length,
    };
  }

  async findSubscription(id: string) {
    const subscription = [...this.store.subscribers.values()].find((item) => item.id === id);
    return subscription ? structuredClone(subscription) : null;
  }

  async updateSubscriptionStatus(id: string, status: NewsletterStatus) {
    const subscription = [...this.store.subscribers.values()].find((item) => item.id === id);
    if (!subscription) throw new Error("Newsletter subscription not found");
    if (!canEditorSetNewsletterStatus(subscription.status, status)) {
      throw new Error("Newsletter reactivation requires double opt-in");
    }
    subscription.status = status;
    subscription.unsubscribedAt = subscription.unsubscribedAt ?? new Date().toISOString();
  }
}
