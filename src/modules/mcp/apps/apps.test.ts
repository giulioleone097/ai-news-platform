import { describe, expect, it } from "vitest";

import { MemoryEditorialRepository } from "@/modules/editorial/infrastructure/memory-editorial-repository";

import { modernParams, sendRpc } from "../mcp-test-client";
import { briefingFormKey } from "./briefing";
import { newsroomUiUri } from "./ui-resource";

type Tool = { name: string; title?: string; icons?: unknown[]; annotations?: { readOnlyHint?: boolean }; _meta?: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

const formCapabilities = {
  elicitation: { form: {} },
  extensions: { "openai/elicitation": { form: {} } },
};

async function call(name: string, args: Record<string, unknown>, capabilities = {}, extra = {}) {
  const { payload } = await sendRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: modernParams({ name, arguments: args, ...extra }, capabilities),
  });
  return payload.result;
}

async function listTools(): Promise<Tool[]> {
  const { payload } = await sendRpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: modernParams() });
  return payload.result.tools;
}

describe("MCP Apps and OpenAI extensions", () => {
  it("declares sidebar and conversation-panel entrypoints on app-only tools", async () => {
    const tools = await listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const [name, type] of [["open_newsroom", "global"], ["open_news_panel", "thread"]] as const) {
      const tool = byName.get(name)!;
      expect(tool._meta?.["openai/ui"]).toEqual({ entrypoints: [{ type }] });
      expect(tool._meta?.ui).toEqual({ resourceUri: newsroomUiUri, visibility: ["app"] });
      expect(tool.icons).toHaveLength(1);
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
    expect(byName.get("open_newsroom")?.title).not.toBe(byName.get("open_news_panel")?.title);
    for (const name of ["list_articles", "search_articles", "get_article", "build_briefing"]) {
      expect(byName.get(name)?._meta?.ui?.resourceUri).toBe(newsroomUiUri);
    }
    const mentions = byName.get("search_mentions")!;
    expect(mentions.annotations?.readOnlyHint).toBe(true);
    expect(mentions._meta?.ui?.visibility).toContain("app");
  });

  it("advertises mentions and resources through server/discover", async () => {
    const { payload } = await sendRpc({ jsonrpc: "2.0", id: 1, method: "server/discover", params: modernParams() });
    const capabilities = payload.result.capabilities;

    expect(capabilities.extensions["openai/mentions"]).toEqual({ searchTool: "search_mentions" });
    expect(capabilities.experimental["openai/mentions"]).toEqual({ searchTool: "search_mentions" });
    expect(capabilities.resources).toBeDefined();
    expect(payload.result._meta["io.modelcontextprotocol/serverInfo"].icons[0].src).toMatch(/neura-icon\.svg$/);
  });

  it("serves a self-contained MCP App with display modes and a scoped CSP", async () => {
    const { payload } = await sendRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: modernParams({ uri: newsroomUiUri }),
    });
    const [content] = payload.result.contents;

    expect(content.mimeType).toBe("text/html;profile=mcp-app");
    expect(content._meta["openai/ui"]).toEqual({
      availableDisplayModes: ["inline", "fullscreen"],
      preferredDisplayMode: "inline",
    });
    expect(content._meta.ui.csp.resourceDomains).toContain("http://localhost:3000");
    expect(content._meta.ui.csp.connectDomains).toEqual([]);

    const scripts = [...content.text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(scripts).toHaveLength(1);
    expect(() => new Function(scripts[0])).not.toThrow();
    expect(scripts[0]).toContain("ui/initialize");
  });

  it("opens an entrypoint with empty arguments", async () => {
    const result = await call("open_newsroom", {});

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.locale).toBe("en");
    expect(result.structuredContent.items.length).toBeGreaterThan(0);
    expect(result.structuredContent.categories.length).toBeGreaterThan(0);
  });

  it("returns composer mentions as resource links that resolve to article Markdown", async () => {
    const result = await call("search_mentions", { query: "" });
    const [first] = result.structuredContent.items;

    expect(first.type).toBe("resource_link");
    expect(first.uri).toMatch(/^neura:\/\/articles\/(en|it)\/[a-z0-9-]+$/);

    const { payload } = await sendRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/read",
      params: modernParams({ uri: first.uri }),
    });
    expect(payload.result.contents[0].text).toContain(`# ${first.title}`);

    const missing = await sendRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "resources/read",
      params: modernParams({ uri: "neura://articles/en/does-not-exist" }),
    });
    // MCP 2026-07-28: a resources/read miss is -32602 with data { uri }.
    expect(missing.payload.error).toMatchObject({ code: -32602, data: { uri: "neura://articles/en/does-not-exist" } });
  });

  it("falls back to every topic when the host cannot render OpenAI forms", async () => {
    const categories = await new MemoryEditorialRepository().listCategories("en");
    const result = await call("build_briefing", {});

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.sections).toHaveLength(categories.length);
  });

  it("asks for briefing preferences with a multi-round-trip OpenAI form", async () => {
    const first = await call("build_briefing", {}, formCapabilities);
    const request = first.inputRequests[briefingFormKey];
    const schema = request.params._meta["openai/elicitation"].requestedSchema;

    expect(first.resultType).toBe("input_required");
    expect(request.method).toBe("elicitation/create");
    expect(request.params.requestedSchema).toEqual({ type: "object", properties: {} });
    expect(schema.properties.topics.items.anyOf.length).toBeGreaterThan(0);
    expect(schema.properties.language.oneOf.map((option: { const: string }) => option.const)).toEqual(["en", "it"]);

    const topic = schema.properties.topics.items.anyOf[0];
    const italianCategories = await new MemoryEditorialRepository().listCategories("it");
    const italianTopic = italianCategories.find((category) => category.translationKey === topic.const)!;
    const answered = await call("build_briefing", {}, formCapabilities, {
      inputResponses: {
        [briefingFormKey]: {
          action: "accept",
          content: { topics: [topic.const], language: "it", storiesPerTopic: 2 },
        },
      },
    });

    expect(answered.isError).not.toBe(true);
    expect(answered.structuredContent.locale).toBe("it");
    expect(answered.structuredContent.sections).toEqual([
      expect.objectContaining({ category: { slug: italianTopic.slug, name: italianTopic.name } }),
    ]);
    expect(answered.structuredContent.sections[0].items.length).toBeLessThanOrEqual(2);

    const declined = await call("build_briefing", {}, formCapabilities, {
      inputResponses: { [briefingFormKey]: { action: "decline" } },
    });
    expect(declined.structuredContent.sections).toEqual([]);
  });
});
