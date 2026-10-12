import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import type {
  EntityDetail,
  EntityKind,
  EntityRepository,
  EntitySummary,
  EntityTimelineItem,
} from "@atlasnews/core/editorial/domain/entity";
import type { Locale } from "@atlasnews/core/locale";
import { D1EditorialAccess } from "./access";
import { entitySelect, mapEntity, Where, type EntityRow } from "./sql";

/** What the site shows of the entities: the list, one entity and its published timeline. */
export class D1EntityRepository extends D1EditorialAccess implements EntityRepository {
  async listEntities(locale: Locale, kind?: EntityKind): Promise<EntitySummary[]> {
    const where = new Where();
    if (kind) where.add("e.kind = ?", kind);
    const rows = await this.rows<EntityRow>(
      `${entitySelect(`,
        (SELECT count(*) FROM article_entities l JOIN articles a ON a.id = l.article_id
          WHERE l.entity_id = e.id AND a.locale = ? AND a.status = 'published' AND a.published_at <= ?) AS story_count`)}
       ${where.sql} ORDER BY e.name COLLATE NOCASE, e.slug`,
      locale,
      new Date().toISOString(),
      ...where.binds,
    );
    return rows.map((row) => ({ ...this.toDetail(row, locale), storyCount: row.story_count ?? 0 }));
  }

  private toDetail(row: EntityRow, locale: Locale): EntityDetail {
    const { descriptions, ...entity } = mapEntity(row);
    return { ...entity, description: descriptions[locale] ?? "" };
  }

  async findEntityBySlug(slug: string, locale: Locale) {
    const [row] = await this.rows<EntityRow>(`${entitySelect()} WHERE e.slug = ?`, slug);
    return row ? this.toDetail(row, locale) : null;
  }

  async listEntityTimeline(slug: string, locale: Locale): Promise<EntityTimelineItem[]> {
    const rows = await this.rows<{ slug: string; title: string; claim_status: ClaimStatus; published_at: string }>(
      `SELECT a.slug, a.title, a.claim_status, a.published_at
       FROM articles a
       WHERE a.locale = ? AND a.status = 'published' AND a.published_at <= ?
         AND EXISTS (SELECT 1 FROM article_entities l JOIN entities e ON e.id = l.entity_id WHERE l.article_id = a.id AND e.slug = ?)
       ORDER BY a.published_at, a.id`,
      locale,
      new Date().toISOString(),
      slug,
    );
    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      claimStatus: row.claim_status,
      publishedAt: row.published_at,
    }));
  }
}
