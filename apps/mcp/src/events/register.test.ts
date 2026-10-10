import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  createMcpHandler,
} from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it } from "vitest";

import { CallbackVerifier } from "@atlasnews/core/mcp-events/application/callback-verifier";
import { deriveSubscriptionId } from "@atlasnews/core/mcp-events/application/canonical-json";
import { DefaultMcpEventsService, type McpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";
import { MemoryMcpEventsRepository } from "@atlasnews/adapters/mcp-events/memory-repository";
import { FakeWebhookClient, callbackUrl, testSecret } from "@atlasnews/core/mcp-events/test-support";
import { registerMcpEvents } from "./register";

const protocolVersion = "2026-07-28";
let repository: MemoryMcpEventsRepository;
let client: FakeWebhookClient;
let service: McpEventsService;

function createHandler(events: McpEventsService | null) {
  return createMcpHandler(
    () => {
      const server = new McpServer({ name: "atlasnews-test", version: "2.0.0" });
      registerMcpEvents(server, { service: events });
      return server;
    },
    { legacy: "stateless", responseMode: "auto" },
  );
}

async function call(method: string, params: Record<string, unknown> = {}, events: McpEventsService | null = service) {
  const handler = createHandler(events);
  const response = await handler.fetch(new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": protocolVersion,
      "MCP-Method": method,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          [PROTOCOL_VERSION_META_KEY]: protocolVersion,
          [CLIENT_INFO_META_KEY]: { name: "chatgpt-test", version: "1.0.0" },
          [CLIENT_CAPABILITIES_META_KEY]: {},
        },
      },
    }),
  }));
  const text = await response.text();
  await handler.close().catch(() => undefined);
  return JSON.parse(
    response.headers.get("content-type")?.includes("text/event-stream")
      ? text.split("\n").find((line) => line.startsWith("data: "))!.slice(6)
      : text,
  );
}

const subscribeParams = (overrides: Record<string, unknown> = {}) => ({
  name: "article.published",
  arguments: { locale: "en", category: "models" },
  delivery: { mode: "webhook", url: callbackUrl, secret: testSecret },
  cursor: null,
  ...overrides,
});

beforeEach(() => {
  repository = new MemoryMcpEventsRepository();
  client = new FakeWebhookClient();
  service = new DefaultMcpEventsService(repository, new CallbackVerifier(client));
});

describe("MCP Events over createMcpHandler", () => {
  it("advertises the events capability in server/discover", async () => {
    const payload = await call("server/discover");
    expect(payload.result.capabilities.events).toEqual({});
  });

  it("registers nothing when persistence is unavailable", async () => {
    const discovered = await call("server/discover", {}, null);
    expect(discovered.result.capabilities.events).toBeUndefined();
    const listed = await call("events/list", {}, null);
    expect(listed.error.code).toBe(-32601);
  });

  it("lists the article.published definition", async () => {
    const payload = await call("events/list");
    expect(payload.error).toBeUndefined();
    expect(payload.result.events).toHaveLength(1);
    expect(payload.result.events[0]).toMatchObject({
      name: "article.published",
      delivery: ["webhook"],
      inputSchema: { additionalProperties: false },
      payloadSchema: { additionalProperties: false },
    });
  });

  it("subscribes, verifies the callback and is idempotent on refresh", async () => {
    const first = await call("events/subscribe", subscribeParams());
    expect(first.error).toBeUndefined();
    const id = deriveSubscriptionId({
      principal: "public",
      url: callbackUrl,
      name: "article.published",
      arguments: { category: "models", locale: "en" },
    });
    expect(first.result).toMatchObject({ id, cursor: null, truncated: false });
    expect(Date.parse(first.result.refreshBefore)).toBeGreaterThan(Date.now());
    expect(client.requests).toHaveLength(1);

    const refreshed = await call("events/subscribe", subscribeParams({ arguments: { category: "models", locale: "en" } }));
    expect(refreshed.result.id).toBe(id);
    expect(repository.subscriptions.size).toBe(1);
    expect(client.requests).toHaveLength(1);
  });

  it("answers invalid params with -32602", async () => {
    const unknown = await call("events/subscribe", subscribeParams({ name: "article.deleted" }));
    expect(unknown.error.code).toBe(-32602);
    const badSecret = await call("events/subscribe", subscribeParams({
      delivery: { mode: "webhook", url: callbackUrl, secret: "plain" },
    }));
    expect(badSecret.error.code).toBe(-32602);
    const malformed = await call("events/subscribe", { name: "article.published" });
    expect(malformed.error.code).toBe(-32602);
    expect(repository.subscriptions.size).toBe(0);
  });

  it("answers callback failures with -32015 and a categorized reason", async () => {
    client.respond = () => ({ status: 200, body: JSON.stringify({ challenge: "nope" }) });
    const failed = await call("events/subscribe", subscribeParams());
    expect(failed.error.code).toBe(-32015);
    expect(failed.error.data).toEqual({ reason: "challenge_failed" });

    const insecure = await call("events/subscribe", subscribeParams({
      delivery: { mode: "webhook", url: "http://receiver.example.com/cb", secret: testSecret },
    }));
    expect(insecure.error.code).toBe(-32015);
    expect(insecure.error.data).toEqual({ reason: "invalid_url" });
  });

  it("reports the per-host limit as invalid params with a reason", async () => {
    for (let index = 0; index < 25; index += 1) {
      await service.subscribe({
        name: "article.published",
        arguments: {},
        delivery: { mode: "webhook", url: `https://receiver.example.com/cb/${index}`, secret: testSecret },
      });
    }
    const limited = await call("events/subscribe", subscribeParams());
    expect(limited.error.code).toBe(-32602);
    expect(limited.error.data).toEqual({ reason: "subscription_limit" });
  });

  it("masks persistence failures", async () => {
    const broken: McpEventsService = {
      ...service,
      subscribe: async () => { throw new Error("relation mcp_event_subscriptions secret leak"); },
    };
    const payload = await call("events/subscribe", subscribeParams(), broken);
    expect(payload.error.code).toBe(-32603);
    expect(payload.error.message).not.toContain("secret");
  });

  it("unsubscribes idempotently with an empty result", async () => {
    await call("events/subscribe", subscribeParams());
    const params = {
      name: "article.published",
      arguments: { locale: "en", category: "models" },
      delivery: { mode: "webhook", url: callbackUrl },
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const payload = await call("events/unsubscribe", params);
      expect(payload.error).toBeUndefined();
      expect(Object.keys(payload.result).filter((key) => key !== "_meta" && key !== "resultType")).toEqual([]);
    }
    expect([...repository.subscriptions.values()][0].status).toBe("unsubscribed");
  });
});
