import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { SupabaseEditorialRepository } from "./supabase-editorial-repository";

const authorId = "7e05ad26-5ee6-4747-ae9b-b14547462239";
const articleId = "6f1c2c1e-6a2b-4f7e-9d3e-1a2b3c4d5e6f";

/**
 * A client that records every call and answers rpc by name. Reads answer an empty result, so the
 * test sees which writes the repository tried: a batch must be exactly one rpc, never a loop of writes.
 */
function recordingClient(answers: Record<string, { data?: unknown; error?: { message: string } }>) {
  const calls: Array<{ kind: "rpc" | "table"; name: string; args?: unknown }> = [];
  const chain = (name: string): unknown => new Proxy(() => undefined, {
    get(_target, property) {
      if (property === "then") {
        return (resolve: (value: unknown) => void) => resolve({ data: name === "categories" ? [{ id: "c1", locale: "en", slug: "tools" }] : [], error: null, count: 0 });
      }
      return () => chain(name);
    },
  });
  const client = {
    from: (name: string) => {
      calls.push({ kind: "table", name });
      return chain(name);
    },
    rpc: (name: string, args: unknown) => {
      calls.push({ kind: "rpc", name, args });
      return Promise.resolve({ data: null, error: null, ...answers[name] });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const draft = (n: number) => ({
  locale: "en" as const,
  title: `Batch story number ${n}`,
  excerpt: "An excerpt long enough for the validation rules.",
  content: "A body long enough for the validation rules to pass.",
  categorySlug: "tools",
  status: "draft" as const,
});

describe("Supabase batch writes are one transaction", () => {
  it("saves many articles with one rpc that carries every item in order", async () => {
    const { client, calls } = recordingClient({ save_articles_batch: { data: [articleId] } });
    const repository = new SupabaseEditorialRepository(client, { audience: "editorial", authorId });
    await repository.saveMany([draft(1), draft(2)]).catch(() => undefined);

    const rpcs = calls.filter((call) => call.kind === "rpc");
    expect(rpcs.map((call) => call.name)).toEqual(["save_articles_batch"]);
    const items = (rpcs[0].args as { p_items: Array<{ title: string; status: string; author_id: string; category_id: string }> }).p_items;
    expect(items.map((item) => item.title)).toEqual(["Batch story number 1", "Batch story number 2"]);
    expect(items.every((item) => item.status === "draft" && item.author_id === authorId && item.category_id === "c1")).toBe(true);
  });

  it("surfaces a database failure from the batch function and tries no other write", async () => {
    const { client, calls } = recordingClient({ save_articles_batch: { error: { message: "Item 3: duplicate key value" } } });
    const repository = new SupabaseEditorialRepository(client, { audience: "editorial", authorId });
    await expect(repository.saveMany([draft(1), draft(2), draft(3)])).rejects.toThrow("Item 3: duplicate key value");
    expect(calls.filter((call) => call.kind === "rpc").map((call) => call.name)).toEqual(["save_articles_batch"]);
  });

  it.each([
    ["publish_articles_batch", (r: SupabaseEditorialRepository) => r.setPublished([articleId], true), { p_ids: [articleId], p_published: true }],
    ["publish_articles_batch", (r: SupabaseEditorialRepository) => r.setPublished([articleId], false), { p_ids: [articleId], p_published: false }],
    ["delete_articles_batch", (r: SupabaseEditorialRepository) => r.deleteMany([articleId]), { p_ids: [articleId] }],
    ["delete_categories_batch", (r: SupabaseEditorialRepository) => r.deleteCategories(["a", "b"]), { p_keys: ["a", "b"] }],
    ["delete_entities_batch", (r: SupabaseEditorialRepository) => r.deleteEntities(["a", "b"]), { p_slugs: ["a", "b"] }],
  ])("%s is one rpc, and its error reaches the caller", async (name, run, args) => {
    const { client, calls } = recordingClient({ [name]: { error: { message: "boom" } } });
    await expect(run(new SupabaseEditorialRepository(client, { audience: "editorial", authorId }))).rejects.toThrow("boom");
    expect(calls).toEqual([{ kind: "rpc", name, args }]);
  });

  it("creates and updates categories and entities with one rpc each, passing the complete values", async () => {
    const { client, calls } = recordingClient({});
    const repository = new SupabaseEditorialRepository(client, { audience: "editorial", authorId });
    const category = { translationKey: "k", position: 1, translations: { en: { slug: "k", name: "Kay", description: "" } } };
    const entity = { kind: "company" as const, slug: "e", name: "Eee", officialUrl: null, parentSlug: null, descriptions: { en: "Text." } };
    await repository.createCategories([category]).catch(() => undefined);
    await repository.updateCategories([category]).catch(() => undefined);
    await repository.createEntities([entity]).catch(() => undefined);
    await repository.updateEntities([entity]).catch(() => undefined);

    const rpcs = calls.filter((call) => call.kind === "rpc");
    expect(rpcs.map((call) => call.name)).toEqual(["create_categories_batch", "update_categories_batch", "create_entities_batch", "update_entities_batch"]);
    expect(rpcs[0].args).toEqual({ p_items: [{ translation_key: "k", position: 1, translations: category.translations }] });
    expect(rpcs[2].args).toEqual({ p_items: [{ kind: "company", slug: "e", name: "Eee", official_url: null, parent_slug: null, descriptions: { en: "Text." } }] });
  });
});
