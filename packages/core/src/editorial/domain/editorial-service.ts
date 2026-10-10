import type { Article, ArticleCursor, Category } from "./article";
import type { ArticleRepository } from "./article-repository";
import type { EntityKind, EntitySummary } from "./entity";
import type { Locale } from "../../locale";

/** Stories on the first load of the home feed, and on every later page of any feed. */
export const feedPageSize = 20;

export interface DayGroup<T> {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  items: T[];
}

export interface HomeFeed {
  /** The static lead: the featured story, else the newest. Null while nothing is published. */
  lead: Article | null;
  /** The newest stories after the lead, newest first, grouped by UTC day. */
  days: DayGroup<Article>[];
  /** Opaque position of the next older story; null at the end of the feed. */
  nextCursor: ArticleCursor | null;
  /** When the feed last changed: the latest update among the stories it shows. */
  updatedAt: string | null;
  categories: Category[];
}

/** Groups items that are already sorted by date into consecutive UTC days. */
export function groupByDay<T extends { publishedAt: string | null }>(items: T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    if (!item.publishedAt) continue;
    const date = item.publishedAt.slice(0, 10);
    const last = groups.at(-1);
    if (last?.date === date) last.items.push(item);
    else groups.push({ date, items: [item] });
  }
  return groups;
}

const kindOrder: Record<EntityKind, number> = { product: 0, model: 1, company: 2 };

/** Most stories first; on a tie products come before models and models before companies. */
export function rankEntities<T extends Pick<EntitySummary, "storyCount" | "kind" | "name">>(entities: T[]): T[] {
  return [...entities].sort(
    (left, right) =>
      right.storyCount - left.storyCount
      || kindOrder[left.kind] - kindOrder[right.kind]
      || left.name.localeCompare(right.name),
  );
}

export async function getHomeFeed(
  repository: ArticleRepository,
  locale: Locale,
): Promise<HomeFeed> {
  // One extra story: the lead is taken out of the dated stream, which still shows a full page.
  const [page, categories] = await Promise.all([
    repository.listPublished({ locale, limit: feedPageSize + 1 }),
    repository.listCategories(locale),
  ]);

  const lead = page.items.find((article) => article.featured) ?? page.items[0] ?? null;
  const rest = page.items.filter((article) => article.id !== lead?.id);
  const latestUpdate = page.items
    .map((article) => article.updatedAt)
    .reduce<string | null>((latest, value) => (!latest || value > latest ? value : latest), null);

  return {
    lead,
    days: groupByDay(rest),
    nextCursor: page.nextCursor,
    updatedAt: latestUpdate,
    categories,
  };
}
