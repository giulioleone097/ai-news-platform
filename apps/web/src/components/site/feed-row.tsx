import Link from "next/link";
import { localizedPath, type Locale } from "@atlasnews/core/locale";
import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { ClaimChip } from "./claim-chip";
import type { FeedItem } from "./feed-item";
import { formatShortDate, formatTime } from "./feed-format";

export type StatusLabels = Record<ClaimStatus, string>;

/** Status chip, primary entity (the category when there is none) and time: the scan line of a story. */
export function FeedMeta({
  item,
  locale,
  statusLabels,
  stamp = "time",
}: {
  item: FeedItem;
  locale: Locale;
  statusLabels: StatusLabels;
  stamp?: "time" | "date";
}) {
  return (
    <>
      <ClaimChip status={item.claimStatus} label={statusLabels[item.claimStatus]} />
      <span className="feed-row__entity">{item.entity?.name ?? item.category.name}</span>
      {item.publishedAt ? (
        <time className="feed-row__time" dateTime={item.publishedAt}>
          {stamp === "date" ? formatShortDate(item.publishedAt, locale) : formatTime(item.publishedAt, locale)}
        </time>
      ) : null}
    </>
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
  stamp?: "time" | "date";
}) {
  return (
    <li className="feed-row">
      <FeedMeta item={item} locale={locale} statusLabels={statusLabels} stamp={stamp} />
      <h3 className="feed-row__title">
        <Link href={localizedPath(`/articles/${item.slug}`, locale)} prefetch={false}>
          {item.title}
        </Link>
      </h3>
    </li>
  );
}
