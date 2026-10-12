import Link from "next/link";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { ClaimChip } from "./claim-chip";
import { statusLadder } from "./status-filter";

/**
 * What each step of the status meter means, and the way into the stories that carry it: every
 * step is one link. `band` lays the steps out side by side above the home stream instead of
 * stacking them in a side column.
 */
export function StatusLegend({ locale, band = false }: { locale: Locale; band?: boolean }) {
  const messages = getMessages(locale);

  return (
    <section className={band ? "side-module legend-band" : "side-module"} aria-labelledby="status-legend-title">
      <h2 id="status-legend-title">{messages.feed.legendTitle}</h2>
      <ul className="status-legend">
        {statusLadder.map((status) => (
          <li key={status}>
            <Link href={localizedPath(`/status/${status}`, locale)} prefetch={false}>
              <ClaimChip status={status} label={messages.story.claimStatus[status]} />
              <span>{messages.feed.statusIntro[status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
