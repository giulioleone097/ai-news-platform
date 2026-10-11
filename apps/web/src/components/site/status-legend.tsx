import Link from "next/link";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { ClaimChip } from "./claim-chip";
import { statusLadder } from "./status-filter";

/** What each step of the status meter means. Every step links to the stories that carry it. */
export function StatusLegend({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);

  return (
    <section className="side-module" aria-labelledby="status-legend-title">
      <h2 id="status-legend-title">{messages.feed.legendTitle}</h2>
      <ul className="status-legend">
        {statusLadder.map((status) => (
          <li key={status}>
            <Link href={localizedPath(`/status/${status}`, locale)} prefetch={false}>
              <ClaimChip status={status} label={messages.story.claimStatus[status]} />
            </Link>
            <p>{messages.feed.statusIntro[status]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
