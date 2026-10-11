import Link from "next/link";
import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { ClaimChip } from "./claim-chip";

/** The order a claim firms up in, then analysis, which is not a claim. */
export const statusLadder: ClaimStatus[] = ["rumour", "test", "rollout", "confirmed", "analysis"];

/** Plain links, so the filter is shareable and works without JavaScript. */
export function StatusFilter({ locale, active }: { locale: Locale; active?: ClaimStatus }) {
  const messages = getMessages(locale);

  return (
    <nav className="status-filter" aria-label={messages.feed.statusFilterLabel}>
      <Link aria-current={active ? undefined : "page"} href={localizedPath("/", locale)} prefetch={false}>
        {messages.common.all}
      </Link>
      {statusLadder.map((status) => (
        <Link
          aria-current={active === status ? "page" : undefined}
          href={localizedPath(`/status/${status}`, locale)}
          key={status}
          prefetch={false}
        >
          <ClaimChip status={status} label={messages.story.claimStatus[status]} />
        </Link>
      ))}
    </nav>
  );
}
