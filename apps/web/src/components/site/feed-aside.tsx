import type { Locale } from "@/i18n";
import { getCachedEntities } from "@/lib/editorial-queries";
import { EntityLeaderboard } from "./entity-leaderboard";
import { StatusLegend } from "./status-legend";

/** The side column of a list page: the most covered products, and what the status meter means where the page is about it. */
export async function FeedAside({
  locale,
  className = "feed-aside",
  legend = false,
}: {
  locale: Locale;
  className?: string;
  legend?: boolean;
}) {
  const entities = await getCachedEntities(locale);

  return (
    <aside className={className}>
      {legend ? <StatusLegend locale={locale} /> : null}
      <EntityLeaderboard entities={entities.slice(0, 6)} locale={locale} />
    </aside>
  );
}
