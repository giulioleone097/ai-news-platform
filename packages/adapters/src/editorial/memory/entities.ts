import type {
  EntityDetail,
  EntityKind,
  EntityRepository,
  EntitySummary,
  EntityTimelineItem,
} from "@atlasnews/core/editorial/domain/entity";
import type { Locale } from "@atlasnews/core/locale";
import type { MemoryEditorialStore, StoredEntity } from "./store";

/** What the site shows of the entities: the list, one entity and its published timeline. */
export class MemoryEntityRepository implements EntityRepository {
  constructor(private readonly store: MemoryEditorialStore) {}

  private publishedStories(slug: string, locale: Locale) {
    return this.store.articles
      .filter(
        (article) =>
          article.locale === locale
          && article.status === "published"
          && article.publishedAt
          && article.entities.some((entity) => entity.slug === slug),
      )
      .sort((left, right) => (left.publishedAt ?? "").localeCompare(right.publishedAt ?? "") || left.id.localeCompare(right.id));
  }

  private toEntityDetail(entity: StoredEntity, locale: Locale): EntityDetail {
    const parent = entity.parent ? this.store.entities.get(entity.parent) : undefined;
    return {
      id: entity.id,
      kind: entity.kind,
      slug: entity.slug,
      name: entity.name,
      officialUrl: entity.officialUrl,
      parent: parent ? { slug: parent.slug, name: parent.name } : null,
      description: entity.description[locale] ?? "",
    };
  }

  async listEntities(locale: Locale, kind?: EntityKind): Promise<EntitySummary[]> {
    return [...this.store.entities.values()]
      .filter((entity) => !kind || entity.kind === kind)
      .map((entity) => ({
        ...this.toEntityDetail(entity, locale),
        storyCount: this.publishedStories(entity.slug, locale).length,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async findEntityBySlug(slug: string, locale: Locale) {
    const entity = this.store.entities.get(slug);
    return entity ? this.toEntityDetail(entity, locale) : null;
  }

  async listEntityTimeline(slug: string, locale: Locale): Promise<EntityTimelineItem[]> {
    return this.publishedStories(slug, locale).map((article) => ({
      slug: article.slug,
      title: article.title,
      claimStatus: article.claimStatus,
      publishedAt: article.publishedAt ?? "",
    }));
  }
}
