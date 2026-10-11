import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { WebhookTransportError } from "@atlasnews/core/mcp-events/domain/errors";
import { repositoryHarnesses, type RepositoryHarness } from "./repository-harness";
import {
  FakeArticleSource,
  FakeWebhookClient,
  article,
  callbackUrl,
  otherSecret,
  testSecret,
} from "@atlasnews/core/mcp-events/test-support";
import { CallbackVerifier } from "@atlasnews/core/mcp-events/application/callback-verifier";
import { deriveEventId } from "@atlasnews/core/mcp-events/application/canonical-json";
import { nextDeliveryAt, maximumDeliveryAttempts } from "@atlasnews/core/mcp-events/application/delivery-backoff";
import { DeliveryDispatcher } from "@atlasnews/core/mcp-events/application/delivery-dispatcher";
import { EventEnqueuer } from "@atlasnews/core/mcp-events/application/event-enqueuer";
import { McpEventsWorker } from "@atlasnews/core/mcp-events/application/events-worker";
import { DefaultMcpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";
import { signWebhook } from "@atlasnews/core/mcp-events/application/webhook-signing";

const siteUrl = "https://atlasnews.example.com";
const minute = 60 * 1000;
let now: Date;
let harness: RepositoryHarness;
let source: FakeArticleSource;
let client: FakeWebhookClient;
let service: DefaultMcpEventsService;
let enqueuer: EventEnqueuer;
let dispatcher: DeliveryDispatcher;

const clock = () => now;
const advance = (ms: number) => { now = new Date(now.getTime() + ms); };
const subscribe = (args: Record<string, unknown> = {}, url = callbackUrl, extra = {}) => service.subscribe({
  name: "article.published",
  arguments: args,
  delivery: { mode: "webhook", url, secret: testSecret },
  ...extra,
});

// Each D1 round trip is a Miniflare call, so the cases that create hundreds of rows need more than the default.
vi.setConfig({ testTimeout: 30_000 });

// The cases below exercise the worker through the McpEventsRepository port; each runs on every implementation.
describe.each(repositoryHarnesses)("%s repository", (_name, createHarness) => {
  beforeAll(async () => {
    harness = await createHarness();
  });

  beforeEach(async () => {
    now = new Date("2026-10-10T12:00:00.000Z");
    await harness.reset();
    source = new FakeArticleSource();
    client = new FakeWebhookClient();
    service = new DefaultMcpEventsService(harness.repository, new CallbackVerifier(client, clock), clock);
    enqueuer = new EventEnqueuer(harness.repository, source, siteUrl, clock);
    let token = 0;
    dispatcher = new DeliveryDispatcher(harness.repository, client, clock, () => `00000000-0000-4000-8000-${String(++token).padStart(12, "0")}`);
  });

  afterAll(() => harness.dispose());

  describe("EventEnqueuer", () => {
    it("serves the subscriptions that waited longest, so more than one batch is reached in turn", async () => {
      const urls = Array.from({ length: 150 }, (_, index) => `https://receiver.d${index}.example/cb`);
      for (const url of urls) await subscribe({}, url);
      // A newer subscription sits behind the ones created before it.
      advance(20 * minute);
      source.articles = [article({ id: "late", publishedAt: new Date(now.getTime() - minute).toISOString() })];
      // The first run serves the 100 oldest checkpoints; the other 50 are first in line on the next run.
      const first = await enqueuer.run();
      expect(first.subscriptions).toBe(100);
      advance(minute);
      const second = await enqueuer.run();
      expect(second.subscriptions).toBe(100);
      const reached = new Set((await harness.deliveries()).map((delivery) => delivery.subscriptionId));
      expect(reached.size).toBe(150);
    });

    it("never backfills articles published before the subscription", async () => {
      source.articles = [article({ id: "old", publishedAt: "2026-10-10T11:59:59.000Z" })];
      await subscribe();
      advance(minute);
      expect(await enqueuer.run()).toEqual({ subscriptions: 1, enqueued: 0 });
      expect(await harness.deliveries()).toHaveLength(0);
    });

    it("queues new articles once with the documented payload and a stable event id", async () => {
      const { id } = await subscribe();
      advance(minute);
      source.articles = [article({ id: "a1", publishedAt: "2026-10-10T12:00:30.000Z" })];

      expect((await enqueuer.run()).enqueued).toBe(1);
      expect((await enqueuer.run()).enqueued).toBe(0);
      advance(minute);
      expect((await enqueuer.run()).enqueued).toBe(0);

      expect(await harness.deliveries()).toHaveLength(1);
      expect((await harness.deliveries())[0].event).toEqual({
        eventId: deriveEventId(id, "a1"),
        name: "article.published",
        timestamp: "2026-10-10T12:00:30.000Z",
        data: {
          article_slug: "model-ships",
          locale: "en",
          title: "A model ships",
          excerpt: "Short summary.",
          category_slug: "models",
          category_name: "Models",
          url: "https://atlasnews.example.com/en/articles/model-ships",
          published_at: "2026-10-10T12:00:30.000Z",
          claim_status: "confirmed",
          entity_slugs: ["openai", "gpt-6"],
        },
        cursor: null,
      });
    });

    it("applies locale and category filters per subscription", async () => {
      await subscribe({}, "https://all.example.com/cb");
      await subscribe({ locale: "it" }, "https://it.example.com/cb");
      await subscribe({ category: "policy" }, "https://policy.example.com/cb");
      await subscribe({ locale: "en", category: "models" }, "https://models.example.com/cb");
      advance(minute);
      source.articles = [
        article({ id: "en-models", publishedAt: "2026-10-10T12:00:10.000Z" }),
        article({ id: "it-models", locale: "it", slug: "modello", publishedAt: "2026-10-10T12:00:20.000Z" }),
        article({ id: "en-policy", categorySlug: "policy", publishedAt: "2026-10-10T12:00:30.000Z" }),
      ];

      await enqueuer.run();
      const byHost = new Map<string, string[]>();
      for (const row of await harness.deliveries()) {
        const host = (await harness.subscription(row.subscriptionId))!.host;
        byHost.set(host, [...(byHost.get(host) ?? []), row.articleId].sort());
      }
      expect(Object.fromEntries(byHost)).toEqual({
        "all.example.com": ["en-models", "en-policy", "it-models"],
        "it.example.com": ["it-models"],
        "policy.example.com": ["en-policy"],
        "models.example.com": ["en-models"],
      });
    });

    it("filters by entity slug and claim status, alone or combined, without disturbing the older filters", async () => {
      await subscribe({}, "https://all.example.com/cb");
      await subscribe({ entity: "anthropic" }, "https://entity.example.com/cb");
      await subscribe({ claim_status: "rumour" }, "https://status.example.com/cb");
      await subscribe({ entity: "openai", claim_status: "confirmed" }, "https://both.example.com/cb");
      await subscribe({ locale: "en", category: "models", entity: "gpt-6" }, "https://legacy.example.com/cb");
      advance(minute);
      source.articles = [
        article({ id: "openai-confirmed", publishedAt: "2026-10-10T12:00:10.000Z" }),
        article({
          id: "anthropic-rumour",
          claimStatus: "rumour",
          entitySlugs: ["anthropic"],
          publishedAt: "2026-10-10T12:00:20.000Z",
        }),
        article({ id: "no-entities", claimStatus: "analysis", entitySlugs: [], publishedAt: "2026-10-10T12:00:30.000Z" }),
      ];

      await enqueuer.run();
      const byHost = new Map<string, string[]>();
      for (const row of await harness.deliveries()) {
        const host = (await harness.subscription(row.subscriptionId))!.host;
        byHost.set(host, [...(byHost.get(host) ?? []), row.articleId].sort());
      }
      expect(Object.fromEntries(byHost)).toEqual({
        "all.example.com": ["anthropic-rumour", "no-entities", "openai-confirmed"],
        "entity.example.com": ["anthropic-rumour"],
        "status.example.com": ["anthropic-rumour"],
        "both.example.com": ["openai-confirmed"],
        "legacy.example.com": ["openai-confirmed"],
      });
    });

    it("skips expired and unsubscribed subscriptions and advances checkpoints with a lookback", async () => {
      const { id } = await subscribe({}, callbackUrl, { ttlMs: 60 * minute });
      advance(30 * minute);
      await enqueuer.run();
      expect((await harness.subscription(id))!.checkpoint).toBe("2026-10-10T12:15:00.000Z");

      // A late-visible article (publishedAt older than the lookback window start) is still caught inside it.
      source.articles = [article({ id: "late", publishedAt: "2026-10-10T12:20:00.000Z" })];
      expect((await enqueuer.run()).enqueued).toBe(1);

      advance(2 * 60 * minute);
      source.articles = [article({ id: "after-expiry", publishedAt: "2026-10-10T14:00:00.000Z" })];
      expect(await enqueuer.run()).toEqual({ subscriptions: 0, enqueued: 0 });
    });
  });

  describe("DeliveryDispatcher", () => {
    async function queueOne() {
      const { id } = await subscribe();
      advance(minute);
      source.articles = [article({ id: "a1", publishedAt: "2026-10-10T12:00:30.000Z" })];
      await enqueuer.run();
      client.requests.length = 0;
      return id;
    }

    it("sends one signed event per request with exactly the serialized bytes", async () => {
      const id = await queueOne();

      expect(await dispatcher.run()).toMatchObject({ claimed: 1, delivered: 1 });

      expect(client.requests).toHaveLength(1);
      const request = client.requests[0];
      const event = (await harness.deliveries())[0].event;
      expect(request.body).toBe(JSON.stringify(event));
      expect(request.timeoutMs).toBe(10_000);
      expect(request.headers).toMatchObject({
        "Content-Type": "application/json",
        "webhook-id": event.eventId,
        "X-MCP-Subscription-Id": id,
      });
      expect(request.headers["webhook-signature"]).toBe(signWebhook({
        secret: testSecret,
        messageId: event.eventId,
        timestampSeconds: Math.floor(now.getTime() / 1000),
        body: request.body,
      }));
      expect((await harness.deliveries())[0].status).toBe("delivered");
      expect(await dispatcher.run()).toMatchObject({ claimed: 0 });
    });

    it("signs with both secrets during a rotation window, then only the new one", async () => {
      const id = await queueOne();
      await service.subscribe({
        name: "article.published",
        arguments: {},
        delivery: { mode: "webhook", url: callbackUrl, secret: otherSecret },
      });
      await dispatcher.run();
      expect(client.requests[client.requests.length - 1].headers["webhook-signature"].split(" ")).toHaveLength(2);

      source.articles = [article({ id: "a2", publishedAt: "2026-10-10T12:30:00.000Z" })];
      advance(2 * 60 * minute);
      await service.subscribe({
        name: "article.published",
        arguments: {},
        delivery: { mode: "webhook", url: callbackUrl, secret: otherSecret },
      });
      expect((await harness.subscription(id))!.previousSecret).toBeNull();
      await enqueuer.run();
      client.requests.length = 0;
      await dispatcher.run();
      expect(client.requests[0].headers["webhook-signature"].split(" ")).toHaveLength(1);
    });

    it("retries transient failures with exponential backoff, keeping the event id", async () => {
      await queueOne();
      client.respond = () => ({ status: 503, body: "" });

      expect(await dispatcher.run()).toMatchObject({ claimed: 1, retried: 1 });
      let [row] = await harness.deliveries();
      expect(row).toMatchObject({ status: "pending", attempts: 1, lastErrorCode: "http_503" });
      expect(row.availableAt).toBe(Date.parse(nextDeliveryAt(1, now)));
      expect(await dispatcher.run()).toMatchObject({ claimed: 0 });

      advance(31 * 1000);
      client.respond = () => { throw new WebhookTransportError("timeout", "slow"); };
      expect(await dispatcher.run()).toMatchObject({ retried: 1 });
      [row] = await harness.deliveries();
      expect(row.availableAt).toBe(Date.parse(nextDeliveryAt(2, now)));
      expect(Date.parse(nextDeliveryAt(2, now)) - now.getTime()).toBe(60_000);

      advance(61 * 1000);
      client.respond = () => ({ status: 200, body: "" });
      expect(await dispatcher.run()).toMatchObject({ delivered: 1 });
      expect(new Set(client.requests.map((request) => request.headers["webhook-id"])).size).toBe(1);
      // A fresh signing timestamp is generated for each attempt.
      expect(client.requests.map((request) => request.headers["webhook-timestamp"]).length).toBe(3);
    });

    it("caps backoff at one hour and fails after the bounded number of attempts", async () => {
      expect(Date.parse(nextDeliveryAt(20, now)) - now.getTime()).toBe(60 * minute);
      await queueOne();
      client.respond = () => ({ status: 500, body: "" });

      for (let attempt = 1; attempt < maximumDeliveryAttempts; attempt += 1) {
        advance(61 * minute);
        expect(await dispatcher.run()).toMatchObject({ retried: 1 });
      }
      advance(61 * minute);
      expect(await dispatcher.run()).toMatchObject({ failed: 1, retried: 0 });
      expect((await harness.deliveries())[0]).toMatchObject({ status: "failed", attempts: maximumDeliveryAttempts });
    });

    it("does not retry 413 and keeps the subscription", async () => {
      const id = await queueOne();
      client.respond = () => ({ status: 413, body: "" });
      expect(await dispatcher.run()).toMatchObject({ failed: 1, retried: 0 });
      expect((await harness.deliveries())[0]).toMatchObject({ status: "failed", lastErrorCode: "http_413" });
      expect((await harness.subscription(id))!.status).toBe("active");
    });

    it("does not retry 410 and deactivates the subscription", async () => {
      const id = await queueOne();
      client.respond = () => ({ status: 410, body: "" });
      expect(await dispatcher.run()).toMatchObject({ failed: 1, retried: 0 });
      expect((await harness.deliveries())[0].status).toBe("failed");
      expect((await harness.subscription(id))!.status).toBe("gone");
      source.articles = [article({ id: "a2", publishedAt: "2026-10-10T12:30:00.000Z" })];
      advance(minute);
      expect((await enqueuer.run()).subscriptions).toBe(0);
    });

    it("fails permanently on blocked addresses but retries other transport errors", async () => {
      await queueOne();
      client.respond = () => { throw new WebhookTransportError("blocked_address", "private"); };
      expect(await dispatcher.run()).toMatchObject({ failed: 1 });
      expect((await harness.deliveries())[0].lastErrorCode).toBe("blocked_address");
    });

    it("cancels pending deliveries once the subscription is unsubscribed or expired", async () => {
      const { id } = await subscribe({}, "https://gone.example.com/cb");
      advance(minute);
      source.articles = [article({ id: "a1", publishedAt: "2026-10-10T12:00:30.000Z" })];
      await enqueuer.run();
      client.requests.length = 0;

      await service.unsubscribe({
        name: "article.published",
        arguments: {},
        delivery: { mode: "webhook", url: "https://gone.example.com/cb" },
      });
      expect((await harness.subscription(id))!.status).toBe("unsubscribed");
      expect(await dispatcher.run()).toMatchObject({ claimed: 0 });
      expect(client.requests).toHaveLength(0);
    });

    it("cancels a claimed delivery whose subscription expired in the meantime", async () => {
      await queueOne();
      const [subscription] = await harness.subscriptions();
      const claimedAt = now;
      const { repository } = harness;
      const original = repository.claim.bind(repository);
      repository.claim = async (input) => {
        const claimed = await original(input);
        await harness.expire(subscription.id, new Date(claimedAt.getTime() - 1).toISOString());
        return claimed;
      };
      expect(await dispatcher.run()).toMatchObject({ cancelled: 1 });
      expect((await harness.deliveries())[0].status).toBe("cancelled");
      expect(client.requests).toHaveLength(0);
    });

    it("reclaims deliveries whose lease lapsed without an outcome", async () => {
      await queueOne();
      const claimed = await harness.repository.claim({ workerToken: "w1", limit: 5, leaseSeconds: 90, now });
      expect(claimed).toHaveLength(1);
      expect(await dispatcher.run()).toMatchObject({ claimed: 0 });
      advance(91 * 1000);
      expect(await dispatcher.run()).toMatchObject({ claimed: 1, delivered: 1 });
    });
  });

  describe("McpEventsWorker", () => {
    it("enqueues, delivers and prunes old rows in one run", async () => {
      await subscribe();
      advance(minute);
      source.articles = [article({ id: "a1", publishedAt: "2026-10-10T12:00:30.000Z" })];
      client.requests.length = 0;
      const worker = new McpEventsWorker(enqueuer, dispatcher, harness.repository, clock);

      expect(await worker.run()).toEqual({
        enqueue: { subscriptions: 1, enqueued: 1 },
        dispatch: { claimed: 1, delivered: 1, retried: 0, failed: 0, cancelled: 0 },
      });

      advance(15 * 24 * 60 * minute);
      await worker.run();
      expect(await harness.deliveries()).toHaveLength(0);
      expect(await harness.subscriptions()).toHaveLength(0);
    });
  });
});
