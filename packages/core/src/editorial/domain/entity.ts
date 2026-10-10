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
