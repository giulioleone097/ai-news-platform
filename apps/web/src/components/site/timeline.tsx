import Link from "next/link";
import { localizedPath, type Locale } from "@atlasnews/core/locale";
import type { EntityTimelineItem } from "@atlasnews/core/editorial/domain/entity";
import { ClaimChip } from "./claim-chip";
import { formatDate } from "./feed-format";
import type { StatusLabels } from "./feed-row";

/** An entity's stories from oldest to newest: a reader sees a rumour become a release. */
export function Timeline({
  items,
  locale,
  statusLabels,
  currentSlug,
  currentLabel,
}: {
  items: EntityTimelineItem[];
  locale: Locale;
  statusLabels: StatusLabels;
  /** The story being read, shown as text and marked instead of linked. */
  currentSlug?: string;
  currentLabel?: string;
}) {
  return (
    <ol className="timeline">
      {items.map((item) => {
        const current = item.slug === currentSlug;
        return (
          <li className="timeline__item" aria-current={current ? "true" : undefined} key={item.slug}>
            <time dateTime={item.publishedAt}>{formatDate(item.publishedAt, locale)}</time>
            <ClaimChip status={item.claimStatus} label={statusLabels[item.claimStatus]} />
            {current ? (
              <span className="timeline__title">
                {item.title}
                <span className="timeline__here">{currentLabel}</span>
              </span>
            ) : (
              <Link className="timeline__title" href={localizedPath(`/articles/${item.slug}`, locale)} prefetch={false}>
                {item.title}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
