import { describe, expect, it } from "vitest";
import { MemoryEditorialRepository } from "../infrastructure/memory-editorial-repository";
import { ArticleCommandService } from "./article-commands";

describe("article command service", () => {
  it("enforces the canonical transport-independent draft limits", async () => {
    const service = new ArticleCommandService(new MemoryEditorialRepository());
    await expect(service.save({
      locale: "en",
      title: "Short",
      excerpt: "A sufficiently long excerpt for validation.",
      content: "A sufficiently long article body for validation.",
      categorySlug: "research",
      status: "draft",
    })).rejects.toThrow("Invalid article title");
  });

  it("rejects a scheduled story without a real publishing date", async () => {
    const service = new ArticleCommandService(new MemoryEditorialRepository());
    await expect(service.save({
      locale: "en",
      title: "A valid scheduled article title",
      excerpt: "A sufficiently long excerpt for validation.",
      content: "A sufficiently long article body for validation.",
      categorySlug: "research",
      status: "scheduled",
    })).rejects.toThrow("Scheduled articles require a valid date");
  });
});
