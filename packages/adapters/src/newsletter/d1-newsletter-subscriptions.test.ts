import type { NewsletterRepository } from "@atlasnews/core/editorial/domain/article-repository";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import { D1NewsletterDeliveryRepository } from "./d1-newsletter-delivery-repository";
import { D1NewsletterSubscriptionRepository } from "./d1-newsletter-subscriptions";

let store: SitesTestStore;
let repository: D1NewsletterSubscriptionRepository;

beforeAll(async () => {
  store = await createSitesTestStore();
  repository = new D1NewsletterSubscriptionRepository(store.database);
});

afterAll(async () => {
  await store.dispose();
});

beforeEach(async () => {
  await store.database.batch([
    store.database.prepare("DELETE FROM newsletter_outbox"),
    store.database.prepare("DELETE FROM newsletter_campaign_recipients"),
    store.database.prepare("DELETE FROM newsletter_campaigns"),
    store.database.prepare("DELETE FROM newsletter_subscriptions"),
  ]);
});

async function add(email: string, status: string, options: { locale?: string; createdAt?: string } = {}) {
  const id = crypto.randomUUID();
  await store.database
    .prepare(
      `INSERT INTO newsletter_subscriptions (id, email, locale, status, confirmed_at, created_at)
       VALUES (?1, ?2, ?3, ?4, CASE WHEN ?4 = 'active' THEN '2026-10-01T10:00:00.000Z' END, ?5)`,
    )
    .bind(id, email, options.locale ?? "en", status, options.createdAt ?? "2026-10-01T10:00:00.000Z")
    .run();
  return id;
}

describe("D1NewsletterSubscriptionRepository", () => {
  it("reads one subscriber by id, in any status, and nothing for an unknown id", async () => {
    const suppressed = await add("suppressed@example.com", "suppressed", { locale: "it" });
    await add("other@example.com", "active");

    expect(await repository.findSubscription(suppressed)).toEqual({
      id: suppressed,
      email: "suppressed@example.com",
      source: "site",
      locale: "it",
      status: "suppressed",
      consentedAt: expect.any(String),
      unsubscribedAt: null,
      createdAt: "2026-10-01T10:00:00.000Z",
    });
    expect(await repository.findSubscription(crypto.randomUUID())).toBeNull();
  });

  it("lists pending and suppressed subscribers instead of hiding them", async () => {
    const statuses = ["pending", "active", "unsubscribed", "suppressed"];
    for (const [index, status] of statuses.entries()) {
      await add(`${status}@example.com`, status, { createdAt: `2026-10-01T10:00:0${index}.000Z` });
    }
    await add("italiano@example.com", "active", { locale: "it" });

    const page = await repository.listSubscriptions({ locale: "en" });

    expect(page.items.map((item) => item.status)).toEqual([...statuses].reverse());
    expect(page).toMatchObject({ total: 4, offset: 0, limit: 100, hasMore: false });
    expect(page.items[0]).toEqual({
      id: expect.any(String),
      email: "suppressed@example.com",
      source: "site",
      locale: "en",
      status: "suppressed",
      consentedAt: expect.any(String),
      unsubscribedAt: null,
      createdAt: "2026-10-01T10:00:03.000Z",
    });
  });

  it("filters by status and by part of the address, and pages the result", async () => {
    await add("ada@example.com", "active", { createdAt: "2026-10-01T10:00:01.000Z" });
    await add("grace@example.com", "active", { createdAt: "2026-10-01T10:00:02.000Z" });
    await add("alan@example.org", "suppressed", { createdAt: "2026-10-01T10:00:03.000Z" });

    expect((await repository.listSubscriptions({ locale: "en", status: "suppressed" })).items.map((item) => item.email)).toEqual([
      "alan@example.org",
    ]);
    expect((await repository.listSubscriptions({ locale: "en", query: " EXAMPLE.com " })).items.map((item) => item.email)).toEqual([
      "grace@example.com",
      "ada@example.com",
    ]);
    const page = await repository.listSubscriptions({ locale: "en", limit: 1, offset: 1 });
    expect(page.items.map((item) => item.email)).toEqual(["grace@example.com"]);
    expect(page).toMatchObject({ total: 3, limit: 1, offset: 1, hasMore: true });
  });

  it("refuses direct reactivation and unsubscribes through the delivery rules", async () => {
    const id = await add("reader@example.com", "active");

    await expect(repository.updateSubscriptionStatus(id, "active" as "unsubscribed")).rejects.toThrow("double opt-in");
    expect((await repository.listSubscriptions({ locale: "en" })).items[0].status).toBe("active");

    await repository.updateSubscriptionStatus(id, "unsubscribed");
    const [item] = (await repository.listSubscriptions({ locale: "en" })).items;
    expect(item.status).toBe("unsubscribed");
    expect(item.unsubscribedAt).not.toBeNull();
    // Unsubscribing twice is fine; an unknown id is an error.
    await repository.updateSubscriptionStatus(id, "unsubscribed");
    await expect(repository.updateSubscriptionStatus(crypto.randomUUID(), "unsubscribed")).rejects.toThrow(
      "Unable to update newsletter subscription",
    );
  });

  it("never un-suppresses an address, and stops the mail already queued for an unsubscribed one", async () => {
    const suppressed = await add("bounced@example.com", "suppressed");
    await expect(repository.updateSubscriptionStatus(suppressed, "unsubscribed")).rejects.toThrow("Unable to update");
    expect((await repository.listSubscriptions({ locale: "en", status: "suppressed" })).total).toBe(1);

    const reader = await add("queued@example.com", "active");
    const delivery = new D1NewsletterDeliveryRepository(store.database);
    const draft = await delivery.saveDraft({
      locale: "en",
      subject: "Hello",
      preheader: "",
      fromName: "AtlasNews",
      fromEmail: "news@example.com",
      replyTo: null,
      contentMarkdown: "A body that is long enough to send.",
      audienceLocale: "en",
      audienceStatus: "active",
    }, crypto.randomUUID());
    await delivery.queueCampaign(draft.id, null);

    await repository.updateSubscriptionStatus(reader, "unsubscribed");

    expect((await delivery.listRecipients(draft.id)).map((recipient) => recipient.deliveryStatus)).toEqual(["cancelled"]);
    expect(await delivery.claimOutbox({ limit: 5, workerId: "worker-aaaaaaaa", leaseSeconds: 60 })).toEqual([]);
    expect(await delivery.getCampaign(draft.id)).toMatchObject({ status: "sent", recipientCount: 1, sentCount: 0 });
  });

  it("only joins through double opt-in", async () => {
    await expect((repository as NewsletterRepository).subscribe("a@example.com", "site", "en")).rejects.toThrow("requires double opt-in");
    expect((await repository.listSubscriptions({ locale: "en" })).total).toBe(0);
  });
});
