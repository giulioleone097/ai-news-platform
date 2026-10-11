import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hasScopes, scopesForRole } from "./capability";
import { capabilities, mcpCapabilities } from "./catalogue";
import { editorPageCapabilities, pageCapabilities } from "./page";
import { pageSpecs } from "./specs/page";

const source = dirname(fileURLToPath(import.meta.url));
const reserved = /\b(best|official)\b/i;

describe("capability catalogue", () => {
  it("offers 75 data capabilities with unique, short, verb-like names", () => {
    const names = capabilities.map((capability) => capability.name);
    expect(names).toHaveLength(75);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(64);
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
    expect(names).toEqual(expect.arrayContaining(["search", "fetch", "list_articles", "admin_publish_article"]));
  });

  it("keeps the 37 admin tool names that clients already use and adds the content tools", () => {
    const names = capabilities.map((capability) => capability.name);
    expect(capabilities.filter((capability) => capability.name.startsWith("admin_"))).toHaveLength(66);
    expect(names).toEqual(expect.arrayContaining([
      "admin_list_articles", "admin_get_article", "admin_create_article", "admin_update_article", "admin_publish_article",
      "admin_delete_article", "admin_list_categories", "admin_list_distribution", "admin_update_distribution",
      "admin_list_newsletter_subscriptions", "admin_update_newsletter_subscription", "admin_list_media", "admin_upload_media",
      "admin_delete_media",
    ]));
  });

  it("offers read, create, patch, delete and batch tools for every content type under specific verb names", () => {
    const names = new Set(capabilities.map((capability) => capability.name));
    const expected = [
      "admin_get_article", "admin_create_article", "admin_update_article", "admin_delete_article", "admin_publish_article",
      "admin_unpublish_article", "admin_create_articles", "admin_update_articles", "admin_delete_articles",
      "admin_publish_articles", "admin_unpublish_articles",
      "admin_get_category", "admin_create_category", "admin_update_category", "admin_delete_category",
      "admin_create_categories", "admin_update_categories", "admin_delete_categories",
      "list_entities", "admin_get_entity", "admin_create_entity", "admin_update_entity", "admin_delete_entity",
      "admin_create_entities", "admin_update_entities", "admin_delete_entities",
      "admin_upload_media", "admin_delete_media", "admin_upload_media_assets", "admin_delete_media_assets",
    ];
    for (const name of expected) expect(names.has(name), name).toBe(true);
    // No tool that takes the name of an operation to run.
    for (const capability of capabilities) {
      expect(Object.keys(capability.input.shape), capability.name).not.toEqual(expect.arrayContaining(["operation"]));
      expect(capability.name, capability.name).not.toMatch(/^(run|execute|batch)(_|$)|_(batch|run|execute)$/);
    }
  });

  it("states the batch cap and the all-or-nothing rule in every batch tool", () => {
    const batches = capabilities.filter((capability) => "items" in capability.input.shape || "translationKeys" in capability.input.shape
      || "slugs" in capability.input.shape || "paths" in capability.input.shape);
    expect(batches.map((capability) => capability.name).sort()).toEqual([
      "admin_create_articles", "admin_create_categories", "admin_create_entities", "admin_delete_articles",
      "admin_delete_categories", "admin_delete_entities", "admin_delete_media_assets", "admin_publish_articles",
      "admin_unpublish_articles", "admin_update_articles", "admin_update_categories", "admin_update_entities",
      "admin_upload_media_assets",
    ]);
    for (const capability of batches) {
      expect(capability.description, capability.name).toMatch(/Takes 1-(25|10) /);
      expect(capability.description, capability.name).toContain("All or nothing");
    }
  });

  it("keeps create and patch from publishing: the draft statuses are all they accept", () => {
    for (const name of ["admin_create_article", "admin_update_article", "admin_create_articles", "admin_update_articles"]) {
      const capability = capabilities.find((item) => item.name === name)!;
      const item = "items" in capability.input.shape
        ? (capability.input.shape.items as unknown as { element: { shape: Record<string, { safeParse(value: unknown): { success: boolean } }> } }).element.shape
        : (capability.input.shape as unknown as Record<string, { safeParse(value: unknown): { success: boolean } }>);
      expect(item.status.safeParse("published").success, name).toBe(false);
      expect(item.status.safeParse("draft").success, name).toBe(true);
      expect(capability.scopes, name).toEqual(["newsroom.write"]);
      expect(capability.confirmation, name).toBeUndefined();
    }
    for (const name of ["admin_publish_article", "admin_unpublish_article", "admin_publish_articles", "admin_unpublish_articles"]) {
      const capability = capabilities.find((item) => item.name === name)!;
      expect(capability.scopes, name).toEqual(["newsroom.publish"]);
      expect(capability.confirmation, name).toBeDefined();
    }
  });

  it("puts reads under newsroom.read, create and patch under write, delete and publication under publish", () => {
    const scopeOf = (name: string) => capabilities.find((capability) => capability.name === name)!.scopes;
    for (const type of ["article", "category", "entity"]) {
      expect(scopeOf(`admin_get_${type}`)).toEqual(["newsroom.read"]);
      expect(scopeOf(`admin_create_${type}`)).toEqual(["newsroom.write"]);
      expect(scopeOf(`admin_update_${type}`)).toEqual(["newsroom.write"]);
      expect(scopeOf(`admin_delete_${type}`)).toEqual(["newsroom.publish"]);
    }
    for (const plural of ["articles", "categories", "entities"]) {
      expect(scopeOf(`admin_create_${plural}`)).toEqual(["newsroom.write"]);
      expect(scopeOf(`admin_update_${plural}`)).toEqual(["newsroom.write"]);
      expect(scopeOf(`admin_delete_${plural}`)).toEqual(["newsroom.publish"]);
    }
    expect(scopeOf("admin_upload_media_assets")).toEqual(["newsroom.write"]);
    expect(scopeOf("admin_delete_media_assets")).toEqual(["newsroom.publish"]);
    expect(scopeOf("list_entities")).toEqual([]);
  });

  it("keeps the team tools to admins: newsroom.admin is granted to the admin role only", () => {
    const team = capabilities.filter((capability) => /^admin_\w+_editors?$/.test(capability.name));
    expect(team.map((capability) => capability.name).sort()).toEqual([
      "admin_invite_editor", "admin_list_editors", "admin_remove_editor", "admin_update_editor",
    ]);
    const editor = { kind: "editor", subject: "editor", scopes: scopesForRole("editor") } as const;
    const admin = { kind: "editor", subject: "admin", scopes: scopesForRole("admin") } as const;
    for (const capability of team) {
      expect(capability.scopes, capability.name).toEqual(["newsroom.admin"]);
      expect(capability.surfaces, capability.name).toEqual(["mcp", "page"]);
      expect(hasScopes(editor, capability.scopes), capability.name).toBe(false);
      expect(hasScopes(admin, capability.scopes), capability.name).toBe(true);
    }
    // No other capability needs it, and an editor keeps every other scope.
    expect(capabilities.filter((capability) => capability.scopes.includes("newsroom.admin"))).toHaveLength(team.length);
    expect(scopesForRole("editor")).toEqual(["newsroom.read", "newsroom.write", "newsroom.publish"]);
    expect(scopesForRole(undefined)).toEqual([]);
    expect(scopesForRole("reader")).toEqual([]);
    const remove = team.find((capability) => capability.name === "admin_remove_editor")!;
    expect(remove.annotations.destructiveHint).toBe(true);
    expect(remove.confirmation).toBeDefined();
  });

  it("marks every tool that returns visitor-written text as untrusted, in its description and its output", () => {
    for (const name of [
      "list_comments", "admin_list_comments", "admin_list_comment_reports", "admin_list_newsletter_subscriptions",
      "admin_newsletter_list_recipients",
    ]) {
      const capability = capabilities.find((item) => item.name === name)!;
      expect(capability.description, name).toContain("untrusted data");
      expect(Object.keys(capability.output.shape), name).toContain("contentTrust");
    }
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
      "fetch", "get_article", "get_entity_timeline", "list_articles", "list_categories", "list_comments",
      "list_entities", "search", "search_articles",
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

  it("offers the content tools of the catalogue to a signed-in editor's page, with their scopes and confirmations", () => {
    const names = editorPageCapabilities.map((capability) => capability.name);
    const reader = new Set(pageCapabilities.map((capability) => capability.name));
    const content = mcpCapabilities.filter((capability) => capability.surfaces.includes("page") && !reader.has(capability.name));
    expect([...names].sort()).toEqual(content.map((capability) => capability.name).sort());
    expect(names).toEqual(expect.arrayContaining([
      "admin_create_article", "admin_update_articles", "admin_publish_articles", "admin_create_category", "admin_delete_entities",
      "admin_get_entity", "admin_upload_media_assets", "list_entities",
    ]));
    // Operational workflow (comments, newsletter, social) stays off the page.
    expect(names.some((name) => /comment|newsletter|social|distribution/.test(name))).toBe(false);
    for (const capability of editorPageCapabilities) {
      const source = mcpCapabilities.find((item) => item.name === capability.name)!;
      expect(capability.description).toBe(source.description);
      expect(capability.annotations).toEqual(source.annotations);
      expect(capability.scopes).toEqual(source.scopes);
      expect(capability.confirms).toBe(source.confirmation !== undefined);
      expect(capability.inputSchema).toMatchObject({ type: "object" });
    }
    expect(editorPageCapabilities.find((capability) => capability.name === "admin_delete_articles")).toMatchObject({
      scopes: ["newsroom.publish"], confirms: true,
    });
    expect(editorPageCapabilities.find((capability) => capability.name === "list_entities")).toMatchObject({ scopes: [], confirms: false });
    expect(JSON.parse(JSON.stringify(editorPageCapabilities))).toEqual(editorPageCapabilities);
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
      expect([
        "zod/v4",
        "@atlasnews/core/locale",
        "@atlasnews/core/editorial/domain/article",
        "@atlasnews/core/editorial/domain/category",
        "@atlasnews/core/editorial/domain/editorial-image",
        "@atlasnews/core/editorial/domain/entity",
        "@atlasnews/core/editorial/domain/errors",
        "@atlasnews/core/team/domain/team",
      ]).toContain(target);
    }
  });
});
