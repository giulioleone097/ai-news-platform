import { afterEach, describe, expect, it, vi } from "vitest";
import { SERVER_INFO_META_KEY } from "@modelcontextprotocol/server";

import { MemoryEditorialRepository } from "@atlasnews/adapters/editorial/memory-editorial-repository";
import { listPublishedArticleComments, mcpCapabilities, scopes } from "@atlasnews/contract";

import { appToolNames } from "./apps";
import { apiKeyVerifier, resolvePrincipal } from "./auth";
import { handleMcpRequest, mcpMethodNotAllowedResponse, mcpOptionsResponse } from "./http";
import { mcpProtocolVersion } from "./metadata";
import { memoryPorts, modernParams, rpcRequest, sendRpc, testApiKey } from "./mcp-test-client";
import { GET as getMcpInfo } from "./routes/info";
import { GET as getResourceMetadata } from "./routes/oauth-metadata";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Supabase Auth as the authorization server, so the challenges point at the resource metadata. */
function configureSignIn() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(40));
  vi.stubEnv("NEXT_PUBLIC_MCP_URL", "http://localhost:8787");
  vi.stubEnv("ATLASNEWS_MCP_OAUTH_CLIENT_IDS", "9a8b7c6d-5e4f-4a2b-9c0d-9e8f7a6b5c4d");
}

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

const deps = { verifier: apiKeyVerifier(() => testApiKey), createPorts: () => memoryPorts() };
const listArticlesRequest = (authorization?: string) => rpcRequest({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: modernParams({ name: "list_articles", arguments: { locale: "en" } }),
}, mcpProtocolVersion, authorization);

function withOrigin(request: Request, origin: string) {
  request.headers.set("Origin", origin);
  return request;
}

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
    expect(tools).toHaveLength(79);
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
    configureSignIn();
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
    // With Supabase Auth as the server the host may only ask for the scopes it can grant.
    expect(challenge).toContain('scope="email"');
    expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
    expect((await repository.listForStudio("en")).length).toBe(before);
  });

  it("challenges every content write and delete tool anonymously with its own scope, and writes nothing", async () => {
    const repository = new MemoryEditorialRepository();
    const before = (await repository.listForStudio("en")).length;
    const ports = memoryPorts(repository);
    const cases: Array<[string, string]> = [
      ["admin_create_articles", "newsroom.write"], ["admin_update_articles", "newsroom.write"],
      ["admin_publish_articles", "newsroom.publish"], ["admin_unpublish_articles", "newsroom.publish"],
      ["admin_delete_articles", "newsroom.publish"], ["admin_unpublish_article", "newsroom.publish"],
      ["admin_create_category", "newsroom.write"], ["admin_update_categories", "newsroom.write"],
      ["admin_delete_category", "newsroom.publish"], ["admin_create_entity", "newsroom.write"],
      ["admin_update_entities", "newsroom.write"], ["admin_delete_entities", "newsroom.publish"],
      ["admin_upload_media_assets", "newsroom.write"], ["admin_delete_media_assets", "newsroom.publish"],
      ["admin_get_category", "newsroom.read"], ["admin_get_entity", "newsroom.read"],
    ];
    for (const [name, scope] of cases) {
      const { response } = await sendRpc(
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: modernParams({ name, arguments: {} }) },
        mcpProtocolVersion,
        { ports },
      );
      expect(response.status, name).toBe(401);
      expect(response.headers.get("www-authenticate"), name).toContain(`scope="${scope}"`);
    }
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
        expect(response.headers.get("www-authenticate"), label).toContain('Bearer realm="atlasnews"');
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

    // A server-to-server read sends no Origin and gets no CORS header; a browser on an allowed origin gets its own back.
    const anonymousRead = await call("list_articles", { locale: "en" });
    expect(anonymousRead.response.headers.get("access-control-allow-origin")).toBeNull();
    const fromBrowser = await handleMcpRequest(withOrigin(listArticlesRequest(), "https://claude.ai"), deps);
    expect(fromBrowser.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
    expect(fromBrowser.headers.get("vary")).toContain("Origin");
  });

  it("names no resource metadata in the challenge while no authorization server is configured", async () => {
    const { response } = await call("admin_list_articles", { locale: "en" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="atlasnews", error="invalid_token", error_description="Authentication required for this tool", scope="newsroom.read"',
    );
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
    expect(all).toHaveLength(79);
    expect(payload.capabilities.tools.anonymous).toEqual(expect.arrayContaining(["list_articles", "search"]));
    expect(payload.capabilities.tools.scoped).not.toContain("list_articles");

    // No authorization server (the API key alone, or Sites): there is no metadata document to discover.
    const metadata = getResourceMetadata(new Request("https://mcp.example.com/.well-known/oauth-protected-resource"));
    expect(metadata.status).toBe(404);
    expect(payload.access.resourceMetadata).toBeNull();

    configureSignIn();
    expect((await getMcpInfo().json()).access.resourceMetadata).toBe("/.well-known/oauth-protected-resource");
  });

  describe("browser origins", () => {
    const preflight = (origin: string) => mcpOptionsResponse(new Request("http://localhost/mcp", {
      method: "OPTIONS",
      headers: { Origin: origin },
    }));

    it("validates Origin on every POST and refuses a foreign one with 403 before anything runs", async () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
      const createPorts = vi.fn(() => memoryPorts());
      for (const origin of ["https://untrusted.example", "http://localhost:3000", "null"]) {
        const response = await handleMcpRequest(withOrigin(listArticlesRequest(), origin), { ...deps, createPorts });
        expect(response.status, origin).toBe(403);
        expect((await response.json()).error.code, origin).toBe(-32003);
        expect(response.headers.get("access-control-allow-origin"), origin).toBeNull();
      }
      // A signed-in caller is held to it as well, with the API key included.
      const signedIn = await handleMcpRequest(
        withOrigin(listArticlesRequest(`Bearer ${testApiKey}`), "https://untrusted.example"),
        { ...deps, createPorts },
      );
      expect(signedIn.status).toBe(403);
      expect(createPorts).not.toHaveBeenCalled();
      expect(mcpMethodNotAllowedResponse(withOrigin(new Request("http://localhost/mcp"), "https://untrusted.example")).status).toBe(403);
    });

    it("allows the site's own origin, chatgpt.com and claude.ai by default and echoes the one that called", async () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://news.example.com");
      for (const origin of ["https://news.example.com", "https://chatgpt.com", "https://claude.ai"]) {
        const response = await handleMcpRequest(withOrigin(listArticlesRequest(), origin), deps);
        expect(response.status, origin).toBe(200);
        expect(response.headers.get("access-control-allow-origin"), origin).toBe(origin);
        expect(response.headers.get("vary"), origin).toContain("Origin");
        expect(preflight(origin).status, origin).toBe(204);
      }
      expect(preflight("http://localhost:3000").status).toBe(403);
    });

    it("lets a caller that sends no Origin through, without a CORS header", async () => {
      const response = await handleMcpRequest(listArticlesRequest(), deps);
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("replaces the default with MCP_ALLOWED_ORIGINS when it is set", async () => {
      vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://reader.example");
      const allowed = preflight("https://reader.example");
      expect(allowed.status).toBe(204);
      expect(allowed.headers.get("access-control-allow-origin")).toBe("https://reader.example");
      const denied = preflight("https://chatgpt.com");
      expect(denied.status).toBe(403);
      expect(denied.headers.get("access-control-allow-origin")).toBeNull();
      expect((await handleMcpRequest(withOrigin(listArticlesRequest(), "https://chatgpt.com"), deps)).status).toBe(403);
    });

    it("lists only the headers the 2026-07-28 transport uses", () => {
      const response = preflight("https://claude.ai");
      const allowed = response.headers.get("access-control-allow-headers")!;
      expect(allowed).toBe("Content-Type, Accept, MCP-Protocol-Version, MCP-Method, MCP-Name");
      expect(response.headers.get("access-control-expose-headers")).toBe("MCP-Protocol-Version, WWW-Authenticate");
    });
  });

  describe("protocol version header", () => {
    const post = (body: unknown, headers: Record<string, string> = {}) => handleMcpRequest(new Request("http://localhost:8787/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    }), deps);
    const toolsList = { jsonrpc: "2.0", id: 1, method: "tools/list" };

    it("rejects a POST that names no version, the way the SDK rejects a wrong one", async () => {
      const missing = await post(toolsList);
      const wrong = await post(toolsList, { "MCP-Protocol-Version": "1999-01-01" });
      expect(missing.status).toBe(400);
      expect(wrong.status).toBe(400);
      const error = (await missing.json()).error;
      expect(error.code).toBe(-32000);
      expect(error.message).toContain("MCP-Protocol-Version");
      expect(error.message).toContain(mcpProtocolVersion);
      expect((await wrong.json()).error.code).toBe(-32000);
      // The same for a call that would be refused as unauthorized: the protocol is checked first.
      const scoped = await post({ ...toolsList, method: "tools/call", params: { name: "admin_list_articles", arguments: {} } });
      expect(scoped.status).toBe(400);
    });

    it("rejects a 2026-07-28 request without the header and a batch without it", async () => {
      const modern = await post({ ...toolsList, params: modernParams() }, { "MCP-Method": "tools/list" });
      expect(modern.status).toBe(400);
      expect((await post([toolsList])).status).toBe(400);
      expect((await post({})).status).toBe(400);
    });

    it("lets initialize through without it, because the connection has no version yet", async () => {
      const initialized = await post({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy", version: "1" } },
      });
      expect(initialized.status).toBe(200);
      expect((await initialized.text())).toContain("2025-11-25");
      expect((await post(toolsList, { "MCP-Protocol-Version": "2025-11-25" })).status).toBe(200);
    });
  });

  describe("cache hints", () => {
    it("tells a 2026-07-28 client how long it may reuse the tool and resource lists", async () => {
      const tools = await sendRpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: modernParams() });
      expect(tools.payload.result).toMatchObject({ ttlMs: 300_000, cacheScope: "private" });
      const resources = await sendRpc({ jsonrpc: "2.0", id: 2, method: "resources/list", params: modernParams() });
      expect(resources.payload.result).toMatchObject({ ttlMs: 60_000, cacheScope: "private" });
    });

    it("leaves 2025-era list results as they were", async () => {
      const legacy = await sendRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "2025-11-25");
      expect(legacy.payload.result.tools.length).toBeGreaterThan(0);
      expect(legacy.payload.result).not.toHaveProperty("ttlMs");
      expect(legacy.payload.result).not.toHaveProperty("cacheScope");
    });
  });

  it("rejects oversized request bodies before protocol parsing", async () => {
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
