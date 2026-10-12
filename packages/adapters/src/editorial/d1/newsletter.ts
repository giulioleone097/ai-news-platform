import type { NewsletterRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { NewsletterQuery } from "@atlasnews/core/editorial/domain/editorial-operations";
import type { Locale } from "@atlasnews/core/locale";
import { D1EditorialAccess } from "./access";

/** Subscribers live in the newsletter adapter; this port hands them over and keeps the listings for editors. */
export class D1NewsletterRepository extends D1EditorialAccess implements NewsletterRepository {
  subscribe(email: string, source: string, locale: Locale) {
    return this.options.newsletter.subscribe(email, source, locale);
  }

  async listSubscriptions(query: NewsletterQuery) {
    this.assertEditorial();
    return this.options.newsletter.listSubscriptions(query);
  }

  async findSubscription(id: string) {
    this.assertEditorial();
    return this.options.newsletter.findSubscription(id);
  }

  async updateSubscriptionStatus(id: string, status: "unsubscribed") {
    this.assertEditorial();
    return this.options.newsletter.updateSubscriptionStatus(id, status);
  }
}
