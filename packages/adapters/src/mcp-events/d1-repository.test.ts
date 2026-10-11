import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { deriveEventId, deriveSubscriptionId } from "@atlasnews/core/mcp-events/application/canonical-json";
import type { NewDelivery, EventSubscription } from "@atlasnews/core/mcp-events/domain/subscription";
import { article, callbackUrl, testSecret } from "@atlasnews/core/mcp-events/test-support";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import { D1McpEventsRepository } from "./d1-repository";
import { McpEventsPersistenceError } from "./supabase-repository";

// The service and worker suites (mcp-events-service.test.ts, events-worker.test.ts) run against this
// repository too; these cases cover what only the SQL can get wrong.

const now = new Date("2026-10-10T12:00:00.000Z");
const later = (ms: number) => new Date(now.getTime() + ms);
const minute = 60_000;
let store: SitesTestStore;
let repository: D1McpEventsRepository;

function subscription(overrides: Partial<EventSubscription> = {}, url = callbackUrl): EventSubscription {
  const host = new URL(url).hostname;
  return {
    id: deriveSubscriptionId({ principal: "public", url, name: "article.published", arguments: {} }),
    principal: "public",
    eventName: "article.published",
    arguments: {},
    url,
    host,
    secret: testSecret,
    previousSecret: null,
    previousSecretExpiresAt: null,
    status: "active",
    expiresAt: later(60 * minute).toISOString(),
    verifiedAt: now.toISOString(),
    checkpoint: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function delivery(owner: EventSubscription, articleId: string): NewDelivery {
  return {
    subscriptionId: owner.id,
    articleId,
    eventId: deriveEventId(owner.id, articleId),
    event: {
      eventId: deriveEventId(owner.id, articleId),
      name: "article.published",
      timestamp: now.toISOString(),
      data: {
        article_slug: "model-ships",
        locale: "en",
        title: "A model ships",
        excerpt: "Short summary.",
        category_slug: "models",
        category_name: "Models",
        url: "https://atlasnews.example.com/en/articles/model-ships",
        published_at: now.toISOString(),
        claim_status: "confirmed",
        entity_slugs: [article().entitySlugs[0]],
      },
      cursor: null,
    },
  };
}

async function deliveryRows() {
  const { results } = await store.database
    .prepare("SELECT id, status, attempts, lease_token, last_error_code FROM mcp_event_deliveries ORDER BY rowid")
    .all<{ id: string; status: string; attempts: number; lease_token: string | null; last_error_code: string | null }>();
  return results;
}

beforeAll(async () => {
  store = await createSitesTestStore();
});
afterAll(() => store.dispose());
beforeEach(async () => {
  await store.database.prepare("DELETE FROM mcp_event_subscriptions").run();
  repository = new D1McpEventsRepository(store.database);
});

describe("D1McpEventsRepository subscriptions", () => {
  it("round-trips a subscription and replaces it by id", async () => {
    const stored = subscription({ arguments: { locale: "en", category: "models" } });
    await repository.save(stored);
    expect(await repository.find(stored.id)).toEqual(stored);

    await repository.save({ ...stored, secret: `${testSecret}x`, previousSecret: testSecret, previousSecretExpiresAt: later(minute).toISOString() });
    expect(await repository.find(stored.id)).toMatchObject({ secret: `${testSecret}x`, previousSecret: testSecret });
    expect(await repository.getMany([stored.id, "sub_missing"])).toHaveLength(1);
    expect(await repository.find("sub_missing")).toBeNull();
  });

  it("rejects rows the Postgres schema would reject", async () => {
    await expect(repository.save(subscription({ secret: "not-a-whsec" }))).rejects.toBeInstanceOf(McpEventsPersistenceError);
    await expect(repository.save(subscription({ url: "http://receiver.example.com/cb" }))).rejects.toBeInstanceOf(McpEventsPersistenceError);
    await expect(repository.save(subscription({ previousSecret: testSecret }))).rejects.toBeInstanceOf(McpEventsPersistenceError);
  });

  it("counts live subscriptions per host, per registrable domain and overall", async () => {
    const a = subscription({}, "https://a.example.com/cb");
    const b = subscription({}, "https://b.example.com/cb");
    const lookalike = subscription({}, "https://notexample.com/cb");
    const under_score = subscription({}, "https://a_b.example.net/cb");
    const expired = subscription({ expiresAt: later(-minute).toISOString() }, "https://c.example.com/cb");
    const unsubscribed = subscription({ status: "unsubscribed" }, "https://d.example.com/cb");
    for (const item of [a, b, lookalike, under_score, expired, unsubscribed]) await repository.save(item);

    expect(await repository.countLive(now)).toBe(4);
    expect(await repository.countLiveForHost("a.example.com", "other", now)).toBe(1);
    expect(await repository.countLiveForHost("a.example.com", a.id, now)).toBe(0);
    expect(await repository.countLiveForDomain("example.com", "other", now)).toBe(2);
    expect(await repository.countLiveForDomain("example.com", a.id, now)).toBe(1);
    // A suffix match is by label, and "_" is not a wildcard.
    expect(await repository.countLiveForDomain("xample.com", "other", now)).toBe(0);
    expect(await repository.countLiveForDomain("example.net", "other", now)).toBe(1);
    expect(await repository.countLiveForDomain("a_b.example.net", "other", now)).toBe(1);
  });

  it("finds a still-trusted verification for the same principal, URL and secret", async () => {
    await repository.save(subscription({ verifiedAt: "2026-10-10T10:00:00.000Z" }));
    const lookup = { principal: "public", url: callbackUrl, secret: testSecret };
    expect(await repository.findVerifiedAt({ ...lookup, since: new Date("2026-10-10T09:00:00.000Z") }))
      .toBe("2026-10-10T10:00:00.000Z");
    expect(await repository.findVerifiedAt({ ...lookup, since: new Date("2026-10-10T11:00:00.000Z") })).toBeNull();
    expect(await repository.findVerifiedAt({ ...lookup, secret: "whsec_other", since: new Date(0) })).toBeNull();
  });

  it("lists live subscriptions oldest checkpoint first and moves checkpoints forward only", async () => {
    const first = subscription({ checkpoint: "2026-10-10T11:00:00.000Z" }, "https://one.example.com/cb");
    const second = subscription({ checkpoint: "2026-10-10T11:30:00.000Z" }, "https://two.example.com/cb");
    await repository.save(second);
    await repository.save(first);
    expect((await repository.listLive(now, 10)).map((item) => item.id)).toEqual([first.id, second.id]);
    expect((await repository.listLive(now, 1)).map((item) => item.id)).toEqual([first.id]);

    await repository.advanceCheckpoint(first.id, "2026-10-10T11:45:00.000Z");
    await repository.advanceCheckpoint(first.id, "2026-10-10T11:15:00.000Z");
    expect((await repository.find(first.id))?.checkpoint).toBe("2026-10-10T11:45:00.000Z");
    expect((await repository.listLive(now, 10)).map((item) => item.id)).toEqual([second.id, first.id]);
  });

  it("deactivates only active subscriptions", async () => {
    const stored = subscription();
    await repository.save(stored);
    await repository.deactivate(stored.id, "unsubscribed");
    await repository.deactivate(stored.id, "gone");
    await repository.deactivate("sub_missing", "gone");
    expect((await repository.find(stored.id))?.status).toBe("unsubscribed");
  });
});

describe("D1McpEventsRepository deliveries", () => {
  it("queues once per subscription and article and reports only new rows", async () => {
    const owner = subscription();
    await repository.save(owner);
    expect(await repository.enqueue([], 8, now)).toBe(0);
    expect(await repository.enqueue([delivery(owner, "a1"), delivery(owner, "a2")], 8, now)).toBe(2);
    expect(await repository.enqueue([delivery(owner, "a2"), delivery(owner, "a3"), delivery(owner, "a3")], 8, now)).toBe(1);
    expect(await deliveryRows()).toHaveLength(3);
  });

  it("queues a batch all or nothing", async () => {
    const owner = subscription();
    await repository.save(owner);
    const broken = { ...delivery(owner, "a2"), eventId: "not-an-event-id" };
    await expect(repository.enqueue([delivery(owner, "a1"), broken], 8, now)).rejects.toBeInstanceOf(McpEventsPersistenceError);
    expect(await deliveryRows()).toHaveLength(0);
  });

  it("leases each delivery to one worker at a time, and again once the lease lapses", async () => {
    const owner = subscription();
    await repository.save(owner);
    await repository.enqueue([delivery(owner, "a1"), delivery(owner, "a2"), delivery(owner, "a3")], 8, now);

    const [first, second] = await Promise.all([
      repository.claim({ workerToken: "w1", limit: 2, leaseSeconds: 60, now }),
      repository.claim({ workerToken: "w2", limit: 2, leaseSeconds: 60, now }),
    ]);
    const ids = [...first, ...second].map((item) => item.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(first[0]).toMatchObject({ subscriptionId: owner.id, attempts: 1, maxAttempts: 8 });

    expect(await repository.claim({ workerToken: "w3", limit: 5, leaseSeconds: 60, now: later(59_000) })).toHaveLength(0);
    const reclaimed = await repository.claim({ workerToken: "w3", limit: 5, leaseSeconds: 60, now: later(61_000) });
    expect(reclaimed).toHaveLength(3);
    expect(reclaimed.every((item) => item.attempts === 2)).toBe(true);
  });

  it("rejects claim bounds outside the Postgres function's", async () => {
    for (const bounds of [{ limit: 0, leaseSeconds: 60 }, { limit: 51, leaseSeconds: 60 }, { limit: 5, leaseSeconds: 29 }, { limit: 5, leaseSeconds: 301 }]) {
      await expect(repository.claim({ workerToken: "w1", now, ...bounds })).rejects.toBeInstanceOf(McpEventsPersistenceError);
    }
  });

  it("claims only deliveries of live subscriptions that are due", async () => {
    const live = subscription({}, "https://live.example.com/cb");
    const ended = subscription({}, "https://ended.example.com/cb");
    await repository.save(live);
    await repository.save(ended);
    await repository.enqueue([delivery(live, "a1"), delivery(ended, "a1")], 8, now);
    await repository.enqueue([delivery(live, "later")], 8, later(10 * minute));
    await repository.deactivate(ended.id, "unsubscribed");

    const claimed = await repository.claim({ workerToken: "w1", limit: 10, leaseSeconds: 60, now: later(minute) });
    expect(claimed.map((item) => item.subscriptionId)).toEqual([live.id]);
    expect(claimed[0].eventId).toBe(deriveEventId(live.id, "a1"));
  });

  it("fails a lapsed lease that has no attempts left instead of claiming it again", async () => {
    const owner = subscription();
    await repository.save(owner);
    await repository.enqueue([delivery(owner, "a1")], 1, now);
    expect(await repository.claim({ workerToken: "w1", limit: 5, leaseSeconds: 30, now })).toHaveLength(1);

    expect(await repository.claim({ workerToken: "w2", limit: 5, leaseSeconds: 30, now: later(31_000) })).toHaveLength(0);
    expect(await deliveryRows()).toMatchObject([{ status: "failed", lease_token: null, last_error_code: "lease_expired_max_attempts" }]);
  });

  it("settles a delivery only for the worker that holds the lease", async () => {
    const owner = subscription();
    await repository.save(owner);
    await repository.enqueue([delivery(owner, "a1")], 8, now);
    const [claimed] = await repository.claim({ workerToken: "w1", limit: 5, leaseSeconds: 60, now });

    await repository.markDelivered(claimed.id, "intruder", now);
    await repository.markFailed({ id: claimed.id, workerToken: "intruder", errorCode: "x", now });
    expect(await deliveryRows()).toMatchObject([{ status: "processing", lease_token: "w1" }]);

    await repository.markRetry({ id: claimed.id, workerToken: "w1", availableAt: later(5 * minute).toISOString(), errorCode: "http_503" });
    expect(await deliveryRows()).toMatchObject([{ status: "pending", lease_token: null, last_error_code: "http_503", attempts: 1 }]);
    expect(await repository.claim({ workerToken: "w2", limit: 5, leaseSeconds: 60, now: later(minute) })).toHaveLength(0);
    const [again] = await repository.claim({ workerToken: "w2", limit: 5, leaseSeconds: 60, now: later(6 * minute) });
    expect(again).toMatchObject({ id: claimed.id, attempts: 2 });

    await repository.markDelivered(again.id, "w2", later(6 * minute));
    await repository.markCancelled(again.id, "w2", later(6 * minute));
    expect(await deliveryRows()).toMatchObject([{ status: "delivered", lease_token: null, last_error_code: null }]);
  });

  it("prunes ended subscriptions with their deliveries, and finished deliveries of live ones", async () => {
    const live = subscription({}, "https://live.example.com/cb");
    const ended = subscription({ status: "gone", updatedAt: "2026-10-01T00:00:00.000Z" }, "https://ended.example.com/cb");
    const recentlyEnded = subscription({ status: "gone" }, "https://recent.example.com/cb");
    for (const item of [live, ended, recentlyEnded]) await repository.save(item);
    await repository.enqueue([delivery(live, "done"), delivery(live, "open"), delivery(ended, "a1")], 8, now);
    const [done] = await repository.claim({ workerToken: "w1", limit: 1, leaseSeconds: 60, now });
    await repository.markDelivered(done.id, "w1", new Date("2026-10-01T00:00:00.000Z"));

    await repository.prune(new Date("2026-10-05T00:00:00.000Z"));

    expect((await repository.getMany([live.id, ended.id, recentlyEnded.id])).map((item) => item.id).sort())
      .toEqual([live.id, recentlyEnded.id].sort());
    expect(await deliveryRows()).toHaveLength(1);
  });
});
