import type { DistributionRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { DistributionUpdate } from "@atlasnews/core/editorial/domain/editorial-operations";
import type { Locale } from "@atlasnews/core/locale";
import type { MemoryEditorialStore } from "./store";

/** The social publications of the demo articles. */
export class MemoryDistributionRepository implements DistributionRepository {
  constructor(private readonly store: MemoryEditorialStore) {}

  async listPublications(locale: Locale) {
    return structuredClone(
      [...this.store.publications.values()]
        .filter((publication) => publication.articleLocale === locale)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
  }

  async updatePublication(input: DistributionUpdate) {
    const publication = this.store.publications.get(input.id);
    if (!publication) throw new Error("Distribution publication not found");
    publication.status = input.status;
    publication.message = input.message?.trim() ?? publication.message;
    publication.externalUrl = input.externalUrl ?? null;
    publication.scheduledFor = input.scheduledFor ?? null;
    publication.publishedAt = input.status === "published"
      ? publication.publishedAt ?? new Date().toISOString()
      : null;
    publication.updatedAt = new Date().toISOString();
    return structuredClone(publication);
  }
}
