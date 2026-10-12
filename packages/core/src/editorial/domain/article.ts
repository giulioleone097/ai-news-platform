import type { Locale } from "../../locale";
import type { EntityKind } from "./entity";
import { EditorialRuleError, type EditorialErrorCode } from "./errors";

export const articleStatuses = [
  "draft",
  "review",
  "scheduled",
  "published",
] as const;

/**
 * The statuses that creating or patching may set: the ones the public cannot see. `published` is
 * reached and left only through publishing and unpublishing, which are their own use cases.
 */
export const draftStatuses = ["draft", "review", "scheduled"] as const;

export const socialChannels = ["newsletter", "linkedin", "x", "whatsapp"] as const;

/** How firmly a story stands: a reader asks "is this confirmed or a rumour?". */
export const claimStatuses = [
  "confirmed",
  "rollout",
  "test",
  "rumour",
  "analysis",
] as const;

export type ArticleStatus = (typeof articleStatuses)[number];
export type DraftStatus = (typeof draftStatuses)[number];
export type SocialChannel = (typeof socialChannels)[number];
export type ClaimStatus = (typeof claimStatuses)[number];

/** A source and the claim of the story that it backs. */
export interface SourceNote {
  title: string;
  url: string;
  supports: string;
}

/** An entity as shown on a story. */
export interface EntityRef {
  kind: EntityKind;
  slug: string;
  name: string;
  isPrimary: boolean;
}

/** An entity as chosen by an editor. */
export interface EntityLink {
  slug: string;
  isPrimary: boolean;
}

/** How long the text fields of an article may be: core checks them, the capability schemas and the Studio form read them. */
export const articleLimits = {
  title: { min: 8, max: 180 },
  excerpt: { min: 20, max: 360 },
  content: { min: 20, max: 100_000 },
  slug: { max: 96 },
  coverAlt: { min: 3, max: 240 },
} as const;

/** The cover of an article that has none of its own: the image bundled with the site (`apps/web/public/media`). */
export const defaultCoverImage = "/media/neura-agents-hero.webp";

export const storyLimits = {
  keyPoints: { count: 3, min: 3, max: 140 },
  sources: { count: 10, titleMin: 3, titleMax: 160, supportsMin: 3, supportsMax: 240, urlMax: 2048 },
  entities: { count: 8 },
} as const;

export interface Category {
  id: string;
  translationKey: string;
  locale: Locale;
  slug: string;
  name: string;
  description: string;
}

export interface Author {
  id: string;
  name: string;
  role: string;
  initials: string;
  avatarUrl?: string;
}

export interface Article {
  id: string;
  translationKey: string;
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  coverAlt: string;
  status: ArticleStatus;
  category: Category;
  author: Author;
  featured: boolean;
  readingMinutes: number;
  publishedAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  distribution: SocialChannel[];
  claimStatus: ClaimStatus;
  /** Up to three short lines shown before the body. */
  keyPoints: string[];
  sources: SourceNote[];
  /** The primary entity first, then the others by name. */
  entities: EntityRef[];
}

export interface ArticleDraftInput {
  id?: string;
  translationKey?: string;
  locale: Locale;
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  categorySlug: string;
  status: ArticleStatus;
  featured?: boolean;
  coverImage?: string;
  coverAlt?: string;
  scheduledFor?: string | null;
  distribution?: SocialChannel[];
  /** The story fields keep their stored value when omitted; a new story starts as "analysis". */
  claimStatus?: ClaimStatus;
  keyPoints?: string[];
  sources?: SourceNote[];
  entities?: Array<{ slug: string; isPrimary?: boolean }>;
}

/**
 * A new story. It cannot be published on creation; `status` defaults to `draft`.
 * `translationOf` is the slug of the same story in the other language: the new article joins its translation group.
 */
export type ArticleCreate = Omit<ArticleDraftInput, "id" | "status"> & {
  status?: DraftStatus;
  translationOf?: string;
};

/**
 * A partial update: every field is optional and an omitted one keeps its stored value. What an
 * explicit value clears: `scheduledFor: null` drops the date, and an empty `distribution`,
 * `keyPoints`, `sources` or `entities` list empties it. Title, slug, excerpt, content, category,
 * cover and claim status are required on a story, so they can be replaced but not cleared.
 * The status can move between the draft statuses only; publishing is a separate use case.
 */
export type ArticlePatch = Partial<Omit<ArticleDraftInput, "id" | "locale" | "translationKey" | "status">>
  & {
    status?: DraftStatus;
    /** The slug of the same story in the other language; `null` unlinks the two. */
    translationOf?: string | null;
  };

/** The filters of the editor's article list; all optional. */
export interface StudioArticleFilter {
  status?: ArticleStatus;
  /** Category slug in the listed locale. */
  category?: string;
  /** Entity slug. */
  entity?: string;
  claimStatus?: ClaimStatus;
  /** Words in the title, excerpt or body. */
  query?: string;
}

export interface ArticleCursor {
  publishedAt: string;
  id: string;
}

export interface ArticlePage {
  items: Article[];
  nextCursor: ArticleCursor | null;
}

export interface ArticleQuery {
  locale: Locale;
  limit?: number;
  category?: string;
  /** Entity slug. */
  entity?: string;
  claimStatus?: ClaimStatus;
  query?: string;
  cursor?: ArticleCursor;
}

/** What an editor sees in the form: the stored story as a draft input, ready to be changed and saved again. */
export function articleToDraft(article: Article): ArticleDraftInput {
  return {
    id: article.id,
    translationKey: article.translationKey,
    locale: article.locale,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: article.content,
    categorySlug: article.category.slug,
    status: article.status,
    featured: article.featured,
    coverImage: article.coverImage,
    coverAlt: article.coverAlt,
    scheduledFor: article.scheduledFor,
    distribution: [...article.distribution],
    claimStatus: article.claimStatus,
    keyPoints: [...article.keyPoints],
    sources: article.sources.map((source) => ({ ...source })),
    entities: article.entities.map(({ slug, isPrimary }) => ({ slug, isPrimary })),
  };
}

/** Lowercase kebab-case slug shared by articles and categories. */
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, articleLimits.slug.max);
}

export function estimateReadingMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 210));
}

export function formatArticleStatus(status: ArticleStatus, locale: Locale) {
  const labels: Record<Locale, Record<ArticleStatus, string>> = {
    en: {
      draft: "Draft",
      review: "In review",
      scheduled: "Scheduled",
      published: "Published",
    },
    it: {
      draft: "Bozza",
      review: "In revisione",
      scheduled: "Programmato",
      published: "Pubblicato",
    },
  };
  return labels[locale][status];
}

/** The primary entity first, then the others by name. */
export function orderEntityRefs(entities: EntityRef[]) {
  return [...entities].sort(
    (left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.name.localeCompare(right.name),
  );
}

export type StoryField = "claimStatus" | "keyPoints" | "sources" | "entities";

const storyFieldMessages: Record<StoryField, string> = {
  claimStatus: "Invalid claim status",
  keyPoints: "Invalid key points",
  sources: "Invalid sources",
  entities: "Invalid entities",
};

const storyFieldCodes = {
  claimStatus: "article.invalidClaimStatus",
  keyPoints: "article.invalidKeyPoints",
  sources: "article.invalidSources",
  entities: "article.invalidEntities",
} as const satisfies Record<StoryField, EditorialErrorCode>;

/** Names the invalid story field so that a form can mark it. */
export class StoryFieldError extends EditorialRuleError {
  override readonly name = "StoryFieldError";

  constructor(readonly field: StoryField) {
    super(storyFieldMessages[field], storyFieldCodes[field]);
  }
}

export interface StoryFields {
  claimStatus?: ClaimStatus;
  keyPoints?: string[];
  sources?: SourceNote[];
  entities?: EntityLink[];
}

/** https only, no credentials: sources are read by people and fetched by agents. */
function isSourceUrl(value: string) {
  if (value.length > storyLimits.sources.urlMax || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname !== "";
  } catch {
    return false;
  }
}

function inRange(value: string, min: number, max: number) {
  return value.length >= min && value.length <= max;
}

/**
 * Validates the story fields of a draft and returns them trimmed. Absent fields stay absent
 * so that the repository keeps their stored value. Exactly one linked entity ends up primary:
 * the one marked, or the first when none is.
 */
export function normalizeStoryFields(input: {
  claimStatus?: ClaimStatus;
  keyPoints?: string[];
  sources?: SourceNote[];
  entities?: Array<{ slug: string; isPrimary?: boolean }>;
}): StoryFields {
  const result: StoryFields = {};

  if (input.claimStatus !== undefined) {
    if (!claimStatuses.includes(input.claimStatus)) throw new StoryFieldError("claimStatus");
    result.claimStatus = input.claimStatus;
  }

  if (input.keyPoints) {
    const { count, min, max } = storyLimits.keyPoints;
    const points = input.keyPoints.map((point) => point.trim());
    if (points.length > count || points.some((point) => !inRange(point, min, max))) {
      throw new StoryFieldError("keyPoints");
    }
    result.keyPoints = points;
  }

  if (input.sources) {
    const limits = storyLimits.sources;
    if (input.sources.length > limits.count) throw new StoryFieldError("sources");
    result.sources = input.sources.map((source) => {
      const note = {
        title: source.title.trim(),
        url: source.url.trim(),
        supports: source.supports.trim(),
      };
      if (
        !inRange(note.title, limits.titleMin, limits.titleMax)
        || !inRange(note.supports, limits.supportsMin, limits.supportsMax)
        || !isSourceUrl(note.url)
      ) {
        throw new StoryFieldError("sources");
      }
      return note;
    });
  }

  if (input.entities) {
    const links = input.entities.map((link) => ({ slug: link.slug.trim(), isPrimary: Boolean(link.isPrimary) }));
    if (
      links.length > storyLimits.entities.count
      || links.some((link) => !slugPattern.test(link.slug))
      || new Set(links.map((link) => link.slug)).size !== links.length
      || links.filter((link) => link.isPrimary).length > 1
    ) {
      throw new StoryFieldError("entities");
    }
    if (links.length && !links.some((link) => link.isPrimary)) links[0].isPrimary = true;
    result.entities = links;
  }

  return result;
}
