import type { NewsletterRepository } from "@atlasnews/core/editorial/domain/article-repository";
import {
  isEditorSettableNewsletterStatus,
  type NewsletterPage,
  type NewsletterQuery,
  type NewsletterStatus,
  type NewsletterSubscription,
} from "@atlasnews/core/editorial/domain/editorial-operations";
import type { Locale } from "@atlasnews/core/locale";
import type { D1Database } from "../sites/cloudflare";
import { D1NewsletterDeliveryRepository } from "./d1-newsletter-delivery-repository";

interface SubscriptionRow {
  id: string;
  email: string;
  source: string;
  locale: Locale;
  status: NewsletterStatus;
  consented_at: string;
  unsubscribed_at: string | null;
  created_at: string;
}

const columns = "id, email, source, locale, status, consented_at, unsubscribed_at, created_at";

function toSubscription(row: SubscriptionRow): NewsletterSubscription {
  return {
    id: row.id,
    email: row.email,
    source: row.source,
    locale: row.locale,
    status: row.status,
    consentedAt: row.consented_at,
    unsubscribedAt: row.unsubscribed_at,
    createdAt: row.created_at,
  };
}

/** The Studio's view of the subscribers (list, unsubscribe) on D1. Joining the list goes through double opt-in only. */
export class D1NewsletterSubscriptionRepository implements NewsletterRepository {
  private readonly delivery: D1NewsletterDeliveryRepository;

  constructor(private readonly database: D1Database) {
    this.delivery = new D1NewsletterDeliveryRepository(database);
  }

  async subscribe(): Promise<void> {
    // Same refusal as the Postgres `subscribe_newsletter`: only the confirmed flow adds subscribers.
    throw new Error("Unable to subscribe: Newsletter subscription requires double opt-in");
  }

  async listSubscriptions(query: NewsletterQuery): Promise<NewsletterPage> {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 1_000);
    const offset = Math.max(query.offset ?? 0, 0);
    const filters = ["locale = ?"];
    const values: unknown[] = [query.locale];
    if (query.status) {
      filters.push("status = ?");
      values.push(query.status);
    }
    const search = query.query?.trim();
    if (search) {
      filters.push("email LIKE ?");
      values.push(`%${search}%`);
    }
    const where = filters.join(" AND ");

    const [page, count] = await this.database.batch([
      this.database
        .prepare(
          `SELECT ${columns}
           FROM newsletter_subscriptions WHERE ${where}
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...values, limit, offset),
      this.database.prepare(`SELECT count(*) AS total FROM newsletter_subscriptions WHERE ${where}`).bind(...values),
    ]);
    const total = (count.results as { total: number }[])[0]?.total ?? 0;
    const items = (page.results as unknown as SubscriptionRow[]).map(toSubscription);
    return { items, total, offset, limit, hasMore: offset + items.length < total };
  }

  async findSubscription(id: string) {
    const row = await this.database
      .prepare(`SELECT ${columns} FROM newsletter_subscriptions WHERE id = ?`)
      .bind(id)
      .first<SubscriptionRow>();
    return row ? toSubscription(row) : null;
  }

  async updateSubscriptionStatus(id: string, status: NewsletterStatus) {
    // Only unsubscribing is allowed (and not for a suppressed address), whatever else is asked for.
    if (!isEditorSettableNewsletterStatus(status)) {
      throw new Error("Newsletter reactivation requires double opt-in");
    }
    if (!(await this.delivery.adminUnsubscribe(id))) {
      throw new Error("Unable to update newsletter subscription");
    }
  }
}
