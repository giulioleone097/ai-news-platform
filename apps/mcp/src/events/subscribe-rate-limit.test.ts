import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryMcpEventsRepository } from "@atlasnews/adapters/mcp-events/memory-repository";
import { CallbackVerifier } from "@atlasnews/core/mcp-events/application/callback-verifier";
import { DefaultMcpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";
import { FakeWebhookClient, callbackUrl, testSecret } from "@atlasnews/core/mcp-events/test-support";

import { apiKeyVerifier } from "../auth";
import { handleMcpRequest } from "../http";
import { memoryPorts, modernParams, rpcRequest, testApiKey } from "../mcp-test-client";
import { SubscribeRateLimiter } from "./subscribe-rate-limit";

afterEach(() => vi.unstubAllEnvs());

function setup() {
  let now = 1_000_000;
  const limiter = new SubscribeRateLimiter(() => now);
  const events = new DefaultMcpEventsService(new MemoryMcpEventsRepository(), new CallbackVerifier(new FakeWebhookClient()));
  const subscribe = async (authorization = `Bearer ${testApiKey}`, path = "a") => {
    const request = rpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "events/subscribe",
      params: modernParams({
        name: "article.published",
        arguments: {},
        delivery: { mode: "webhook", url: `${callbackUrl}/${path}`, secret: testSecret },
      }),
    }, undefined, authorization);
    return handleMcpRequest(request, {
      verifier: apiKeyVerifier(() => testApiKey),
      createPorts: () => memoryPorts(),
      events,
      subscribeLimiter: limiter,
    });
  };
  return { subscribe, advance: (ms: number) => { now += ms; }, limiter };
}

describe("events/subscribe throttle", () => {
  it("answers 429 with Retry-After over the limit and starts a new window after a minute", async () => {
    vi.stubEnv("ATLASNEWS_MCP_EVENTS_SUBSCRIBES_PER_MINUTE", "2");
    const { subscribe, advance } = setup();

    const first = await subscribe(undefined, "a");
    expect(first.status).toBe(200);
    expect((await first.json()).result.id).toEqual(expect.any(String));
    expect((await subscribe(undefined, "b")).status).toBe(200);

    const limited = await subscribe(undefined, "c");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await limited.json()).error.message).toMatch(/Too many/);

    advance(61_000);
    expect((await subscribe(undefined, "c")).status).toBe(200);
  });

  it("does not count other MCP calls", async () => {
    vi.stubEnv("ATLASNEWS_MCP_EVENTS_SUBSCRIBES_PER_MINUTE", "1");
    const { limiter } = setup();
    const request = rpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: modernParams() });
    for (let index = 0; index < 5; index += 1) {
      const response = await handleMcpRequest(request.clone(), {
        verifier: apiKeyVerifier(() => testApiKey),
        createPorts: () => memoryPorts(),
        subscribeLimiter: limiter,
      });
      expect(response.status).toBe(200);
    }
  });
});

describe("SubscribeRateLimiter", () => {
  it("keeps one window per caller, so one caller cannot hold back another", () => {
    const limiter = new SubscribeRateLimiter(() => 0);
    expect(limiter.take("editor-1", 2)).toBeNull();
    expect(limiter.take("editor-1", 2)).toBeNull();
    expect(limiter.take("editor-1", 2)).toBe(60);
    expect(limiter.take("editor-2", 2)).toBeNull();
  });

  it("stays bounded under many distinct callers", () => {
    const limiter = new SubscribeRateLimiter(() => 0);
    for (let index = 0; index < 25_000; index += 1) limiter.take(`editor-${index}`, 1);
    expect((limiter as unknown as { windows: Map<string, unknown> }).windows.size).toBeLessThanOrEqual(10_000);
  });
});
