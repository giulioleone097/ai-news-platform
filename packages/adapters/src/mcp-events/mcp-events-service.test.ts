import { beforeEach, describe, expect, it } from "vitest";

import { McpEventsError } from "@atlasnews/core/mcp-events/domain/errors";
import { WebhookTransportError } from "@atlasnews/core/mcp-events/domain/errors";
import { MemoryMcpEventsRepository } from "./memory-repository";
import { FakeWebhookClient, callbackUrl, otherSecret, testSecret } from "@atlasnews/core/mcp-events/test-support";
import { CallbackVerifier } from "@atlasnews/core/mcp-events/application/callback-verifier";
import { deriveSubscriptionId } from "@atlasnews/core/mcp-events/application/canonical-json";
import {
  DefaultMcpEventsService,
  maximumSubscriptionsPerHost,
  secretRotationWindowMs,
  verificationCacheMs,
} from "@atlasnews/core/mcp-events/application/mcp-events-service";
import { signWebhook } from "@atlasnews/core/mcp-events/application/webhook-signing";

const hour = 3600 * 1000;
let now: Date;
let client: FakeWebhookClient;
let repository: MemoryMcpEventsRepository;
let service: DefaultMcpEventsService;

const delivery = (overrides = {}) => ({ mode: "webhook", url: callbackUrl, secret: testSecret, ...overrides });
const subscribe = (overrides: Record<string, unknown> = {}) => service.subscribe({
  name: "article.published",
  arguments: { locale: "en" },
  delivery: delivery(),
  ...overrides,
});
const expectError = async (promise: Promise<unknown>, kind: string, reason?: string) => {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(McpEventsError);
  expect(error).toMatchObject({ kind, reason });
};

beforeEach(() => {
  now = new Date("2026-10-10T12:00:00.000Z");
  client = new FakeWebhookClient();
  repository = new MemoryMcpEventsRepository();
  service = new DefaultMcpEventsService(repository, new CallbackVerifier(client, () => now), () => now);
});

describe("events/list", () => {
  it("describes article.published with filters and payload", async () => {
    const { events } = await service.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: "article.published",
      delivery: ["webhook"],
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          locale: { enum: ["en", "it"] },
          category: { type: "string", maxLength: 80 },
          entity: { type: "string", maxLength: 80 },
          claim_status: { enum: ["confirmed", "rollout", "test", "rumour", "analysis"] },
        },
      },
      payloadSchema: {
        type: "object",
        additionalProperties: false,
        required: [
          "article_slug", "locale", "title", "excerpt",
          "category_slug", "category_name", "url", "published_at",
          "claim_status", "entity_slugs",
        ],
      },
    });
    expect(events[0].inputSchema.required).toBeUndefined();
    expect(events[0].inputSchema).not.toHaveProperty("$schema");
  });
});

describe("events/subscribe", () => {
  it("verifies the callback with a signed challenge, then stores an active subscription", async () => {
    const result = await subscribe();

    const id = deriveSubscriptionId({
      principal: "public",
      url: callbackUrl,
      name: "article.published",
      arguments: { locale: "en" },
    });
    expect(result).toEqual({
      id,
      refreshBefore: new Date(now.getTime() + 7 * 24 * hour).toISOString(),
      cursor: null,
      truncated: false,
    });

    expect(client.requests).toHaveLength(1);
    const request = client.requests[0];
    const body = JSON.parse(request.body) as { type: string; challenge: string };
    expect(body.type).toBe("verification");
    expect(body.challenge.length).toBeGreaterThanOrEqual(16);
    expect(request.timeoutMs).toBe(5000);
    expect(request.url).toBe(callbackUrl);
    expect(request.headers["webhook-id"]).toMatch(/^msg_verification_/);
    expect(request.headers["X-MCP-Subscription-Id"]).toBe(id);
    expect(request.headers["webhook-signature"]).toBe(signWebhook({
      secret: testSecret,
      messageId: request.headers["webhook-id"],
      timestampSeconds: Number(request.headers["webhook-timestamp"]),
      body: request.body,
    }));

    expect(repository.subscriptions.get(id)).toMatchObject({
      status: "active",
      checkpoint: now.toISOString(),
      verifiedAt: now.toISOString(),
      host: "receiver.example.com",
      arguments: { locale: "en" },
    });
  });

  it("is idempotent: key order does not create duplicates and refresh keeps the checkpoint", async () => {
    const first = await subscribe({ arguments: { category: "models", locale: "en" } });
    const checkpoint = repository.subscriptions.get(first.id)!.checkpoint;
    repository.subscriptions.get(first.id)!.checkpoint = "2026-10-10T12:30:00.000Z";

    now = new Date(now.getTime() + 2 * hour);
    const second = await subscribe({ arguments: { locale: "en", category: "models" }, ttlMs: 3 * hour });

    expect(second.id).toBe(first.id);
    expect(repository.subscriptions.size).toBe(1);
    expect(second.refreshBefore).toBe(new Date(now.getTime() + 3 * hour).toISOString());
    expect(repository.subscriptions.get(first.id)!.checkpoint).toBe("2026-10-10T12:30:00.000Z");
    expect(checkpoint).toBe("2026-10-10T12:00:00.000Z");
    expect(client.requests).toHaveLength(1);
  });

  it("caches verification per principal, URL and secret for 24 hours", async () => {
    await subscribe();
    await subscribe({ arguments: { locale: "it" } });
    expect(client.requests).toHaveLength(1);
    const stored = [...repository.subscriptions.values()].map((item) => item.verifiedAt);
    expect(new Set(stored).size).toBe(1);

    now = new Date(now.getTime() + verificationCacheMs + 1000);
    await subscribe({ arguments: { locale: "it" } });
    expect(client.requests).toHaveLength(2);
  });

  it("grants the requested lifetime between one hour and thirty days and never null", async () => {
    expect((await subscribe({ ttlMs: 10 })).refreshBefore).toBe(new Date(now.getTime() + hour).toISOString());
    expect((await subscribe({ ttlMs: 999 * 24 * hour })).refreshBefore)
      .toBe(new Date(now.getTime() + 30 * 24 * hour).toISOString());
    expect((await subscribe({ ttlMs: null })).refreshBefore)
      .toBe(new Date(now.getTime() + 7 * 24 * hour).toISOString());
  });

  it("rotates the signing secret and keeps the previous one for a short window", async () => {
    const { id } = await subscribe();
    await subscribe({ delivery: delivery({ secret: otherSecret }) });

    const stored = repository.subscriptions.get(id)!;
    expect(stored.secret).toBe(otherSecret);
    expect(stored.previousSecret).toBe(testSecret);
    expect(stored.previousSecretExpiresAt).toBe(new Date(now.getTime() + secretRotationWindowMs).toISOString());
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1].headers["webhook-signature"]).not.toContain(" ");
  });

  it("restarts from now when a lapsed subscription is renewed", async () => {
    const { id } = await subscribe({ ttlMs: hour });
    now = new Date(now.getTime() + 5 * hour);
    await subscribe({ ttlMs: hour });
    expect(repository.subscriptions.get(id)!.checkpoint).toBe(now.toISOString());
  });

  it.each([
    ["unknown event", { name: "article.deleted" }],
    ["unknown argument", { arguments: { author: "x" } }],
    ["bad locale", { arguments: { locale: "fr" } }],
    ["bad category slug", { arguments: { category: "Not A Slug" } }],
    ["bad entity slug", { arguments: { entity: "Not A Slug" } }],
    ["unknown claim status", { arguments: { claim_status: "maybe" } }],
    ["non-webhook mode", { delivery: delivery({ mode: "poll" }) }],
    ["secret without prefix", { delivery: delivery({ secret: "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" }) }],
    ["short secret", { delivery: delivery({ secret: `whsec_${Buffer.alloc(8).toString("base64")}` }) }],
  ])("rejects %s as invalid params", async (_label, overrides) => {
    await expectError(subscribe(overrides), "invalid_params");
    expect(client.requests).toHaveLength(0);
  });

  it.each([
    ["http://receiver.example.com/cb"],
    ["https://user:secret@receiver.example.com/cb"],
    ["not a url"],
  ])("rejects callback %s as invalid_url", async (url) => {
    await expectError(subscribe({ delivery: delivery({ url }) }), "callback_error", "invalid_url");
    expect(repository.subscriptions.size).toBe(0);
  });

  it.each([
    ["timeout", new WebhookTransportError("timeout", "t"), "timeout"],
    ["blocked", new WebhookTransportError("blocked_address", "b"), "blocked_address"],
    ["network", new WebhookTransportError("network", "n"), "http_error"],
  ])("maps a %s transport failure to a categorized callback error", async (_label, failure, reason) => {
    client.respond = () => { throw failure; };
    await expectError(subscribe(), "callback_error", reason);
    expect(repository.subscriptions.size).toBe(0);
  });

  it("fails on non-2xx answers and on a wrong or missing challenge", async () => {
    client.respond = () => ({ status: 500, body: "" });
    await expectError(subscribe(), "callback_error", "http_error");
    client.respond = () => ({ status: 302, body: "" });
    await expectError(subscribe(), "callback_error", "http_error");
    client.respond = () => ({ status: 200, body: JSON.stringify({ challenge: "wrong" }) });
    await expectError(subscribe(), "callback_error", "challenge_failed");
    client.respond = () => ({ status: 200, body: "not json" });
    await expectError(subscribe(), "callback_error", "challenge_failed");
    expect(repository.subscriptions.size).toBe(0);
  });

  it("limits live subscriptions per callback hostname", async () => {
    for (let index = 0; index < maximumSubscriptionsPerHost; index += 1) {
      await subscribe({ delivery: delivery({ url: `https://receiver.example.com/cb/${index}` }) });
    }
    await expectError(
      subscribe({ delivery: delivery({ url: "https://receiver.example.com/cb/extra" }) }),
      "invalid_params",
      "subscription_limit",
    );
    // Refreshing an existing one still works, and other hosts are unaffected.
    await subscribe({ delivery: delivery({ url: "https://receiver.example.com/cb/0" }) });
    await subscribe({ delivery: delivery({ url: "https://another.example.org/cb" }) });
  });
});

describe("events/unsubscribe", () => {
  it("deactivates the matching subscription and is idempotent", async () => {
    const { id } = await subscribe();
    const params = { name: "article.published", arguments: { locale: "en" }, delivery: { mode: "webhook", url: callbackUrl } };

    await expect(service.unsubscribe(params)).resolves.toEqual({});
    expect(repository.subscriptions.get(id)!.status).toBe("unsubscribed");
    await expect(service.unsubscribe(params)).resolves.toEqual({});
    await expect(service.unsubscribe({ ...params, arguments: { locale: "it" } })).resolves.toEqual({});
    expect(repository.subscriptions.get(id)!.status).toBe("unsubscribed");
  });

  it("can be re-subscribed afterwards", async () => {
    const { id } = await subscribe();
    await service.unsubscribe({ name: "article.published", arguments: { locale: "en" }, delivery: { mode: "webhook", url: callbackUrl } });
    await subscribe();
    expect(repository.subscriptions.get(id)!.status).toBe("active");
  });
});
