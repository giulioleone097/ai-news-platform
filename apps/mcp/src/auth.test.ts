import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createSitesTestStore, type SitesTestStore } from "@atlasnews/adapters/sites/testing";
import { scopes } from "@atlasnews/contract";

import { apiKeyVerifier, resolvePrincipal } from "./auth";
import { handleMcpRequest } from "./http";
import { memoryPorts, modernParams, rpcRequest, testApiKey } from "./mcp-test-client";

// The trust boundary of the `oai-authenticated-*` headers: they identify a caller on ChatGPT Sites and
// nowhere else, and the owner can switch them off (`ATLASNEWS_CHATGPT_SIGN_IN=off`).

const adminEmail = "owner@example.com";
const verifier = apiKeyVerifier(() => testApiKey);

/** What a client that forges the headers sends, or what the platform injects for a signed-in visitor. */
function withIdentity(email: string, authorization?: string) {
  const request = rpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: modernParams() }, undefined, authorization);
  request.headers.set("oai-authenticated-user-id", "probe");
  request.headers.set("oai-authenticated-user-email", email);
  return request;
}

function adminToolCall(email: string) {
  const request = rpcRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: modernParams({ name: "admin_list_articles", arguments: { locale: "en" } }),
  });
  request.headers.set("oai-authenticated-user-id", "probe");
  request.headers.set("oai-authenticated-user-email", email);
  return request;
}

const callAdminTool = (email: string) =>
  handleMcpRequest(adminToolCall(email), { verifier, createPorts: () => memoryPorts() });

describe("identity headers on /mcp", () => {
  let store: SitesTestStore;
  beforeAll(async () => {
    store = await createSitesTestStore({ register: true });
  });
  afterAll(() => store.dispose());
  afterEach(() => vi.unstubAllEnvs());

  function signInAs() {
    vi.stubEnv("ATLASNEWS_ADMIN_EMAILS", adminEmail);
    vi.stubEnv("ATLASNEWS_EDITOR_EMAILS", "");
  }

  describe("in sites mode", () => {
    it("makes a listed admin an editor with every scope and runs the admin tool", async () => {
      signInAs();
      const principal = await resolvePrincipal(withIdentity(adminEmail), verifier);
      expect(principal).toMatchObject({ kind: "editor", subject: "probe", scopes });
      expect((await callAdminTool(adminEmail)).status).toBe(200);
    });

    it("gives a signed-in reader a subject and no newsroom scope, so the admin tool refuses", async () => {
      signInAs();
      expect(await resolvePrincipal(withIdentity("reader@example.com"), verifier))
        .toEqual({ kind: "editor", subject: "probe", scopes: [] });
      const response = await callAdminTool("reader@example.com");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("insufficient_scope");
    });

    it("treats a request without the headers as anonymous", async () => {
      signInAs();
      const request = rpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: modernParams() });
      expect(await resolvePrincipal(request, verifier)).toEqual({ kind: "anonymous", scopes: [] });
    });

    it("reads identity from the headers only: a valid API key is no credential here", async () => {
      signInAs();
      const principal = await resolvePrincipal(rpcRequest({}, undefined, `Bearer ${testApiKey}`), verifier);
      expect(principal).toEqual({ kind: "anonymous", scopes: [] });
    });

    it("ignores the headers while the owner has switched ChatGPT sign-in off", async () => {
      signInAs();
      vi.stubEnv("ATLASNEWS_CHATGPT_SIGN_IN", "off");
      expect(await resolvePrincipal(withIdentity(adminEmail), verifier)).toEqual({ kind: "anonymous", scopes: [] });
      const response = await callAdminTool(adminEmail);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('scope="newsroom.read"');
    });
  });

  describe.each(["demo", "supabase"])("in %s mode", (mode) => {
    it("treats a request that carries the headers as anonymous, even for a listed admin", async () => {
      signInAs();
      vi.stubEnv("ATLASNEWS_CONTENT_MODE", mode);
      expect(await resolvePrincipal(withIdentity(adminEmail), verifier)).toEqual({ kind: "anonymous", scopes: [] });
      expect((await callAdminTool(adminEmail)).status).toBe(401);
    });
  });
});
