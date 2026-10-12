import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as z from "zod/v4";

import { hasScopes, scopesForRole } from "./capability";
import { capabilities, mcpCapabilities } from "./catalogue";
import { editorPageCapabilities, pageCapabilities } from "./page";
import { pageSpecs } from "./specs/page";

const source = dirname(fileURLToPath(import.meta.url));
const reserved = /\b(best|official)\b/i;

type Verb = "list" | "get" | "create" | "update" | "delete" | "createMany" | "updateMany" | "deleteMany";
/** The tool that does it, or the reason the type has none. */
type Cell = string | { none: string };
const none = (reason: string): Cell => ({ none: reason });

/**
 * What every content type offers, on purpose. A gap carries its reason, so a missing operation is a decision
 * of the domain and not something forgotten; adding or removing a tool fails the tests below until this table
 * says so. "Many" tools are all-or-nothing batches of up to 25 items (10 images).
 */
const parity: Record<string, Record<Verb, Cell>> = {
  article: {
    list: "admin_list_articles", get: "admin_get_article", create: "admin_create_article", update: "admin_update_article",
    delete: "admin_delete_article", createMany: "admin_create_articles", updateMany: "admin_update_articles",
    deleteMany: "admin_delete_articles",
  },
  category: {
    list: "admin_list_categories", get: "admin_get_category", create: "admin_create_category", update: "admin_update_category",
    delete: "admin_delete_category", createMany: "admin_create_categories", updateMany: "admin_update_categories",
    deleteMany: "admin_delete_categories",
  },
  entity: {
    list: "list_entities", get: "admin_get_entity", create: "admin_create_entity", update: "admin_update_entity",
    delete: "admin_delete_entity", createMany: "admin_create_entities", updateMany: "admin_update_entities",
    deleteMany: "admin_delete_entities",
  },
  media: {
    list: "admin_list_media", get: "admin_get_media", create: "admin_upload_media",
    update: none("assets are immutable files: upload the new image and point the article's cover at it"),
    delete: "admin_delete_media", createMany: "admin_upload_media_assets",
    updateMany: none("assets are immutable files"), deleteMany: "admin_delete_media_assets",
  },
  comment: {
    list: "admin_list_comments", get: "admin_get_comment",
    create: none("visitors write comments on the public site; an editor never posts or rewrites one in their name"),
    // The only thing an editor changes about a comment is its moderation status.
    update: "admin_moderate_comment",
    delete: none("a comment is never hard-deleted: moderating it as deleted hides it and keeps the audit trail and its replies"),
    createMany: none("visitors write comments on the public site"), updateMany: "admin_moderate_comments",
    deleteMany: none("a comment is never hard-deleted"),
  },
  contactMessage: {
    list: "admin_list_contact_messages", get: "admin_get_contact_message",
    create: none("messages come from the visitors' contact form"), update: "admin_update_contact_message",
    delete: "admin_delete_contact_message", createMany: none("messages come from the visitors' contact form"),
    updateMany: "admin_update_contact_messages", deleteMany: "admin_delete_contact_messages",
  },
  subscriber: {
    list: "admin_list_newsletter_subscriptions", get: "admin_get_newsletter_subscription",
    // Consent cannot be recorded for a reader: the request sends the double opt-in email and the reader confirms it.
    create: "admin_newsletter_request_subscription", update: "admin_update_newsletter_subscription",
    // Erasure pseudonymizes the person and keeps the suppression and audit records.
    delete: "admin_newsletter_erase_subscription",
    createMany: none("each address must confirm by its own email, and a bulk invitation is spam"),
    updateMany: none("a reader leaves on their own, and coming back always needs their confirmation"),
    deleteMany: none("an erasure answers the request of one person"),
  },
  newsletterCampaign: {
    list: "admin_newsletter_list_campaigns", get: "admin_newsletter_get_campaign", create: "admin_newsletter_save_campaign_draft",
    update: "admin_newsletter_update_campaign_draft", delete: "admin_newsletter_delete_campaign_draft",
    createMany: none("a campaign is one subject for one audience, written and sent on its own"),
    updateMany: none("a campaign is written and sent on its own"),
    deleteMany: none("only drafts can be deleted, and there are few of them"),
  },
  socialJob: {
    list: "admin_social_list", get: "admin_social_get", create: "admin_social_enqueue", update: "admin_social_update",
    // A queued job is cancelled, never deleted: the outbox keeps its receipts.
    delete: "admin_social_cancel",
    createMany: none("each post has its own provider, text, idempotency key and confirmation"),
    updateMany: none("each post is edited against its own revision"), deleteMany: "admin_social_cancel_jobs",
  },
  distribution: {
    list: "admin_list_distribution", get: none("the list of a locale is short and gives every field of each item"),
    create: none("the items are created with the article's distribution channels"), update: "admin_update_distribution",
    delete: none("the items go with their article"), createMany: none("created with the article"),
    updateMany: none("a handful of items per locale"), deleteMany: none("they go with their article"),
  },
  teamMember: {
    list: "admin_list_editors", get: none("the team is short and the list gives every member in full"),
    create: "admin_invite_editor", update: "admin_update_editor", delete: "admin_remove_editor",
    createMany: none("the team changes rarely"), updateMany: none("each change is checked against the last-admin rule on its own"),
    deleteMany: none("each removal is checked against the last-admin rule on its own"),
  },
};

/** Tools that are not a verb of a content type: publishing, delivery, previews and the public reads. */
const beyondCrud = [
  "admin_publish_article", "admin_unpublish_article", "admin_publish_articles", "admin_unpublish_articles",
  "admin_list_comment_reports", "admin_list_comment_audit", "admin_comment_process_notifications",
  "admin_newsletter_list_recipients", "admin_newsletter_send_campaign", "admin_newsletter_schedule_campaign",
  "admin_newsletter_cancel_campaign", "admin_newsletter_process_outbox",
  "admin_social_preview", "admin_social_requeue", "admin_social_retry", "admin_social_process_outbox",
  "fetch", "get_article", "get_entity_timeline", "list_articles", "list_categories", "list_comments", "search", "search_articles",
];

const cells = Object.entries(parity).flatMap(([type, row]) =>
  (Object.entries(row) as [Verb, Cell][]).map(([verb, cell]) => ({ type, verb, cell })));
const toolOf = (type: string, verb: Verb) => {
  const cell = parity[type][verb];
  return typeof cell === "string" ? cell : undefined;
};

describe("capability catalogue", () => {
  it("offers 86 data capabilities with unique, short, verb-like names", () => {
    const names = capabilities.map((capability) => capability.name);
    expect(names).toHaveLength(86);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(64);
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
    expect(names).toEqual(expect.arrayContaining(["search", "fetch", "list_articles", "admin_publish_article"]));
  });

  it("keeps the admin tool names that clients already use and adds the content tools", () => {
    const names = capabilities.map((capability) => capability.name);
    expect(capabilities.filter((capability) => capability.name.startsWith("admin_"))).toHaveLength(77);
    expect(names).toEqual(expect.arrayContaining([
      "admin_list_articles", "admin_get_article", "admin_create_article", "admin_update_article", "admin_publish_article",
      "admin_delete_article", "admin_list_categories", "admin_list_distribution", "admin_update_distribution",
      "admin_list_newsletter_subscriptions", "admin_update_newsletter_subscription", "admin_list_media", "admin_upload_media",
      "admin_delete_media",
    ]));
  });

  it("offers every verb of every content type, or says why the type has none", () => {
    const names = new Set(capabilities.map((capability) => capability.name));
    const used = new Set<string>();
    for (const { type, verb, cell } of cells) {
      if (typeof cell === "string") {
        expect(names.has(cell), `${type}.${verb}: ${cell}`).toBe(true);
        expect(used.has(cell), `${cell} fills two cells`).toBe(false);
        used.add(cell);
      } else {
        expect(cell.none.length, `${type}.${verb} needs a reason`).toBeGreaterThan(15);
      }
    }
    // Every tool of the catalogue is a cell or a deliberate extra, so a new tool or a removed one changes this file too.
    const accounted = [...used, ...beyondCrud].sort();
    expect([...names].sort()).toEqual(accounted);
    // The Studio's content types keep the whole set; only the types whose domain forbids a verb may lack it.
    for (const type of ["article", "category", "entity"]) {
      for (const verb of Object.keys(parity[type]) as Verb[]) expect(typeof parity[type][verb], `${type}.${verb}`).toBe("string");
    }
    // No tool that takes the name of an operation to run.
    for (const capability of capabilities) {
      expect(Object.keys(capability.input.shape), capability.name).not.toEqual(expect.arrayContaining(["operation"]));
      expect(capability.name, capability.name).not.toMatch(/^(run|execute|batch)(_|$)|_(batch|run|execute)$/);
    }
  });

  it("gives a batch tool the scope, confirmation and destructive hint of its single sibling", () => {
    const find = (name: string) => capabilities.find((capability) => capability.name === name)!;
    for (const type of Object.keys(parity)) {
      for (const [single, many] of [["create", "createMany"], ["update", "updateMany"], ["delete", "deleteMany"]] as const) {
        const one = toolOf(type, single);
        const batch = toolOf(type, many);
        if (!one || !batch) continue;
        expect(find(batch).scopes, `${many} of ${type}`).toEqual(find(one).scopes);
        expect(find(batch).confirmation !== undefined, `${many} of ${type}: confirmation`).toBe(find(one).confirmation !== undefined);
        expect(find(batch).annotations.destructiveHint, `${many} of ${type}: destructive`).toBe(find(one).annotations.destructiveHint);
      }
    }
  });

  it("states the batch cap and the all-or-nothing rule in every batch tool", () => {
    const batches = capabilities.filter((capability) => "items" in capability.input.shape || "translationKeys" in capability.input.shape
      || "slugs" in capability.input.shape || "paths" in capability.input.shape || "ids" in capability.input.shape);
    const many = cells.filter(({ verb }) => verb.endsWith("Many")).flatMap(({ cell }) => (typeof cell === "string" ? [cell] : []));
    expect(batches.map((capability) => capability.name).sort()).toEqual(
      [...many, "admin_publish_articles", "admin_unpublish_articles"].sort(),
    );
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
      "list_comments", "admin_list_comments", "admin_get_comment", "admin_list_comment_reports",
      "admin_list_newsletter_subscriptions", "admin_get_newsletter_subscription", "admin_newsletter_list_recipients",
      "admin_list_contact_messages", "admin_get_contact_message",
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

  it("announces sends, cancellations and replaced payloads as destructive, and leaves reversible writes alone", () => {
    const destructiveOf = (name: string) => capabilities.find((capability) => capability.name === name)!.annotations.destructiveHint;
    for (const name of [
      "admin_newsletter_send_campaign", "admin_newsletter_cancel_campaign", "admin_newsletter_erase_subscription",
      "admin_newsletter_process_outbox", "admin_comment_process_notifications", "admin_social_cancel", "admin_social_requeue",
      "admin_social_process_outbox", "admin_delete_media", "admin_delete_contact_message", "admin_delete_contact_messages",
      "admin_social_cancel_jobs", "admin_social_update", "admin_newsletter_delete_campaign_draft", "admin_moderate_comment",
      "admin_moderate_comments",
    ]) expect(destructiveOf(name), name).toBe(true);
    // Publishing and unpublishing can be undone, an upload gets a new path and never overwrites, scheduling can be cancelled.
    for (const name of [
      "admin_publish_article", "admin_unpublish_article", "admin_publish_articles", "admin_unpublish_articles",
      "admin_upload_media", "admin_upload_media_assets", "admin_newsletter_schedule_campaign", "admin_social_enqueue",
      "admin_newsletter_request_subscription", "admin_invite_editor", "admin_newsletter_update_campaign_draft",
      "admin_update_contact_messages",
    ]) expect(destructiveOf(name), name).toBe(false);
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
    // What an editor does in the Studio is on the page; the workers (outbox processing, delivery, erasure) are MCP-only.
    expect(names).toEqual(expect.arrayContaining([
      "admin_list_comments", "admin_moderate_comment", "admin_list_comment_audit", "admin_list_contact_messages",
      "admin_delete_contact_message", "admin_list_distribution", "admin_update_distribution",
      "admin_list_newsletter_subscriptions", "admin_update_newsletter_subscription", "admin_newsletter_request_subscription",
      "admin_newsletter_save_campaign_draft", "admin_newsletter_send_campaign", "admin_social_preview", "admin_social_enqueue",
      "admin_social_list", "admin_social_cancel", "admin_social_retry", "admin_get_media", "admin_get_comment", "admin_moderate_comments",
      "admin_get_contact_message", "admin_update_contact_messages", "admin_delete_contact_messages",
      "admin_get_newsletter_subscription", "admin_newsletter_update_campaign_draft", "admin_newsletter_delete_campaign_draft",
      "admin_social_update", "admin_social_cancel_jobs",
    ]));
    for (const worker of [
      "admin_comment_process_notifications", "admin_newsletter_process_outbox", "admin_newsletter_erase_subscription",
      "admin_social_process_outbox", "list_comments",
    ]) {
      expect(names, worker).not.toContain(worker);
      expect(capabilities.find((capability) => capability.name === worker)?.surfaces, worker).toEqual(["mcp"]);
    }
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

  it("gives the page search the MCP tool's name, text and input, with an output of its own", () => {
    const mcp = mcpCapabilities.find((capability) => capability.name === "search_articles")!;
    const page = pageCapabilities.find((capability) => capability.name === "search_articles")!;
    const onPage = pageSpecs.find((spec) => spec.name === "search_articles")!;
    expect(mcp.surfaces).toEqual(["mcp"]);
    expect(onPage.surfaces).toEqual(["page"]);
    expect(page.title).toBe(mcp.title);
    expect(page.description).toBe(mcp.description);
    expect(page.annotations).toEqual(mcp.annotations);
    expect(page.inputSchema).toEqual(z.toJSONSchema(mcp.input, { io: "input" }));
    expect(onPage.output).not.toBe(mcp.output);
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
        "@atlasnews/core/editorial/domain/editorial-operations",
        "@atlasnews/core/editorial/domain/entity",
        "@atlasnews/core/editorial/domain/errors",
        "@atlasnews/core/comments/domain/admin-tool-definitions",
        "@atlasnews/core/comments/domain/comment",
        "@atlasnews/core/newsletter/domain/newsletter",
        "@atlasnews/core/social-publishing/domain/errors",
        "@atlasnews/core/social-publishing/domain/social-publication",
        "@atlasnews/core/support/domain/contact-message",
        "@atlasnews/core/team/domain/team",
      ]).toContain(target);
    }
  });
});
