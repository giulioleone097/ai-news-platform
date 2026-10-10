import { describe, expect, it } from "vitest";

import type { AccessTokenVerifier } from "./auth";
import { handleMcpRequest } from "./http";
import { memoryPorts, modernParams, rpcRequest } from "./mcp-test-client";

const readerOnly: AccessTokenVerifier = {
  async verify(token) {
    return token === "reader-token" ? { subject: "reader@example.com", scopes: ["newsroom.read"] } : null;
  },
};

async function call(name: string, args: Record<string, unknown>) {
  const response = await handleMcpRequest(
    rpcRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: modernParams({ name, arguments: args }) },
      undefined,
      "Bearer reader-token",
    ),
    { verifier: readerOnly, createPorts: () => memoryPorts() },
  );
  return (await response.json()).result;
}

describe("scoped tokens", () => {
  it("runs tools inside the granted scopes", async () => {
    const result = await call("admin_list_articles", { locale: "en" });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.items.length).toBeGreaterThan(0);
  });

  it("asks for the missing scope instead of running a tool outside it", async () => {
    const result = await call("admin_publish_article", {
      id: "00000000-0000-4000-8000-000000000000",
      locale: "en",
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("newsroom.publish");
    expect(result._meta["mcp/www_authenticate"][0]).toContain('scope="newsroom.publish"');
  });
});
