import { afterEach, describe, expect, it } from "vitest";

import { MemoryEditorialRepository } from "@/modules/editorial/infrastructure/memory-editorial-repository";
import { GET as getMcpInfo } from "@/app/api/mcp/info/route";

import { handlePublicMcpRequest, publicMcpOptionsResponse } from "./http";
import { publicMcpProtocolVersion, publicMcpTools } from "./metadata";

const protocolVersion = publicMcpProtocolVersion;
const originalAllowedOrigins = process.env.MCP_ALLOWED_ORIGINS;

afterEach(() => {
  if (originalAllowedOrigins === undefined) delete process.env.MCP_ALLOWED_ORIGINS;
  else process.env.MCP_ALLOWED_ORIGINS = originalAllowedOrigins;
});

function rpcRequest(body: unknown) {
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": protocolVersion,
    },
    body: JSON.stringify(body),
  });
}

async function send(body: unknown) {
  const repository = new MemoryEditorialRepository();
  const response = await handlePublicMcpRequest(rpcRequest(body), repository);
  const payload = await response.json();
  return { response, payload };
}

describe("public MCP server", () => {
  it("negotiates Streamable HTTP and exposes only the public tools", async () => {
    const initialized = await send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: "neura-test", version: "1.0.0" },
      },
    });

    expect(initialized.response.status).toBe(200);
    expect(initialized.response.headers.get("mcp-session-id")).toBeNull();
    expect(initialized.payload.result.serverInfo.name).toBe("neura-ai-news");
    expect(initialized.payload.result.capabilities.tools).toBeDefined();

    const listed = await send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
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
  });

  it("lists English articles from the self-contained memory fallback", async () => {
    const called = await send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_articles",
        arguments: { locale: "en", limit: 2 },
      },
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
      params: {
        name: "list_categories",
        arguments: { locale: "fr" },
      },
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
});
