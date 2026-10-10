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
  const subscribe = async (headers: Record<string, string> = {}, path = "a") => {
    const request = rpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "events/subscribe",
      params: modernParams({
        name: "article.published",
        arguments: {},
        delivery: { mode: "webhook", url: `${callbackUrl}/${path}`, secret: testSecret },
      }),
    });
    for (const [name, value] of Object.entries(headers)) request.headers.set(name, value);
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
  it("lets ChatGPT's anonymous subscribe through and answers 429 with Retry-After over the limit", async () => {
    vi.stubEnv("ATLASNEWS_MCP_EVENTS_SUBSCRIBES_PER_MINUTE", "2");
    const { subscribe, advance } = setup();

    const first = await subscribe({}, "a");
    expect(first.status).toBe(200);
    expect((await first.json()).result.id).toEqual(expect.any(String));
    expect((await subscribe({}, "b")).status).toBe(200);

    const limited = await subscribe({}, "c");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await limited.json()).error.message).toMatch(/Too many/);

    advance(61_000);
    expect((await subscribe({}, "c")).status).toBe(200);
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
  it("shares one window while no client address header is trusted, whatever the caller sends", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "");
    const limiter = new SubscribeRateLimiter(() => 0);
    expect(limiter.take(new Headers({ "x-forwarded-for": "198.51.100.1" }), 2)).toBeNull();
    expect(limiter.take(new Headers({ "x-forwarded-for": "198.51.100.2" }), 2)).toBeNull();
    expect(limiter.take(new Headers({ "x-forwarded-for": "198.51.100.3" }), 2)).toBe(60);
  });

  it("keeps one window per network behind the one trusted header, and ignores spoofing of any other", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "cf-connecting-ip");
    const limiter = new SubscribeRateLimiter(() => 0);
    const from = (address: string, spoof: string) => new Headers({ "cf-connecting-ip": address, "x-forwarded-for": spoof });
    expect(limiter.take(from("203.0.113.1", "1.1.1.1"), 1)).toBeNull();
    expect(limiter.take(from("203.0.113.1", "2.2.2.2"), 1)).toBe(60);
    expect(limiter.take(from("203.0.113.2", "1.1.1.1"), 1)).toBeNull();
  });

  it("stays bounded under many distinct networks", () => {
    vi.stubEnv("ATLASNEWS_CLIENT_IP_HEADER", "cf-connecting-ip");
    const limiter = new SubscribeRateLimiter(() => 0);
    for (let index = 0; index < 25_000; index += 1) {
      limiter.take(new Headers({ "cf-connecting-ip": `10.${index >> 16}.${(index >> 8) & 255}.${index & 255}` }), 1);
    }
    expect((limiter as unknown as { windows: Map<string, unknown> }).windows.size).toBeLessThanOrEqual(10_000);
  });
});
