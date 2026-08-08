import { describe, expect, it } from "vitest";
import { MemoryEditorialRepository } from "./memory-editorial-repository";

describe("MemoryEditorialRepository", () => {
  it("only returns published articles to public queries", async () => {
    const repository = new MemoryEditorialRepository();
    const page = await repository.listPublished({ limit: 50 });

    expect(page.items.length).toBeGreaterThan(5);
    expect(page.items.every((article) => article.status === "published")).toBe(true);
  });

  it("filters public articles by category and text", async () => {
    const repository = new MemoryEditorialRepository();
    const page = await repository.listPublished({ category: "policy", query: "regole" });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].category.slug).toBe("policy");
  });

  it("creates and updates an editorial draft", async () => {
    const repository = new MemoryEditorialRepository();
    const created = await repository.save({
      title: "Una prova editoriale",
      excerpt: "Descrizione",
      content: "Testo del pezzo",
      categorySlug: "ricerca",
      status: "draft",
    });
    const updated = await repository.save({
      id: created.id,
      title: "Una prova pubblicata",
      excerpt: "Descrizione aggiornata",
      content: "Testo aggiornato",
      categorySlug: "ricerca",
      status: "published",
    });

    expect(updated.slug).toBe("una-prova-pubblicata");
    expect(updated.publishedAt).not.toBeNull();
  });
});
