import { afterEach, describe, expect, it, vi } from "vitest";
import { SERVER_INFO_META_KEY } from "@modelcontextprotocol/server";

import { MemoryEditorialRepository } from "@atlasnews/adapters/editorial/memory-editorial-repository";
import { GET as getMcpInfo } from "./routes/info";

import { handlePublicMcpRequest, publicMcpOptionsResponse } from "./http";
import { modernParams, sendRpc } from "./mcp-test-client";
import { publicMcpProtocolVersion, publicMcpTools } from "./metadata";
import { listPublishedArticleComments } from "./public-server";

const originalAllowedOrigins = process.env.MCP_ALLOWED_ORIGINS;

afterEach(() => {
  if (originalAllowedOrigins === undefined) delete process.env.MCP_ALLOWED_ORIGINS;
  else process.env.MCP_ALLOWED_ORIGINS = originalAllowedOrigins;
});

const send = sendRpc;

describe("public MCP server", () => {
  it("discovers the latest protocol and exposes only the public tools", async () => {
    const discovered = await send({
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
      params: modernParams(),
    });
    expect(discovered.response.status).toBe(200);
    expect(discovered.response.headers.get("mcp-session-id")).toBeNull();
    expect(discovered.payload.result.supportedVersions).toContain(publicMcpProtocolVersion);
    expect(discovered.payload.result.capabilities.tools).toBeDefined();
    expect(discovered.payload.result._meta[SERVER_INFO_META_KEY].name).toBe(
      "neura-ai-news",
    );

    const listed = await send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: modernParams(),
    });

    expect(listed.response.status).toBe(200);
    expect(listed.payload.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
      publicMcpTools,
    );
    expect(
      listed.payload.result.tools.every(
        (tool: { annotations?: { readOnlyHint?: boolean } }) =>
          tool.annotations?.readOnlyHint === true,
      ),
    ).toBe(true);
    const commentsTool = listed.payload.result.tools.find(
      (tool: { name: string }) => tool.name === "list_comments",
    );
    expect(commentsTool.inputSchema.properties).toHaveProperty("slug");
    expect(commentsTool.inputSchema.properties).not.toHaveProperty("articleId");
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
    const initialized = await send(
      {
        jsonrpc: "2.0",
        id: 20,
        method: "initialize",
        params: {
          protocolVersion: legacyVersion,
          capabilities: {},
          clientInfo: { name: "neura-legacy-test", version: "1.0.0" },
        },
      },
      legacyVersion,
    );

    expect(initialized.response.status).toBe(200);
    expect(initialized.payload.result.protocolVersion).toBe(legacyVersion);
    expect(initialized.payload.result.serverInfo.name).toBe("neura-ai-news");
  });

  it("lists English articles from the self-contained memory fallback", async () => {
    const called = await send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: modernParams({
        name: "list_articles",
        arguments: { locale: "en", limit: 2 },
      }),
    });
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

  it("rejects unsupported locales as a protocol tool error", async () => {
    const called = await send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: modernParams({
        name: "list_categories",
        arguments: { locale: "fr" },
      }),
    });

    expect(called.response.status).toBe(200);
    expect(called.payload.result.isError).toBe(true);
    expect(called.payload.result.content[0].text).toContain("Input validation error");
  });

  it("publishes machine-readable English-first discovery metadata", async () => {
    const response = getMcpInfo();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.internationalization.defaultLocale).toBe("en");
    expect(payload.capabilities.tools).toEqual(publicMcpTools);
    expect(payload.access).toEqual({ authentication: "none", mode: "read-only" });
  });

  it("enforces the optional browser origin allow-list", async () => {
    process.env.MCP_ALLOWED_ORIGINS = "https://reader.example";
    const allowed = publicMcpOptionsResponse(new Request("http://localhost/api/mcp", {
      method: "OPTIONS",
      headers: { Origin: "https://reader.example" },
    }));
    const denied = publicMcpOptionsResponse(new Request("http://localhost/api/mcp", {
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example" },
    }));

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://reader.example");
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects oversized request bodies before protocol parsing", async () => {
    const repository = new MemoryEditorialRepository();
    const request = new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "262145",
      },
      body: "{}",
    });
    const response = await handlePublicMcpRequest(request, repository);
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error.code).toBe(-32001);
  });

  it("rejects an actually oversized body without a Content-Length header", async () => {
    const repository = new MemoryEditorialRepository();
    const request = new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(262_145),
    });

    expect(request.headers.get("content-length")).toBeNull();

    const response = await handlePublicMcpRequest(request, repository);
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error.code).toBe(-32001);
  });
});
