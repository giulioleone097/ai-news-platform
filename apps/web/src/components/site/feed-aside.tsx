import type { Locale } from "@/i18n";
import { getCachedEntities } from "@/lib/editorial-queries";
import { EntityLeaderboard } from "./entity-leaderboard";
import { StatusLegend } from "./status-legend";

/** The side column of a list page: what the status meter means, then the most covered products. */
export async function FeedAside({ locale, className = "feed-aside" }: { locale: Locale; className?: string }) {
  const entities = await getCachedEntities(locale);

  return (
    <aside className={className}>
      <StatusLegend locale={locale} />
      <EntityLeaderboard entities={entities.slice(0, 6)} locale={locale} />
    </aside>
  );
}
