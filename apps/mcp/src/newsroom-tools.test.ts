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
