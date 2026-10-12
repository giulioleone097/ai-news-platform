import {
  currentCoverImage,
  orderEntityRefs,
  type Article,
  type ArticleStatus,
  type ClaimStatus,
  type SocialChannel,
} from "@atlasnews/core/editorial/domain/article";
import type { EntityKind, EntityRecord } from "@atlasnews/core/editorial/domain/entity";
import type { DistributionPublication } from "@atlasnews/core/editorial/domain/editorial-operations";
import { batchLimit } from "@atlasnews/core/editorial/domain/errors";
import type { Locale } from "@atlasnews/core/locale";
import type { D1Database } from "../../sites/cloudflare";

/** The SQL of the D1 editorial adapters: row shapes, query fragments, mappers and the small builders they share. */

export interface ArticleRow {
  id: string;
  translation_key: string;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image: string;
  cover_alt: string;
  status: ArticleStatus;
  featured: number;
  reading_minutes: number;
  published_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
  claim_status: ClaimStatus;
  key_points: string;
  sources: string;
  category_id: string;
  category_translation_key: string;
  category_locale: Locale;
  category_slug: string;
  category_name: string;
  category_description: string;
  author_id: string;
  author_name: string;
  author_role: string;
  author_initials: string;
  author_avatar_url: string | null;
  entities: string;
  distribution: string;
}

export interface EntityRow {
  id: string;
  kind: EntityKind;
  slug: string;
  name: string;
  official_url: string | null;
  parent_slug: string | null;
  parent_name: string | null;
  descriptions: string;
  story_count?: number;
}

export interface PublicationRow {
  id: string;
  channel: SocialChannel;
  status: DistributionPublication["status"];
  message: string | null;
  external_url: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  updated_at: string;
  article_id: string;
  article_locale: Locale;
  article_slug: string;
  article_title: string;
}

/** Entities and distribution channels travel as JSON aggregates, so one query reads an article with all it links. */
export const articleSelect = (distribution: string) => `
  SELECT a.id, a.translation_key, a.locale, a.slug, a.title, a.excerpt, a.content, a.cover_image, a.cover_alt,
    a.status, a.featured, a.reading_minutes, a.published_at, a.scheduled_for, a.created_at, a.updated_at,
    a.claim_status, a.key_points, a.sources,
    c.id AS category_id, c.translation_key AS category_translation_key, c.locale AS category_locale,
    c.slug AS category_slug, c.name AS category_name, c.description AS category_description,
    u.id AS author_id, u.name AS author_name, u.role AS author_role, u.initials AS author_initials,
    u.avatar_url AS author_avatar_url,
    (SELECT json_group_array(json_object('kind', e.kind, 'slug', e.slug, 'name', e.name, 'isPrimary', l.is_primary))
       FROM article_entities l JOIN entities e ON e.id = l.entity_id WHERE l.article_id = a.id) AS entities,
    ${distribution} AS distribution
  FROM articles a
  JOIN categories c ON c.id = a.category_id
  JOIN authors u ON u.id = a.author_id`;

export const editorialDistribution = "(SELECT json_group_array(channel) FROM (SELECT channel FROM social_publications WHERE article_id = a.id ORDER BY rowid))";

export const entitySelect = (extra = "") => `
  SELECT e.id, e.kind, e.slug, e.name, e.official_url, p.slug AS parent_slug, p.name AS parent_name,
    (SELECT json_group_array(json_object('locale', d.locale, 'description', d.description))
       FROM entity_descriptions d WHERE d.entity_id = e.id) AS descriptions${extra}
  FROM entities e LEFT JOIN entities p ON p.id = e.parent_id`;

export const publicationSelect = `
  SELECT s.id, s.channel, s.status, s.message, s.external_url, s.scheduled_for, s.published_at, s.updated_at,
    a.id AS article_id, a.locale AS article_locale, a.slug AS article_slug, a.title AS article_title
  FROM social_publications s JOIN articles a ON a.id = s.article_id`;

export const jsonList = (values: readonly unknown[]) => JSON.stringify(values);
export const inList = "IN (SELECT value FROM json_each(?))";
/** True for the statements that follow an article write once that write has applied (its `updated_at` is this batch's). */
export const articleApplied = "EXISTS (SELECT 1 FROM articles WHERE id = ? AND updated_at = ?)";

export function mapArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    translationKey: row.translation_key,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverImage: currentCoverImage(row.cover_image),
    coverAlt: row.cover_alt,
    status: row.status,
    featured: row.featured === 1,
    readingMinutes: row.reading_minutes,
    publishedAt: row.published_at,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: {
      id: row.category_id,
      translationKey: row.category_translation_key,
      locale: row.category_locale,
      slug: row.category_slug,
      name: row.category_name,
      description: row.category_description,
    },
    author: {
      id: row.author_id,
      name: row.author_name,
      role: row.author_role,
      initials: row.author_initials,
      avatarUrl: row.author_avatar_url ?? undefined,
    },
    distribution: JSON.parse(row.distribution),
    claimStatus: row.claim_status,
    keyPoints: JSON.parse(row.key_points),
    sources: JSON.parse(row.sources),
    entities: orderEntityRefs(
      (JSON.parse(row.entities) as Array<{ kind: EntityKind; slug: string; name: string; isPrimary: number }>)
        .map((link) => ({ ...link, isPrimary: link.isPrimary === 1 })),
    ),
  };
}

export function mapEntity(row: EntityRow): EntityRecord {
  const descriptions = JSON.parse(row.descriptions) as Array<{ locale: Locale; description: string }>;
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    officialUrl: row.official_url,
    parent: row.parent_slug && row.parent_name ? { slug: row.parent_slug, name: row.parent_name } : null,
    descriptions: Object.fromEntries(descriptions.map((item) => [item.locale, item.description])),
  };
}

export function mapPublication(row: PublicationRow): DistributionPublication {
  return {
    id: row.id,
    articleId: row.article_id,
    articleLocale: row.article_locale,
    articleSlug: row.article_slug,
    articleTitle: row.article_title,
    channel: row.channel,
    status: row.status,
    message: row.message ?? "",
    externalUrl: row.external_url,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/** The ISO form that sorts as text; Postgres normalized timestamptz input the same way. */
export function toTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error(`Invalid timestamp ${value}`);
  return new Date(time).toISOString();
}

/** The SQL conditions of one query and the values they bind, in order. */
export class Where {
  private readonly clauses: string[] = [];
  readonly binds: unknown[] = [];

  add(clause: string, ...binds: unknown[]) {
    this.clauses.push(`(${clause})`);
    this.binds.push(...binds);
    return this;
  }

  get sql() {
    return this.clauses.length ? `WHERE ${this.clauses.join(" AND ")}` : "";
  }
}

/**
 * A websearch-style text (words, "exact phrases", -excluded, a or b) as an FTS5 query, or null when it has no
 * words. Words match by prefix, which stands in for the stemming that Postgres applied.
 */
export function toFtsQuery(text: string) {
  const parts: string[] = [];
  const excluded: string[] = [];
  for (const [, minus, phrase, word] of text.matchAll(/(-?)(?:"([^"]*)"|([^\s"]+))/g)) {
    if (!minus && phrase === undefined && word.toLowerCase() === "or" && parts.length && parts.at(-1) !== "OR") {
      parts.push("OR");
      continue;
    }
    const words = (phrase ?? word).match(/[\p{L}\p{N}]+/gu) ?? [];
    if (!words.length) continue;
    const term = phrase === undefined ? words.map((item) => `"${item}"*`).join(" ") : `"${words.join(" ")}"`;
    if (minus) excluded.push(term);
    else parts.push(term);
  }
  if (parts.at(-1) === "OR") parts.pop();
  if (!parts.length) return null;
  return excluded.length ? `(${parts.join(" ")}) NOT (${excluded.join(" OR ")})` : parts.join(" ");
}

export function insertInto(database: D1Database, table: string, record: Record<string, unknown>) {
  const columns = Object.keys(record);
  return database
    .prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .bind(...Object.values(record));
}

export function assertBatchSize(count: number) {
  if (count < 1 || count > batchLimit) throw new Error(`A batch holds between 1 and ${batchLimit} items`);
}

/** Errors that name the item of a batch, like the Postgres batch functions' "Item <n>: <message>". */
export function itemError(context: string, index: number, message: string) {
  return new Error(`${context}: Item ${index + 1}: ${message}`);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** The reconciliation of an article's distribution channels with the desired set; published ones stay. */
export function distributionStatements(database: D1Database, articleId: string, channels: SocialChannel[], timestamp: string, gated: boolean) {
  const gate = gated ? ` AND ${articleApplied}` : "";
  const gateBinds = gated ? [articleId, timestamp] : [];
  return [
    database
      .prepare(
        `DELETE FROM social_publications WHERE article_id = ? AND status <> 'published' AND channel NOT ${inList}${gate}`,
      )
      .bind(articleId, jsonList(channels), ...gateBinds),
    ...[...new Set(channels)].map((channel) =>
      database
        .prepare(
          `INSERT INTO social_publications (id, article_id, channel, status, created_at, updated_at)
           SELECT ?, ?, ?, 'ready', ?, ? WHERE 1 = 1${gate} ON CONFLICT (article_id, channel) DO NOTHING`,
        )
        .bind(crypto.randomUUID(), articleId, channel, timestamp, timestamp, ...gateBinds),
    ),
  ];
}
