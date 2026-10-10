import Link from "next/link";
import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { getMessages, localizedPath, type Locale } from "@/i18n";

const filterOrder: ClaimStatus[] = ["confirmed", "rumour", "test", "rollout", "analysis"];

/** Plain links, so the filter is shareable and works without JavaScript. */
export function StatusFilter({ locale, active }: { locale: Locale; active?: ClaimStatus }) {
  const messages = getMessages(locale);
  const options = [
    { href: localizedPath("/", locale), label: messages.common.all, current: !active },
    ...filterOrder.map((status) => ({
      href: localizedPath(`/status/${status}`, locale),
      label: messages.story.claimStatus[status],
      current: active === status,
    })),
  ];

  return (
    <nav className="chip-row" aria-label={messages.feed.statusFilterLabel}>
      {options.map((option) => (
        <Link
          aria-current={option.current ? "page" : undefined}
          className="chip"
          href={option.href}
          key={option.href}
          prefetch={false}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
