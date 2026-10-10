import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityLeaderboard } from "@/components/site/entity-leaderboard";
import { FeedLead } from "@/components/site/feed-lead";
import { toFeedItem } from "@/components/site/feed-item";
import { formatTime } from "@/components/site/feed-format";
import { InfiniteArticleList } from "@/components/site/infinite-article-list";
import { NewsletterForm } from "@/components/site/newsletter-form";
import { StatusFilter } from "@/components/site/status-filter";
import { TopicRail } from "@/components/site/topic-rail";
import { getMessages, isLocale, localizedPath } from "@/i18n";
import { getCachedEntities, getCachedHomeFeed } from "@/lib/editorial-queries";
import { encodeArticleCursor } from "@atlasnews/core/editorial/application/public-feed";

export const revalidate = 60;

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const [feed, entities] = await Promise.all([getCachedHomeFeed(locale), getCachedEntities(locale)]);

  return (
    <main id="main-content" className="site-shell home-main">
      <div className="feed-layout">
        <section className="feed" aria-labelledby="feed-title">
          <header className="feed__head">
            <h1 id="feed-title">{messages.feed.title}</h1>
            <StatusFilter locale={locale} />
            {feed.updatedAt ? (
              <p className="feed__updated">
                {messages.feed.updated}{" "}
                <time dateTime={feed.updatedAt}>{formatTime(feed.updatedAt, locale)} UTC</time>
              </p>
            ) : null}
          </header>

          {feed.lead ? (
            <>
              <FeedLead article={feed.lead} locale={locale} statusLabels={messages.story.claimStatus} />
              <InfiniteArticleList
                initialItems={feed.days.flatMap((day) => day.items.map(toFeedItem))}
                initialNextCursor={encodeArticleCursor(feed.nextCursor)}
                locale={locale}
                copy={messages.latest}
                dayCopy={messages.feed.day}
                statusLabels={messages.story.claimStatus}
              />
            </>
          ) : (
            <div className="empty-state">
              <h2>{messages.feed.emptyTitle}</h2>
              <p>{messages.feed.emptyDescription}</p>
              <Link className="button" href={localizedPath("/search", locale)}>{messages.navigation.search}</Link>
            </div>
          )}
        </section>

        <aside className="feed-aside">
          <EntityLeaderboard entities={entities.slice(0, 6)} locale={locale} />
        </aside>
      </div>

      <NewsletterForm locale={locale} copy={messages.newsletter} source={`home-${locale}`} />
      <TopicRail categories={feed.categories} locale={locale} />
    </main>
  );
}
