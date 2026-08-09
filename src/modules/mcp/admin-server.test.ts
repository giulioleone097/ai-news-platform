import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

import { MemoryEditorialRepository } from "@/modules/editorial/infrastructure/memory-editorial-repository";
import { adminMcpTools, publicMcpProtocolVersion } from "./metadata";
import { handleAdminMcpRequest } from "./admin-http";

const apiKey = "test-only-admin-key-with-at-least-32-characters";
const originalKey = process.env.NEURA_MCP_ADMIN_API_KEY;
const repository = new MemoryEditorialRepository();

beforeEach(() => {
  process.env.NEURA_MCP_ADMIN_API_KEY = apiKey;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.NEURA_MCP_ADMIN_API_KEY;
  else process.env.NEURA_MCP_ADMIN_API_KEY = originalKey;
});

function request(body: unknown, authorization = `Bearer ${apiKey}`) {
  const method = typeof body === "object" && body !== null && "method" in body
    ? String(body.method)
    : "";
  const params = typeof body === "object" && body !== null && "params" in body
    ? body.params
    : null;
  const name = typeof params === "object" && params !== null && "name" in params
    ? String(params.name)
    : "";
  return new Request("http://localhost:3000/api/mcp/admin", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: authorization,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": publicMcpProtocolVersion,
      "MCP-Method": method,
      ...(name ? { "MCP-Name": name } : {}),
    },
    body: JSON.stringify(body),
  });
}

function params(values: Record<string, unknown> = {}) {
  return {
    ...values,
    _meta: {
      [PROTOCOL_VERSION_META_KEY]: publicMcpProtocolVersion,
      [CLIENT_INFO_META_KEY]: { name: "neura-admin-test", version: "1.0.0" },
      [CLIENT_CAPABILITIES_META_KEY]: {},
    },
  };
}

async function send(body: unknown, authorization?: string) {
  const response = await handleAdminMcpRequest(
    request(body, authorization),
    () => repository,
  );
  return { response, payload: await response.json() };
}

async function call(name: string, args: Record<string, unknown>) {
  return send({
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/call",
    params: params({ name, arguments: args }),
  });
}

describe("admin MCP server", () => {
  it("fails closed when the server key is not configured", async () => {
    delete process.env.NEURA_MCP_ADMIN_API_KEY;
    const { response } = await send({ jsonrpc: "2.0", id: 1, method: "server/discover", params: params() });
    expect(response.status).toBe(503);
  });

  it("rejects missing and incorrect Bearer credentials", async () => {
    const body = { jsonrpc: "2.0", id: 1, method: "server/discover", params: params() };
    const missing = await send(body, "");
    const wrong = await send(body, "Bearer wrong-key");
    expect(missing.response.status).toBe(401);
    expect(wrong.response.status).toBe(401);
    expect(wrong.response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("exposes explicit authenticated newsroom CRUD tools", async () => {
    const listed = await send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: params() });
    expect(listed.response.status).toBe(200);
    expect(listed.payload.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
      adminMcpTools,
    );
  });

  it("creates, updates, publishes, reads, and deletes one article", async () => {
    const created = await call("admin_create_article", {
      locale: "en",
      title: "A practical MCP administration test",
      excerpt: "A complete editorial lifecycle exercised through authenticated MCP tools.",
      content: "This test article contains enough useful editorial copy to satisfy the newsroom validation boundary and prove the full lifecycle safely.",
      categorySlug: "research",
      status: "draft",
    });
    expect(created.payload.result.isError).not.toBe(true);
    const articleId = created.payload.result.structuredContent.article.id as string;

    const updated = await call("admin_update_article", {
      id: articleId,
      locale: "en",
      featured: true,
      distribution: ["newsletter", "linkedin"],
    });
    expect(updated.payload.result.structuredContent.article.featured).toBe(true);

    const published = await call("admin_publish_article", { id: articleId, locale: "en" });
    expect(published.payload.result.structuredContent.article.status).toBe("published");

    const read = await call("admin_get_article", { id: articleId, locale: "en" });
    expect(read.payload.result.structuredContent.article.id).toBe(articleId);

    const deleted = await call("admin_delete_article", { id: articleId, locale: "en", confirm: true });
    expect(deleted.payload.result.structuredContent.deletedId).toBe(articleId);
    expect(await repository.findById(articleId, "en")).toBeNull();
  });
});
