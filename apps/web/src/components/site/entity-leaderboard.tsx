import Link from "next/link";
import type { EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import { EntityStatus, getLatestClaims } from "./entity-status";

/** The most covered entities: a second way into the feed, each with where its story stands. */
export async function EntityLeaderboard({ entities, locale }: { entities: EntitySummary[]; locale: Locale }) {
  const messages = getMessages(locale);
  if (!entities.length) return null;
  const claims = await getLatestClaims(entities.map((entity) => entity.slug), locale);

  return (
    <section className="side-module" aria-labelledby="leaderboard-title">
      <h2 id="leaderboard-title">{messages.feed.mostFollowed}</h2>
      <ul className="leaderboard">
        {entities.map((entity, index) => (
          <li key={entity.slug}>
            <Link href={localizedPath(`/entities/${entity.slug}`, locale)} prefetch={false}>
              <span>{entity.name}</span>
              <EntityStatus latest={claims[index]} count={entity.storyCount} locale={locale} />
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
