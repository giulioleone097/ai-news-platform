import type { EntityAdminRepository, EntityRecord, EntityWrite } from "@atlasnews/core/editorial/domain/entity";
import type { MemoryEditorialStore, StoredEntity } from "./store";

/** The entities as editors manage them. */
export class MemoryEntityAdminRepository implements EntityAdminRepository {
  constructor(private readonly store: MemoryEditorialStore) {}

  private entityRecord(entity: StoredEntity): EntityRecord {
    const parent = entity.parent ? this.store.entities.get(entity.parent) : undefined;
    return {
      id: entity.id,
      kind: entity.kind,
      slug: entity.slug,
      name: entity.name,
      officialUrl: entity.officialUrl,
      parent: parent ? { slug: parent.slug, name: parent.name } : null,
      descriptions: { ...entity.description },
    };
  }

  async listEntityRecords() {
    return [...this.store.entities.values()].map((entity) => this.entityRecord(entity));
  }

  private writeEntity(item: EntityWrite, create: boolean) {
    const existing = this.store.entities.get(item.slug);
    if (create === Boolean(existing)) throw new Error(`Entity ${item.slug} ${create ? "already exists" : "does not exist"}`);
    if (item.parentSlug && this.store.entities.get(item.parentSlug)?.kind !== "company") {
      throw new Error(`The parent of ${item.slug} must be a company`);
    }
    this.store.entities.set(item.slug, {
      id: existing?.id ?? crypto.randomUUID(),
      kind: item.kind,
      slug: item.slug,
      name: item.name,
      officialUrl: item.officialUrl,
      parent: item.parentSlug,
      description: { ...item.descriptions },
    });
    // Stories show the name and kind of the entities they link.
    for (const article of this.store.articles) {
      for (const link of article.entities) {
        if (link.slug === item.slug) Object.assign(link, { kind: item.kind, name: item.name });
      }
    }
  }

  async createEntities(items: EntityWrite[]) {
    return this.store.atomic(() => {
      for (const item of items) this.writeEntity(item, true);
      return items.map((item) => this.entityRecord(this.store.entities.get(item.slug)!));
    });
  }

  async updateEntities(items: EntityWrite[]) {
    return this.store.atomic(() => {
      for (const item of items) this.writeEntity(item, false);
      return items.map((item) => this.entityRecord(this.store.entities.get(item.slug)!));
    });
  }

  async deleteEntities(slugs: string[]) {
    await this.store.atomic(() => {
      for (const slug of slugs) {
        if (!this.store.entities.has(slug)) throw new Error(`Entity ${slug} not found`);
        if (this.store.articles.some((article) => article.entities.some((link) => link.slug === slug))) {
          throw new Error(`Entity ${slug} is linked to stories`);
        }
        if ([...this.store.entities.values()].some((other) => other.parent === slug)) {
          throw new Error(`Entity ${slug} is the parent of other entities`);
        }
        this.store.entities.delete(slug);
      }
    });
  }

  async countEntityStories(slugs: string[]) {
    return new Map(slugs.map((slug) => [
      slug,
      this.store.articles.filter((article) => article.entities.some((link) => link.slug === slug)).length,
    ]));
  }
}
