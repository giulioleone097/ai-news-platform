import { afterEach, describe, expect, it, vi } from "vitest";
import { SERVER_INFO_META_KEY } from "@modelcontextprotocol/server";

import { MemoryEditorialRepository } from "@atlasnews/adapters/editorial/memory-editorial-repository";
import { listPublishedArticleComments, mcpCapabilities, scopes } from "@atlasnews/contract";

import { appToolNames } from "./apps";
import { apiKeyVerifier, resolvePrincipal } from "./auth";
import { handleMcpRequest, mcpOptionsResponse } from "./http";
import { mcpProtocolVersion } from "./metadata";
import { memoryPorts, modernParams, rpcRequest, sendRpc, testApiKey } from "./mcp-test-client";
import { GET as getMcpInfo } from "./routes/info";
import { GET as getResourceMetadata } from "./routes/oauth-metadata";

const originalAllowedOrigins = process.env.MCP_ALLOWED_ORIGINS;

afterEach(() => {
  if (originalAllowedOrigins === undefined) delete process.env.MCP_ALLOWED_ORIGINS;
  else process.env.MCP_ALLOWED_ORIGINS = originalAllowedOrigins;
});

type Tool = {
  name: string;
  annotations: Record<string, boolean>;
  _meta: { securitySchemes: Array<{ type: string; scopes?: string[] }> };
  inputSchema: { properties: Record<string, unknown> };
};

const call = (name: string, args: Record<string, unknown>, authorization?: string) =>
  sendRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: modernParams({ name, arguments: args }),
  }, mcpProtocolVersion, { authorization });

describe("MCP endpoint", () => {
  it("discovers the latest protocol under the AtlasNews server name", async () => {
    const discovered = await sendRpc({ jsonrpc: "2.0", id: 1, method: "server/discover", params: modernParams() });
    expect(discovered.response.status).toBe(200);
    expect(discovered.response.headers.get("mcp-session-id")).toBeNull();
    expect(discovered.payload.result.supportedVersions).toContain(mcpProtocolVersion);
    expect(discovered.payload.result.capabilities.tools).toBeDefined();
    expect(discovered.payload.result._meta[SERVER_INFO_META_KEY].name).toBe("atlasnews");
  });

  it("lists every catalogue capability and the app tools, each with its security scheme", async () => {
    const listed = await sendRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: modernParams() });
    const tools: Tool[] = listed.payload.result.tools;

    expect(tools.map((tool) => tool.name)).toEqual([
      ...mcpCapabilities.map((capability) => capability.name),
      ...appToolNames,
    ]);
    expect(tools).toHaveLength(50);
    for (const tool of tools) {
      expect(Object.keys(tool.annotations).sort(), tool.name).toEqual([
        "destructiveHint", "idempotentHint", "openWorldHint", "readOnlyHint",
      ]);
      const [scheme] = tool._meta.securitySchemes;
      if (scheme.type === "noauth") expect(tool.annotations.readOnlyHint, tool.name).toBe(true);
      else expect(scopes, tool.name).toEqual(expect.arrayContaining(scheme.scopes!));
    }
    const publish = tools.find((tool) => tool.name === "admin_publish_article")!;
    expect(publish._meta.securitySchemes).toEqual([{ type: "oauth2", scopes: ["newsroom.publish"] }]);
    expect(publish.inputSchema.properties).toHaveProperty("confirm");
    const comments = tools.find((tool) => tool.name === "list_comments")!;
    expect(comments.inputSchema.properties).toHaveProperty("slug");
    expect(comments.inputSchema.properties).not.toHaveProperty("articleId");
  });

  it("resolves approved comments from the published locale and slug", async () => {
    const repository = new MemoryEditorialRepository();
    const article = (await repository.listPublished({ locale: "en", limit: 1 })).items[0];
    const listApproved = vi.fn().mockResolvedValue({ items: [], nextCursor: null });

    await listPublishedArticleComments(repository, { listApproved }, {
      slug: article.slug,
      locale: "en",
      parentId: null,
      cursor: null,
      limit: 12,
    });

    expect(listApproved).toHaveBeenCalledWith(expect.objectContaining({ articleId: article.id }));
  });

  it("keeps stateless 2025 clients compatible", async () => {
    const legacyVersion = "2025-11-25";
    const initialized = await sendRpc(
      {
        jsonrpc: "2.0",
        id: 20,
        method: "initialize",
        params: {
          protocolVersion: legacyVersion,
          capabilities: {},
          clientInfo: { name: "atlasnews-legacy-test", version: "1.0.0" },
        },
      },
      legacyVersion,
    );

    expect(initialized.response.status).toBe(200);
    expect(initialized.payload.result.protocolVersion).toBe(legacyVersion);
    expect(initialized.payload.result.serverInfo.name).toBe("atlasnews");
  });

  it("lists English articles from the self-contained memory fallback", async () => {
    const called = await call("list_articles", { locale: "en", limit: 2 });
    expect(called.response.status).toBe(200);
    expect(called.payload.result.isError).not.toBe(true);
    expect(called.payload.result.structuredContent.items).toHaveLength(2);
    expect(
      called.payload.result.structuredContent.items.every(
        (article: { locale: string; content?: string }) =>
          article.locale === "en" && article.content === undefined,
      ),
    ).toBe(true);
  });

  it("rejects unsupported locales as a tool error", async () => {
    const called = await call("list_categories", { locale: "fr" });
    expect(called.response.status).toBe(200);
    expect(called.payload.result.isError).toBe(true);
    expect(called.payload.result.content[0].text).toContain("Input validation error");
  });

  it("serves the standard search and fetch tools with absolute article URLs", async () => {
    const searched = await call("search", { query: "agents" });
    const { results } = searched.payload.result.structuredContent;
    expect(JSON.parse(searched.payload.result.content[0].text)).toEqual({ results });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toEqual({
      id: expect.stringMatching(/^(en|it)\/[a-z0-9-]+$/),
      title: expect.any(String),
      url: expect.stringMatching(/^http:\/\/localhost:3000\/(en|it)\/articles\/[a-z0-9-]+$/),
    });

    const fetched = await call("fetch", { id: results[0].id });
    const document = fetched.payload.result.structuredContent;
    expect(document).toMatchObject({ id: results[0].id, title: results[0].title, url: results[0].url });
    expect(document.text).toContain(`# ${results[0].title}`);
    expect(document.metadata).toMatchObject({ locale: results[0].id.split("/")[0] });

    for (const id of ["en/does-not-exist", "xx/anything", "en/a/b"]) {
      expect((await call("fetch", { id })).payload.result.isError, id).toBe(true);
    }
  });

  it("answers a scoped tool called anonymously with 401 and a challenge, before anything runs", async () => {
    const repository = new MemoryEditorialRepository();
    const before = (await repository.listForStudio("en")).length;
    const ports = memoryPorts(repository);
    const { payload, response } = await sendRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: modernParams({
        name: "admin_create_article",
        arguments: {
          locale: "en",
          title: "A story written without signing in",
          excerpt: "This request should be refused before it reaches the newsroom.",
          content: "This article body is long enough to pass validation but must never be stored.",
          categorySlug: "research",
        },
      }),
    }, mcpProtocolVersion, { ports });

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe(-32001);
    expect(payload.result).toBeUndefined();
    const challenge = response.headers.get("www-authenticate")!;
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain('resource_metadata="http://localhost:8787/.well-known/oauth-protected-resource"');
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain('scope="newsroom.write"');
    expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
    expect((await repository.listForStudio("en")).length).toBe(before);
  });

  describe("anonymous calls and the 401 gate", () => {
    const legacyVersion = "2025-11-25";
    const scopedCall = (id = 1) => ({
      jsonrpc: "2.0", id, method: "tools/call", params: { name: "admin_list_articles", arguments: { locale: "en" } },
    });
    const publicCall = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_articles", arguments: { locale: "en" } } };
    const send = (request: Request) =>
      handleMcpRequest(request, { verifier: apiKeyVerifier(() => testApiKey), createPorts: () => memoryPorts() });

    it("challenges a 2025-era client, which sends the tool name only in the body", async () => {
      const request = rpcRequest(scopedCall(), legacyVersion);
      expect(request.headers.get("mcp-name")).toBeNull();
      const response = await send(request);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('scope="newsroom.read"');
    });

    it("challenges a batch that contains one scoped call, and asks for every scope the batch needs", async () => {
      const response = await send(rpcRequest([
        publicCall,
        scopedCall(3),
        { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "admin_publish_article", arguments: {} } },
      ] as never, legacyVersion));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('scope="newsroom.read newsroom.publish"');
    });

    it("treats a request whose header and body disagree as the stricter of the two", async () => {
      const cases: Array<[string, Request]> = [];
      for (const [label, body, name] of [
        ["header names a public tool, body a scoped one", scopedCall(), "list_articles"],
        ["header names a scoped tool, body a public one", publicCall, "admin_list_articles"],
        ["header names a scoped tool, body lists tools", { jsonrpc: "2.0", id: 5, method: "tools/list", params: modernParams() }, "admin_list_articles"],
        ["header says tools/list, body calls a scoped tool", scopedCall(), undefined],
      ] as const) {
        const request = rpcRequest(body, mcpProtocolVersion);
        if (name) request.headers.set("MCP-Name", name);
        else request.headers.set("MCP-Method", "tools/list");
        cases.push([label, request]);
      }
      for (const [label, request] of cases) {
        const response = await send(request);
        expect(response.status, label).toBe(401);
        expect(response.headers.get("www-authenticate"), label).toContain("resource_metadata=");
      }
    });

    it("does not challenge a body that is not JSON-RPC or a name that is no capability", async () => {
      const garbled = new Request("http://localhost:8787/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Name": "no_such_tool" },
        body: "{not json",
      });
      expect((await send(garbled)).status).not.toBe(401);
    });

    it("still serves everything that needs no sign-in", async () => {
      for (const [label, request] of [
        ["public tool, 2026 style", rpcRequest({ ...publicCall, params: modernParams(publicCall.params) })],
        ["public tool, 2025 style", rpcRequest(publicCall, legacyVersion)],
        ["tools/list", rpcRequest({ jsonrpc: "2.0", id: 6, method: "tools/list", params: modernParams() })],
        ["server/discover", rpcRequest({ jsonrpc: "2.0", id: 7, method: "server/discover", params: modernParams() })],
        ["legacy initialize", rpcRequest({
          jsonrpc: "2.0", id: 8, method: "initialize",
          params: { protocolVersion: legacyVersion, capabilities: {}, clientInfo: { name: "legacy", version: "1" } },
        }, legacyVersion)],
      ] as const) {
        const response = await send(request);
        expect(response.status, label).toBe(200);
        expect(response.headers.get("www-authenticate"), label).toBeNull();
        expect(JSON.parse((await response.text()).replace(/^[^{]*data: /, "").split("\n")[0]).error, label).toBeUndefined();
      }
    });

    it("leaves a signed-in caller who lacks a scope with the tool-level error, not a 401", async () => {
      const verifier = { verify: async () => ({ subject: "reader", scopes: [] }) };
      const { response, payload } = await sendRpc({
        ...scopedCall(), params: modernParams(scopedCall().params),
      }, mcpProtocolVersion, { authorization: "Bearer any", verifier });
      expect(response.status).toBe(200);
      expect(payload.result.isError).toBe(true);
      expect(payload.result.structuredContent).toBeUndefined();
      expect(payload.result._meta["mcp/www_authenticate"][0]).toContain('error="insufficient_scope"');
    });

    it("hands the caller to the port factory, so writes can be attributed", async () => {
      const authorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const createPorts = vi.fn(() => memoryPorts());
      const verifier = { verify: async () => ({ subject: "editor", scopes, authorId }) };
      const response = await handleMcpRequest(
        rpcRequest({ ...scopedCall(), params: modernParams(scopedCall().params) }, mcpProtocolVersion, "Bearer any"),
        { verifier, createPorts },
      );
      expect(response.status).toBe(200);
      expect(createPorts).toHaveBeenCalledWith({ kind: "editor", subject: "editor", scopes, authorId });
    });
  });

  it("runs the same tool for the API key, without CORS headers and never cached", async () => {
    const created = await call("admin_list_articles", { locale: "en" }, `Bearer ${testApiKey}`);
    expect(created.payload.result.isError).not.toBe(true);
    expect(created.payload.result.structuredContent.items.length).toBeGreaterThan(0);
    expect(created.response.headers.get("cache-control")).toBe("no-store");
    expect(created.response.headers.get("access-control-allow-origin")).toBeNull();

    const anonymousRead = await call("list_articles", { locale: "en" });
    expect(anonymousRead.response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects an invalid bearer token with 401 and a Bearer challenge", async () => {
    for (const authorization of ["Bearer wrong-key", "Basic dXNlcjpwYXNz"]) {
      const { response, payload } = await call("list_articles", {}, authorization);
      expect(response.status, authorization).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('Bearer realm="atlasnews"');
      expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(payload.error.code).toBe(-32001);
    }
  });

  it("treats the API key as no credential when none is configured", async () => {
    const verifier = apiKeyVerifier(() => null);
    await expect(resolvePrincipal(rpcRequest({}, mcpProtocolVersion, `Bearer ${testApiKey}`), verifier))
      .rejects.toThrow();
    await expect(resolvePrincipal(rpcRequest({}), verifier)).resolves.toEqual({ kind: "anonymous", scopes: [] });
  });

  it("gives the API key editor every scope", async () => {
    const principal = await resolvePrincipal(
      rpcRequest({}, mcpProtocolVersion, `Bearer ${testApiKey}`),
      apiKeyVerifier(() => testApiKey),
    );
    expect(principal).toEqual({ kind: "editor", subject: "mcp-admin", scopes });
  });

  it("publishes machine-readable discovery metadata derived from the catalogue", async () => {
    const response = getMcpInfo();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.name).toBe("atlasnews");
    expect(payload.internationalization.defaultLocale).toBe("en");
    const all = [...payload.capabilities.tools.anonymous, ...payload.capabilities.tools.scoped];
    expect(all).toEqual(expect.arrayContaining(["search", "fetch", "admin_publish_article", ...appToolNames]));
    expect(all).toHaveLength(50);
    expect(payload.capabilities.tools.anonymous).toEqual(expect.arrayContaining(["list_articles", "search"]));
    expect(payload.capabilities.tools.scoped).not.toContain("list_articles");

    const metadata = await getResourceMetadata(new Request("https://mcp.example.com/.well-known/oauth-protected-resource")).json();
    expect(metadata).toMatchObject({ resource: "https://mcp.example.com/mcp", scopes_supported: scopes });
  });

  it("enforces the optional browser origin allow-list", async () => {
    process.env.MCP_ALLOWED_ORIGINS = "https://reader.example";
    const allowed = mcpOptionsResponse(new Request("http://localhost/mcp", {
      method: "OPTIONS",
      headers: { Origin: "https://reader.example" },
    }));
    const denied = mcpOptionsResponse(new Request("http://localhost/mcp", {
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example" },
    }));

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://reader.example");
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects oversized request bodies before protocol parsing", async () => {
    const deps = { verifier: apiKeyVerifier(() => testApiKey), createPorts: () => memoryPorts() };
    const declared = await handleMcpRequest(new Request("http://localhost:8787/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "262145" },
      body: "{}",
    }), deps);
    expect(declared.status).toBe(413);
    expect((await declared.json()).error.code).toBe(-32001);

    const streamed = new Request("http://localhost:8787/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(262_145),
    });
    expect(streamed.headers.get("content-length")).toBeNull();
    const response = await handleMcpRequest(streamed, deps);
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe(-32001);
  });
});
