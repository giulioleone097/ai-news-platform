import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import type { EntityTimelineItem } from "@atlasnews/core/editorial/domain/entity";
import { getMessages, type Locale } from "@/i18n";
import { getCachedEntityPage } from "@/lib/editorial-queries";
import { ClaimChip } from "./claim-chip";
import { formatShortDate } from "./feed-format";

export interface LatestClaim {
  claimStatus: ClaimStatus;
  publishedAt: string;
}

/** The newest story of an entity: its timeline is oldest first. */
export const latestClaim = (timeline: EntityTimelineItem[]): LatestClaim | null => timeline.at(-1) ?? null;

/** The latest claim of each entity, one cached lookup per entity, in the order given. */
export async function getLatestClaims(slugs: string[], locale: Locale) {
  const pages = await Promise.all(slugs.map((slug) => getCachedEntityPage(slug, locale)));
  return pages.map((page) => (page ? latestClaim(page.timeline) : null));
}

/** Where an entity stands: the status of its latest story, the day of it and, above zero, how many stories there are. */
export function EntityStatus({
  latest,
  count = 0,
  locale,
  className,
}: {
  latest: LatestClaim | null;
  count?: number;
  locale: Locale;
  className?: string;
}) {
  if (!latest) return null;
  const messages = getMessages(locale);

  return (
    <p className={className ? `story-meta ${className}` : "story-meta"}>
      <ClaimChip status={latest.claimStatus} label={messages.story.claimStatus[latest.claimStatus]} />
      <time dateTime={latest.publishedAt}>{formatShortDate(latest.publishedAt, locale)}</time>
      {count ? <span>{count} {count === 1 ? messages.entities.storyOne : messages.entities.storyMany}</span> : null}
    </p>
  );
}
