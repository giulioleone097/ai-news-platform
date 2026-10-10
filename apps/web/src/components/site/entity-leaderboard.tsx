import Link from "next/link";
import type { EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import { getMessages, localizedPath, type Locale } from "@/i18n";

/** The most covered entities with their story counts: a second way into the feed. */
export function EntityLeaderboard({ entities, locale }: { entities: EntitySummary[]; locale: Locale }) {
  const messages = getMessages(locale);
  if (!entities.length) return null;

  return (
    <section className="leaderboard" aria-labelledby="leaderboard-title">
      <h2 id="leaderboard-title">{messages.feed.mostFollowed}</h2>
      <ul>
        {entities.map((entity) => (
          <li key={entity.slug}>
            <Link href={localizedPath(`/entities/${entity.slug}`, locale)} prefetch={false}>
              <span>{entity.name}</span>
              <span>{entity.storyCount} {entity.storyCount === 1 ? messages.entities.storyOne : messages.entities.storyMany}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
