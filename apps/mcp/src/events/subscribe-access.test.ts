import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MemoryMcpEventsRepository } from "@atlasnews/adapters/mcp-events/memory-repository";
import { createSitesTestStore, type SitesTestStore } from "@atlasnews/adapters/sites/testing";
import { CallbackVerifier } from "@atlasnews/core/mcp-events/application/callback-verifier";
import { DefaultMcpEventsService } from "@atlasnews/core/mcp-events/application/mcp-events-service";
import { FakeWebhookClient, callbackUrl, testSecret } from "@atlasnews/core/mcp-events/test-support";

import { apiKeyVerifier } from "../auth";
import { handleMcpRequest } from "../http";
import { memoryPorts, modernParams, rpcRequest, testApiKey } from "../mcp-test-client";

// events/subscribe makes this server call an address the caller chose, so only a signed-in caller may.

afterEach(() => vi.unstubAllEnvs());

function setup() {
  const repository = new MemoryMcpEventsRepository();
  const client = new FakeWebhookClient();
  const events = new DefaultMcpEventsService(repository, new CallbackVerifier(client));
  const call = (method: string, init: { authorization?: string; headers?: Record<string, string> } = {}) => {
    const request = rpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: modernParams(method === "events/subscribe"
        ? { name: "article.published", arguments: {}, delivery: { mode: "webhook", url: callbackUrl, secret: testSecret } }
        : {}),
    }, undefined, init.authorization);
    for (const [name, value] of Object.entries(init.headers ?? {})) request.headers.set(name, value);
    return handleMcpRequest(request, {
      verifier: apiKeyVerifier(() => testApiKey),
      createPorts: () => memoryPorts(),
      events,
    });
  };
  return { call, repository, client };
}

describe("events/subscribe access", () => {
  it("answers an anonymous caller with 401 and a Bearer challenge, before the callback is called", async () => {
    const { call, repository, client } = setup();
    const response = await call("events/subscribe", { headers: { Origin: "https://chatgpt.com" } });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer realm="atlasnews", .*error="invalid_token"/);
    // Public, like the challenge for a scoped tool, so that a browser host can read it.
    expect(response.headers.get("access-control-allow-origin")).toBe("https://chatgpt.com");
    expect((await response.json()).error.code).toBe(-32001);
    expect(client.requests).toHaveLength(0);
    expect(repository.subscriptions.size).toBe(0);
  });

  it("still lists the events for an anonymous caller", async () => {
    const { call } = setup();
    const response = await call("events/list");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("article.published");
  });

  it("subscribes a signed-in caller under its own subject", async () => {
    const { call, repository, client } = setup();
    const response = await call("events/subscribe", { authorization: `Bearer ${testApiKey}` });
    expect(response.status).toBe(200);
    expect(client.requests).toHaveLength(1);
    expect([...repository.subscriptions.values()].map((subscription) => subscription.principal)).toEqual(["mcp-admin"]);
  });

  describe("on Sites", () => {
    let store: SitesTestStore;
    beforeAll(async () => {
      store = await createSitesTestStore({ register: true });
    });
    afterAll(() => store.dispose());

    it("lets a signed-in reader, who has no newsroom scope, subscribe, and turns an anonymous caller away", async () => {
      vi.stubEnv("ATLASNEWS_ADMIN_EMAILS", "owner@example.com");
      const { call, repository } = setup();
      const reader = { "oai-authenticated-user-id": "chatgpt-user-7", "oai-authenticated-user-email": "reader@example.com" };

      expect((await call("events/subscribe")).status).toBe(401);
      expect((await call("events/subscribe", { headers: reader })).status).toBe(200);
      expect([...repository.subscriptions.values()].map((subscription) => subscription.principal)).toEqual(["chatgpt-user-7"]);
    });
  });
});
