import { describe, expect, it } from "vitest";

import { createMemoryEditorialRepository } from "@atlasnews/adapters/editorial/memory-editorial-repository";

import { memoryPorts, modernParams, sendRpc } from "../mcp-test-client";

// What PostgREST puts into an error: table names, hints, constraint details.
const leaky = 'relation "public.articles" does not exist (SQLSTATE 42P01) - hint: set SUPABASE_SERVICE_ROLE_KEY';

const failingRepository = () => ({
  ...createMemoryEditorialRepository(),
  async findBySlug(): Promise<never> {
    throw new Error(leaky);
  },
  async listPublished(): Promise<never> {
    throw new Error(leaky);
  },
});

const ports = () => memoryPorts(failingRepository());

describe("article resources when the repository fails", () => {
  it("answers resources/read with a generic error and none of the repository's text", async () => {
    const { payload } = await sendRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: modernParams({ uri: "atlasnews://articles/en/some-article" }),
    }, undefined, { ports: ports() });

    expect(payload.error).toMatchObject({ code: -32603 });
    expect(JSON.stringify(payload)).not.toContain("articles");
    expect(JSON.stringify(payload)).not.toContain("SQLSTATE");
    expect(JSON.stringify(payload)).not.toContain("SUPABASE");
  });

  it("answers resources/list the same way", async () => {
    const { payload } = await sendRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/list",
      params: modernParams(),
    }, undefined, { ports: ports() });

    expect(payload.error).toMatchObject({ code: -32603 });
    expect(JSON.stringify(payload)).not.toContain("SQLSTATE");
  });
});
