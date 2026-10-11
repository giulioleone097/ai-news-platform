import Link from "next/link";
import type { EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import { getMessages, localizedPath, type Locale } from "@/i18n";

/** The most covered entities: a second way into the feed. A count of zero is left out. */
export function EntityLeaderboard({ entities, locale }: { entities: EntitySummary[]; locale: Locale }) {
  const messages = getMessages(locale);
  if (!entities.length) return null;

  return (
    <section className="side-module" aria-labelledby="leaderboard-title">
      <h2 id="leaderboard-title">{messages.feed.mostFollowed}</h2>
      <ul className="leaderboard">
        {entities.map((entity) => (
          <li key={entity.slug}>
            <Link href={localizedPath(`/entities/${entity.slug}`, locale)} prefetch={false}>
              <span>{entity.name}</span>
              {entity.storyCount ? (
                <span>
                  {entity.storyCount} {entity.storyCount === 1 ? messages.entities.storyOne : messages.entities.storyMany}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      <Link className="side-module__more" href={localizedPath("/entities", locale)} prefetch={false}>
        {messages.entities.allEntities}
      </Link>
    </section>
  );
}
