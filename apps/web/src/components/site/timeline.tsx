import Link from "next/link";
import { localizedPath, type Locale } from "@atlasnews/core/locale";
import type { EntityTimelineItem } from "@atlasnews/core/editorial/domain/entity";
import { ClaimChip } from "./claim-chip";
import "./timeline.css";
import { formatDate, formatShortDate } from "./feed-format";
import type { StatusLabels } from "./feed-row";

/** An entity's stories from oldest to newest: a reader sees a rumour become a release. */
export function Timeline({
  items,
  locale,
  statusLabels,
  currentSlug,
  currentLabel,
  compact,
}: {
  items: EntityTimelineItem[];
  locale: Locale;
  statusLabels: StatusLabels;
  /** The story being read, shown as text and marked instead of linked. */
  currentSlug?: string;
  currentLabel?: string;
  /** A strip of status and date per story, at most five around the current one, for the head of an article. */
  compact?: boolean;
}) {
  if (compact) {
    const at = items.findIndex((item) => item.slug === currentSlug);
    const start = Math.max(0, Math.min((at < 0 ? items.length - 1 : at) - 2, items.length - 5));
    return (
      <ol className="timeline-strip">
        {items.slice(start, start + 5).map((item) => {
          const current = item.slug === currentSlug;
          const body = (
            <>
              <ClaimChip status={item.claimStatus} label={statusLabels[item.claimStatus]} />
              <time dateTime={item.publishedAt}>{formatShortDate(item.publishedAt, locale)}</time>
            </>
          );
          return (
            <li key={item.slug}>
              {current ? (
                <span className="timeline-strip__item" aria-current="true" title={item.title}>{body}</span>
              ) : (
                <Link
                  className="timeline-strip__item"
                  href={localizedPath(`/articles/${item.slug}`, locale)}
                  prefetch={false}
                  title={item.title}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    );
  }

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
