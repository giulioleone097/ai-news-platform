import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { NewsletterRepository } from "@atlasnews/core/editorial/domain/article-repository";
import {
  isEditorSettableNewsletterStatus,
  newsletterStatuses,
  type NewsletterQuery,
  type NewsletterStatus,
} from "@atlasnews/core/editorial/domain/editorial-operations";
import { locales, type Locale } from "@atlasnews/core/locale";
import { isUuid, throwIfError } from "../../supabase/errors";

const newsletterSubscriptionSchema = z.object({
  id: z.string(),
  email: z.string(),
  source: z.string(),
  locale: z.enum(locales),
  status: z.enum(newsletterStatuses),
  consented_at: z.string(),
  unsubscribed_at: z.string().nullable(),
  created_at: z.string(),
});

const subscriptionColumns = "id, email, source, locale, status, consented_at, unsubscribed_at, created_at";

function mapSubscription(item: z.output<typeof newsletterSubscriptionSchema>) {
  return {
    id: item.id,
    email: item.email,
    source: item.source,
    locale: item.locale,
    status: item.status,
    consentedAt: item.consented_at,
    unsubscribedAt: item.unsubscribed_at,
    createdAt: item.created_at,
  };
}

/** Newsletter subscribers as the editorial side reads them; subscribing and unsubscribing go through Postgres functions. */
export class SupabaseNewsletterRepository implements NewsletterRepository {
  constructor(private readonly client: SupabaseClient) {}

  async subscribe(email: string, source: string, locale: Locale) {
    const { error } = await this.client.rpc("subscribe_newsletter", {
      p_email: email,
      p_source: source,
      p_locale: locale,
    });
    throwIfError(error, "Unable to subscribe");
  }

  async listSubscriptions(input: NewsletterQuery) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 1_000);
    const offset = Math.max(input.offset ?? 0, 0);
    let query = this.client
      .from("newsletter_subscriptions")
      .select(subscriptionColumns, { count: "exact" })
      .eq("locale", input.locale)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (input.status) query = query.eq("status", input.status);
    if (input.query?.trim()) query = query.ilike("email", `%${input.query.trim()}%`);
    const { count, data, error } = await query.range(offset, offset + limit - 1);
    throwIfError(error, "Unable to list newsletter subscriptions");
    if (count === null) throw new Error("Unable to count newsletter subscriptions");
    const items = z.array(newsletterSubscriptionSchema).parse(data ?? []).map(mapSubscription);
    return {
      items,
      total: count,
      offset,
      limit,
      hasMore: offset + items.length < count,
    };
  }

  async findSubscription(id: string) {
    if (!isUuid(id)) return null;
    const { data, error } = await this.client
      .from("newsletter_subscriptions")
      .select(subscriptionColumns)
      .eq("id", id)
      .maybeSingle();
    throwIfError(error, "Unable to load newsletter subscription");
    return data ? mapSubscription(newsletterSubscriptionSchema.parse(data)) : null;
  }

  async updateSubscriptionStatus(id: string, status: NewsletterStatus) {
    // The function below only unsubscribes (and refuses suppressed rows), whatever status is asked for.
    if (!isEditorSettableNewsletterStatus(status)) {
      throw new Error("Newsletter reactivation requires double opt-in");
    }
    const { data, error } = await this.client.rpc(
      "admin_unsubscribe_newsletter_subscription",
      { p_subscription_id: id },
    );
    throwIfError(error, "Unable to update newsletter subscription");
    if (data !== true) throw new Error("Unable to update newsletter subscription");
  }
}
