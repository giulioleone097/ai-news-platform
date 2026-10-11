import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryEditorialRepository } from "@atlasnews/adapters/editorial/memory-editorial-repository";
import type { EditorialCacheInvalidator } from "@atlasnews/core/editorial/application/cache-port";

import { confirmationKey } from "./confirmation";
import { memoryPorts, modernParams, sendRpc, testApiKey } from "./mcp-test-client";

const repository = new MemoryEditorialRepository();
const onMutation = vi.fn<EditorialCacheInvalidator>(async () => undefined);
const authorization = `Bearer ${testApiKey}`;

const formCapabilities = {
  elicitation: { form: {} },
  extensions: { "openai/elicitation": { form: {} } },
};

beforeEach(() => onMutation.mockClear());

async function call(
  name: string,
  args: Record<string, unknown>,
  options: { capabilities?: Record<string, unknown>; inputResponses?: Record<string, unknown> } = {},
) {
  const { payload } = await sendRpc({
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/call",
    params: modernParams(
      { name, arguments: args, ...(options.inputResponses ? { inputResponses: options.inputResponses } : {}) },
      options.capabilities,
    ),
  }, undefined, { authorization, ports: memoryPorts(repository, onMutation) });
  return payload.result;
}

async function draft(title: string) {
  const created = await call("admin_create_article", {
    locale: "en",
    title,
    excerpt: "A throwaway draft used to prove the confirmation behaviour end to end.",
    content: "This throwaway draft only exists so that the confirmation behaviour of destructive tools can be proven.",
    categorySlug: "research",
  });
  return created.structuredContent.article as { id: string; title: string };
}

describe("newsroom tools through the catalogue", () => {
  it("creates, updates, publishes, reads, and deletes one article", async () => {
    const created = await call("admin_create_article", {
      locale: "en",
      title: "A practical MCP administration test",
      excerpt: "A complete editorial lifecycle exercised through authenticated MCP tools.",
      content: "This test article contains enough useful editorial copy to satisfy the newsroom validation boundary and prove the full lifecycle safely.",
      categorySlug: "research",
      status: "draft",
    });
    expect(created.isError).not.toBe(true);
    const articleId = created.structuredContent.article.id as string;
    const createdSlug = created.structuredContent.article.slug as string;

    const updated = await call("admin_update_article", {
      id: articleId,
      locale: "en",
      slug: "updated-mcp-administration-test",
      featured: true,
      distribution: ["newsletter", "linkedin"],
    });
    expect(updated.structuredContent.article.featured).toBe(true);
    const updatedSlug = updated.structuredContent.article.slug as string;

    const published = await call("admin_publish_article", { id: articleId, locale: "en", confirm: true });
    expect(published.structuredContent.article.status).toBe("published");

    const read = await call("admin_get_article", { id: articleId, locale: "en" });
    expect(read.structuredContent.article.id).toBe(articleId);

    const deleted = await call("admin_delete_article", { id: articleId, locale: "en", confirm: true });
    expect(deleted.structuredContent.deletedId).toBe(articleId);
    expect(await repository.findById(articleId, "en")).toBeNull();
    expect(onMutation.mock.calls.map(([event]) => event)).toEqual([
      { locale: "en", slugs: [createdSlug] },
      { locale: "en", slugs: [createdSlug, updatedSlug] },
      { locale: "en", slugs: [updatedSlug] },
      { locale: "en", slugs: [updatedSlug] },
    ]);
  });

  it("manages distribution, newsletter consent, and media capabilities", async () => {
    const distribution = await call("admin_list_distribution", { locale: "en" });
    const publication = distribution.structuredContent.items[0] as { id: string };
    expect(publication.id).toBeTruthy();

    const updatedDistribution = await call("admin_update_distribution", {
      id: publication.id,
      status: "published",
      externalUrl: "https://www.linkedin.com/posts/atlasnews-test",
    });
    expect(updatedDistribution.structuredContent.publication.status).toBe("published");

    await repository.subscribe("reader@example.com", "mcp-test", "en");
    const subscriptions = await call("admin_list_newsletter_subscriptions", { locale: "en", limit: 20 });
    const subscription = subscriptions.structuredContent.items.find(
      (item: { email: string }) => item.email === "reader@example.com",
    ) as { id: string };
    const unsubscribed = await call("admin_update_newsletter_subscription", {
      id: subscription.id,
      status: "unsubscribed",
    });
    expect(unsubscribed.structuredContent.status).toBe("unsubscribed");

    const media = await call("admin_list_media", {});
    expect(media.structuredContent.writable).toBe(false);
    expect(media.structuredContent.items).toHaveLength(1);
    expect(onMutation).not.toHaveBeenCalled();
  });

  it("refuses a confirmed tool without confirm: true on hosts without forms", async () => {
    const article = await draft("A draft that must survive a missing confirmation");
    const result = await call("admin_delete_article", { id: article.id, locale: "en" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("confirm: true");
    expect(await repository.findById(article.id, "en")).not.toBeNull();
  });

  it("asks through a form first on hosts that can show one, whatever the arguments say", async () => {
    const article = await draft("A draft that the form will delete");
    const args = { id: article.id, locale: "en", confirm: true };

    const asked = await call("admin_delete_article", args, { capabilities: formCapabilities });
    expect(asked.resultType).toBe("input_required");
    const request = asked.inputRequests[confirmationKey];
    expect(request.params.message).toContain(article.title);
    expect(request.params._meta["openai/elicitation"].requestedSchema.required).toEqual(["confirm"]);
    expect(await repository.findById(article.id, "en")).not.toBeNull();

    const declined = await call("admin_delete_article", args, {
      capabilities: formCapabilities,
      inputResponses: { [confirmationKey]: { action: "decline" } },
    });
    expect(declined.isError).toBe(true);
    const unchecked = await call("admin_delete_article", args, {
      capabilities: formCapabilities,
      inputResponses: { [confirmationKey]: { action: "accept", content: { confirm: false } } },
    });
    expect(unchecked.isError).toBe(true);
    expect(await repository.findById(article.id, "en")).not.toBeNull();

    const accepted = await call("admin_delete_article", { id: article.id, locale: "en" }, {
      capabilities: formCapabilities,
      inputResponses: { [confirmationKey]: { action: "accept", content: { confirm: true } } },
    });
    expect(accepted.structuredContent.deletedId).toBe(article.id);
    expect(await repository.findById(article.id, "en")).toBeNull();
  });

  it("falls back to a core form for hosts without the OpenAI form extension", async () => {
    const article = await draft("A draft that the core form will publish");
    const asked = await call("admin_publish_article", { id: article.id, locale: "en" }, {
      capabilities: { elicitation: { form: {} } },
    });
    const request = asked.inputRequests[confirmationKey];
    expect(request.params.requestedSchema.properties.confirm.type).toBe("boolean");
    expect(request.params._meta).toBeUndefined();
    expect((await repository.findById(article.id, "en"))?.status).toBe("draft");
  });
});

describe("content management through the catalogue", () => {
  const body = (title: string) => ({
    locale: "en",
    title,
    excerpt: "A throwaway story used to prove content management end to end.",
    content: "This throwaway story only exists so that content management can be proven through the endpoint.",
    categorySlug: "tools",
  });

  it("never publishes through create or update, single or batch, and keeps the story as it was", async () => {
    const created = await call("admin_create_article", body("A story that must not go live by accident"));
    const id = created.structuredContent.article.id as string;

    const attempts = [
      await call("admin_create_article", { ...body("Created as published directly"), status: "published" }),
      await call("admin_update_article", { id, locale: "en", status: "published" }),
      await call("admin_create_articles", { items: [{ ...body("Batch created as published"), status: "published" }] }),
      await call("admin_update_articles", { items: [{ id, locale: "en", status: "published" }] }),
    ];
    for (const attempt of attempts) {
      expect(attempt.isError).toBe(true);
      expect(attempt.content[0].text).toMatch(/status/);
    }
    expect((await repository.findById(id, "en"))?.status).toBe("draft");
    expect((await repository.listForStudio("en")).some((article) => /published directly|as published/.test(article.title))).toBe(false);

    const published = await call("admin_publish_articles", { items: [{ id, locale: "en" }], confirm: true });
    expect(published.structuredContent.items[0]).toMatchObject({ action: "published", status: "published", id });
    const unpublished = await call("admin_unpublish_article", { id, locale: "en", confirm: true });
    expect(unpublished.structuredContent.article.status).toBe("draft");
    await call("admin_delete_article", { id, locale: "en", confirm: true });
  });

  it("round-trips a category: create, patch, get, delete, with the in-use rule", async () => {
    const created = await call("admin_create_category", {
      translations: { en: { name: "Open data", description: "Data in the open." }, it: { name: "Dati aperti" } },
    });
    expect(created.structuredContent.category).toMatchObject({ translationKey: "open-data" });

    const patched = await call("admin_update_category", { translationKey: "open-data", translations: { en: { description: "" } } });
    expect(patched.structuredContent.category.translations.en).toMatchObject({ name: "Open data", description: "" });
    expect(patched.structuredContent.category.translations.it.slug).toBe("dati-aperti");

    expect((await call("admin_get_category", { translationKey: "open-data" })).structuredContent.category.position).toBe(6);
    const inUse = await call("admin_delete_category", { translationKey: "research", confirm: true });
    expect(inUse.isError).toBe(true);
    expect(inUse.content[0].text).toMatch(/Category "research" is used by \d+ articles/);

    const deleted = await call("admin_delete_category", { translationKey: "open-data", confirm: true });
    expect(deleted.structuredContent.deletedKey).toBe("open-data");
    expect((await call("admin_get_category", { translationKey: "open-data" })).isError).toBe(true);
  });

  it("round-trips an entity: create, patch with null, get, delete, with the linked-story rule", async () => {
    const created = await call("admin_create_entity", { kind: "company", name: "Proof Labs", officialUrl: "https://proof.example", descriptions: { en: "A proof company." } });
    expect(created.structuredContent.entity).toMatchObject({ slug: "proof-labs", descriptions: { en: "A proof company." } });

    const patched = await call("admin_update_entity", { slug: "proof-labs", officialUrl: null, descriptions: { en: null, it: "Un'azienda di prova." } });
    expect(patched.structuredContent.entity).toMatchObject({ officialUrl: null, descriptions: { it: "Un'azienda di prova." }, name: "Proof Labs" });

    const linked = await call("admin_create_article", { ...body("A story linking the proof company"), entities: [{ slug: "proof-labs", isPrimary: true }] });
    const refused = await call("admin_delete_entity", { slug: "proof-labs", confirm: true });
    expect(refused.content[0].text).toMatch(/linked to 1 story/);
    await call("admin_delete_article", { id: linked.structuredContent.article.id, locale: "en", confirm: true });

    expect((await call("admin_get_entity", { slug: "proof-labs" })).structuredContent.entity.name).toBe("Proof Labs");
    expect((await call("admin_delete_entity", { slug: "proof-labs", confirm: true })).structuredContent.deletedSlug).toBe("proof-labs");
  });

  it("writes a batch in full, or not at all, and names every invalid item", async () => {
    const before = (await repository.listForStudio("en")).length;
    const refused = await call("admin_create_articles", {
      items: [body("A first valid batch story"), { ...body("A second batch story in a ghost category"), categorySlug: "ghost" }, body("A third valid batch story")],
    });
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toContain("Nothing was written");
    expect(refused.content[0].text).toContain("#1");
    expect((await repository.listForStudio("en")).length).toBe(before);

    const created = await call("admin_create_articles", { items: [body("A first valid batch story"), body("A third valid batch story")] });
    expect(created.structuredContent).toMatchObject({ count: 2, items: [{ index: 0, action: "created" }, { index: 1, action: "created" }] });
    const refs = created.structuredContent.items.map((item: { id: string; locale: string }) => ({ id: item.id, locale: item.locale }));
    const gone = await call("admin_delete_articles", { items: refs, confirm: true });
    expect(gone.structuredContent.items.map((item: { action: string }) => item.action)).toEqual(["deleted", "deleted"]);
    expect((await repository.listForStudio("en")).length).toBe(before);
    expect(onMutation).toHaveBeenCalled();
  });

  it("answers a read-only demo store honestly for media", async () => {
    const upload = await call("admin_upload_media_assets", {
      items: [{ name: "a.png", mimeType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" }],
    });
    expect(upload.isError).toBe(true);
    expect(upload.content[0].text).toBe("Media uploads require media storage.");
  });
});
