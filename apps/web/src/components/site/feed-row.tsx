import Link from "next/link";
import { localizedPath, type Locale } from "@atlasnews/core/locale";
import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { ClaimChip } from "./claim-chip";
import type { FeedItem } from "./feed-item";
import { formatShortDate, formatTime } from "./feed-format";

export type StatusLabels = Record<ClaimStatus, string>;
export type Stamp = "time" | "date";

function Stamped({ item, locale, stamp = "time" }: { item: FeedItem; locale: Locale; stamp?: Stamp }) {
  if (!item.publishedAt) return null;
  return (
    <time dateTime={item.publishedAt}>
      {stamp === "date" ? formatShortDate(item.publishedAt, locale) : formatTime(item.publishedAt, locale)}
    </time>
  );
}

/** Status chip, primary entity (the category when there is none) and time: the scan line of a story. */
export function StoryMeta({
  item,
  locale,
  statusLabels,
  stamp,
}: {
  item: FeedItem;
  locale: Locale;
  statusLabels: StatusLabels;
  /** Omit to leave the time out, as the stream rows do: they print it in their own column. */
  stamp?: Stamp;
}) {
  return (
    <p className="story-meta">
      <ClaimChip status={item.claimStatus} label={statusLabels[item.claimStatus]} />
      <span>{item.entity?.name ?? item.category.name}</span>
      {stamp ? <Stamped item={item} locale={locale} stamp={stamp} /> : null}
    </p>
  );
}

/** One compact story. The headline link covers the whole row, so the row is one target with one name. */
export function FeedRow({
  item,
  locale,
  statusLabels,
  stamp,
}: {
  item: FeedItem;
  locale: Locale;
  statusLabels: StatusLabels;
  stamp?: Stamp;
}) {
  return (
    <li className="story-row">
      <span className="story-row__time"><Stamped item={item} locale={locale} stamp={stamp} /></span>
      <div className="story-row__body">
        <StoryMeta item={item} locale={locale} statusLabels={statusLabels} />
        <h3 className="story-row__title">
          <Link href={localizedPath(`/articles/${item.slug}`, locale)} prefetch={false}>
            {item.title}
          </Link>
        </h3>
      </div>
    </li>
  );
}
