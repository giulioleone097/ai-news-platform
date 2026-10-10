import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { capabilities, mcpCapabilities } from "./catalogue";
import { pageCapabilities } from "./page";
import { pageSpecs } from "./specs/page";

const source = dirname(fileURLToPath(import.meta.url));
const reserved = /\b(best|official)\b/i;

describe("capability catalogue", () => {
  it("offers 44 data capabilities with unique, short, verb-like names", () => {
    const names = capabilities.map((capability) => capability.name);
    expect(names).toHaveLength(44);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(64);
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
    expect(names).toEqual(expect.arrayContaining(["search", "fetch", "list_articles", "admin_publish_article"]));
  });

  it("keeps the 37 admin tool names that clients already use", () => {
    expect(capabilities.filter((capability) => capability.name.startsWith("admin_"))).toHaveLength(37);
  });

  it("declares every annotation hint and review-safe text", () => {
    for (const capability of capabilities) {
      expect(Object.keys(capability.annotations).sort()).toEqual([
        "destructiveHint",
        "idempotentHint",
        "openWorldHint",
        "readOnlyHint",
      ]);
      expect(capability.description, capability.name).not.toMatch(reserved);
      expect(capability.title, capability.name).not.toMatch(reserved);
      expect(capability.description, capability.name).not.toMatch(/neura/i);
    }
  });

  it("requires a scope for every capability except the public reads", () => {
    const anonymous = capabilities.filter((capability) => capability.scopes.length === 0).map((capability) => capability.name);
    expect(anonymous.sort()).toEqual([
      "fetch", "get_article", "list_articles", "list_categories", "list_comments", "search", "search_articles",
    ]);
    for (const capability of capabilities) {
      if (capability.scopes.length === 0) expect(capability.annotations.readOnlyHint).toBe(true);
      if (capability.annotations.readOnlyHint) expect(capability.annotations.destructiveHint).toBe(false);
    }
  });

  it("asks before anything that publishes, deletes, emails or posts externally", () => {
    for (const capability of capabilities) {
      const needsPublish = capability.scopes.includes("newsroom.publish");
      if (needsPublish) expect(capability.confirmation, capability.name).toBeDefined();
      if (capability.annotations.destructiveHint) expect(capability.confirmation, capability.name).toBeDefined();
    }
  });

  it("serves only mcp capabilities through the mcp surface", () => {
    expect(mcpCapabilities.every((capability) => capability.surfaces.includes("mcp"))).toBe(true);
  });
});

describe("@atlasnews/contract/page", () => {
  it("is plain JSON data that survives serialisation", () => {
    expect(JSON.parse(JSON.stringify(pageCapabilities))).toEqual(pageCapabilities);
    expect(pageCapabilities.map((capability) => capability.name)).toEqual([
      "search_articles", "filter_feed", "open_article", "read_open_article", "save_article",
    ]);
    for (const capability of pageCapabilities) {
      expect(capability.inputSchema).toMatchObject({ type: "object" });
      expect(typeof capability.description).toBe("string");
      expect(Object.keys(capability.annotations)).toHaveLength(4);
    }
    expect(pageSpecs.every((spec) => spec.surfaces.includes("page"))).toBe(true);
  });

  it("matches the MCP definition of the capability it shares", () => {
    const shared = mcpCapabilities.find((capability) => capability.name === "search_articles")!;
    const page = pageCapabilities.find((capability) => capability.name === "search_articles")!;
    expect(shared.surfaces).toEqual(["mcp", "page"]);
    expect(page.description).toBe(shared.description);
    expect(page.annotations).toEqual(shared.annotations);
  });

  it("imports no handler, use case, adapter or Node API", () => {
    const seen = new Set<string>();
    const queue = [resolve(source, "page.ts")];
    const bare = new Set<string>();
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      // Type-only imports are erased, so they cannot reach a bundle.
      for (const match of text.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)) {
        const target = match[1];
        if (target.startsWith(".")) {
          queue.push(resolve(dirname(file), `${target}.ts`));
        } else {
          bare.add(target);
        }
      }
    }
    const files = [...seen].map((file) => file.slice(source.length + 1));
    expect(files).toEqual(expect.arrayContaining(["page.ts", "specs/page.ts", "specs/search-articles.ts", "specs/shared.ts"]));
    expect(files.filter((file) => file.startsWith("handlers/") || file.includes("catalogue") || file.includes("ports"))).toEqual([]);
    for (const target of bare) {
      expect(target, target).not.toMatch(/^node:|^@atlasnews\/adapters|\/application\//);
      expect(["zod/v4", "@atlasnews/core/locale", "@atlasnews/core/editorial/domain/article"]).toContain(target);
    }
  });
});
