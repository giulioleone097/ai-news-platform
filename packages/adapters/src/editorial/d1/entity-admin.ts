import type { EntityAdminRepository, EntityWrite } from "@atlasnews/core/editorial/domain/entity";
import { D1EditorialAccess } from "./access";
import { assertBatchSize, entitySelect, inList, insertInto, itemError, jsonList, mapEntity, type EntityRow } from "./sql";

/** The entities as editors manage them. */
export class D1EntityAdminRepository extends D1EditorialAccess implements EntityAdminRepository {
  async listEntityRecords() {
    return (await this.rows<EntityRow>(`${entitySelect()} ORDER BY e.name COLLATE NOCASE, e.slug`)).map(mapEntity);
  }

  private async entityRecords(slugs: string[]) {
    const rows = await this.rows<EntityRow>(`${entitySelect()} WHERE e.slug ${inList}`, jsonList(slugs));
    const bySlug = new Map(rows.map(mapEntity).map((record) => [record.slug, record]));
    return slugs.map((slug) => {
      const record = bySlug.get(slug);
      if (!record) throw new Error("Saved entity could not be read back");
      return record;
    });
  }

  /**
   * One entity per item, in order. The parent is looked up when its item is written, so it may be an
   * earlier item of the same batch (`create`); an unknown parent is refused before anything is written.
   */
  private async writeEntities(items: EntityWrite[], create: boolean, context: string) {
    this.assertEditorial();
    assertBatchSize(items.length);
    const stored = new Set(
      (await this.rows<{ slug: string }>(
        `SELECT slug FROM entities WHERE slug ${inList}`,
        jsonList([...items.map((item) => item.slug), ...items.flatMap((item) => (item.parentSlug ? [item.parentSlug] : []))]),
      )).map((row) => row.slug),
    );
    const timestamp = new Date().toISOString();
    const statements = items.flatMap((item, index) => {
      if (item.parentSlug && !stored.has(item.parentSlug)) {
        throw itemError(context, index, `Unknown parent entity ${item.parentSlug}`);
      }
      const parent = "(SELECT id FROM entities WHERE slug = ?)";
      const descriptions = Object.entries(item.descriptions);
      if (create) {
        const id = crypto.randomUUID();
        stored.add(item.slug);
        return [
          this.database
            .prepare(
              `INSERT INTO entities (id, kind, slug, name, official_url, parent_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ${parent}, ?, ?)`,
            )
            .bind(id, item.kind, item.slug, item.name, item.officialUrl, item.parentSlug, timestamp, timestamp),
          ...descriptions.map(([locale, description]) =>
            insertInto(this.database, "entity_descriptions", { entity_id: id, locale, description }),
          ),
        ];
      }
      if (!stored.has(item.slug)) throw itemError(context, index, `Entity "${item.slug}" not found`);
      return [
        this.database
          .prepare(`UPDATE entities SET kind = ?, name = ?, official_url = ?, parent_id = ${parent}, updated_at = ? WHERE slug = ?`)
          .bind(item.kind, item.name, item.officialUrl, item.parentSlug, timestamp, item.slug),
        // A locale absent from the item loses its description.
        this.database
          .prepare(
            `DELETE FROM entity_descriptions WHERE locale NOT ${inList} AND entity_id = (SELECT id FROM entities WHERE slug = ?)`,
          )
          .bind(jsonList(descriptions.map(([locale]) => locale)), item.slug),
        ...descriptions.map(([locale, description]) =>
          this.database
            .prepare(
              `INSERT INTO entity_descriptions (entity_id, locale, description) SELECT id, ?, ? FROM entities WHERE slug = ?
               ON CONFLICT (entity_id, locale) DO UPDATE SET description = excluded.description`,
            )
            .bind(locale, description, item.slug),
        ),
      ];
    });
    await this.batch(context, statements);
    return this.entityRecords(items.map((item) => item.slug));
  }

  async createEntities(items: EntityWrite[]) {
    return this.writeEntities(items, true, "Unable to create entities");
  }

  async updateEntities(items: EntityWrite[]) {
    return this.writeEntities(items, false, "Unable to update entities");
  }

  async deleteEntities(slugs: string[]) {
    this.assertEditorial();
    const context = "Unable to delete entities";
    assertBatchSize(slugs.length);
    const rows = await this.rows<{ slug: string; stories: number; children: string }>(
      `SELECT e.slug, (SELECT count(*) FROM article_entities WHERE entity_id = e.id) AS stories,
         (SELECT json_group_array(c.slug) FROM entities c WHERE c.parent_id = e.id) AS children
       FROM entities e WHERE e.slug ${inList}`,
      jsonList(slugs),
    );
    const info = new Map(rows.map((row) => [row.slug, row]));
    // Items are removed in order, so a company may follow its own models and products in one batch.
    const removed = new Set<string>();
    slugs.forEach((slug, index) => {
      const row = info.get(slug);
      if (!row || removed.has(slug)) throw itemError(context, index, `Entity "${slug}" not found`);
      if (row.stories > 0) throw itemError(context, index, `Entity "${slug}" is linked to ${row.stories} stories`);
      const children = (JSON.parse(row.children) as string[]).filter((child) => !removed.has(child));
      if (children.length) {
        throw itemError(context, index, `Entity "${slug}" is the parent of ${children.length} entities`);
      }
      removed.add(slug);
    });
    await this.batch(
      context,
      slugs.map((slug) => this.database.prepare("DELETE FROM entities WHERE slug = ?").bind(slug)),
    );
  }

  async countEntityStories(slugs: string[]) {
    const editorial = this.options.audience === "editorial";
    const rows = await this.rows<{ slug: string; total: number }>(
      `SELECT e.slug, count(a.id) AS total
       FROM entities e
       LEFT JOIN article_entities l ON l.entity_id = e.id
       LEFT JOIN articles a ON a.id = l.article_id${editorial ? "" : " AND a.status = 'published' AND a.published_at <= ?"}
       WHERE e.slug ${inList} GROUP BY e.slug`,
      ...(editorial ? [] : [new Date().toISOString()]),
      jsonList(slugs),
    );
    const totals = new Map(rows.map((row) => [row.slug, row.total]));
    return new Map(slugs.map((slug) => [slug, totals.get(slug) ?? 0]));
  }
}
