import type { ClaimStatus } from "./article";
import type { Locale } from "../../locale";

export const entityKinds = ["company", "model", "product"] as const;

export type EntityKind = (typeof entityKinds)[number];

export interface EntityParent {
  slug: string;
  name: string;
}

export interface Entity {
  id: string;
  kind: EntityKind;
  slug: string;
  name: string;
  /** The official page of the company, model or product. */
  officialUrl: string | null;
  /** The company of a model or a product. */
  parent: EntityParent | null;
}

/** An entity with the one line that describes it in a locale ("" when that locale has none). */
export interface EntityDetail extends Entity {
  description: string;
}

export interface EntitySummary extends EntityDetail {
  /** Published stories in the requested locale that link the entity. */
  storyCount: number;
}

/** One published story of an entity. */
export interface EntityTimelineItem {
  slug: string;
  title: string;
  claimStatus: ClaimStatus;
  publishedAt: string;
}

export interface EntityRepository {
  listEntities(locale: Locale, kind?: EntityKind): Promise<EntitySummary[]>;
  findEntityBySlug(slug: string, locale: Locale): Promise<EntityDetail | null>;
  /** The published stories of an entity in a locale, oldest first: "rumour → test → confirmed". */
  listEntityTimeline(slug: string, locale: Locale): Promise<EntityTimelineItem[]>;
}

export const entityLimits = {
  name: { min: 1, max: 120 },
  slug: { max: 96 },
  description: { min: 1, max: 280 },
  officialUrl: { max: 2_048 },
} as const;

/** An entity as an editor manages it: the row, its parent and one description per locale (absent = none). */
export interface EntityRecord extends Entity {
  descriptions: Partial<Record<Locale, string>>;
}

/** A new entity. The slug defaults to the slugified name. A company has no parent; a model or product may have a company. */
export interface EntityCreate {
  kind: EntityKind;
  name: string;
  slug?: string;
  officialUrl?: string | null;
  parentSlug?: string | null;
  descriptions?: Partial<Record<Locale, string>>;
}

/**
 * The slug names the entity and is never renamed (links and URLs depend on it). Omitted fields keep
 * their value. `null` clears `officialUrl`, `parentSlug` and a locale's description; name and kind cannot be cleared.
 */
export interface EntityPatch {
  slug: string;
  kind?: EntityKind;
  name?: string;
  officialUrl?: string | null;
  parentSlug?: string | null;
  descriptions?: Partial<Record<Locale, string | null>>;
}

/** What the repository writes: the complete entity; `descriptions` is the full set of locales that must exist. */
export interface EntityWrite {
  kind: EntityKind;
  slug: string;
  name: string;
  officialUrl: string | null;
  parentSlug: string | null;
  descriptions: Partial<Record<Locale, string>>;
}

export interface EntityAdminRepository {
  listEntityRecords(): Promise<EntityRecord[]>;
  /** One transaction: every entity is written, or none. Items are written in order, so a parent may come first in the same batch. */
  createEntities(items: EntityWrite[]): Promise<EntityRecord[]>;
  updateEntities(items: EntityWrite[]): Promise<EntityRecord[]>;
  deleteEntities(slugs: string[]): Promise<void>;
  /** Stories of any status and locale that link each entity. */
  countEntityStories(slugs: string[]): Promise<Map<string, number>>;
}
