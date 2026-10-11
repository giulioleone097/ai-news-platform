import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityLeaderboard } from "@/components/site/entity-leaderboard";
import { FeedLead } from "@/components/site/feed-lead";
import { toFeedItem } from "@/components/site/feed-item";
import { formatTime } from "@/components/site/feed-format";
import { InfiniteArticleList } from "@/components/site/infinite-article-list";
import { JsonLd } from "@/components/site/json-ld";
import { NewsletterForm } from "@/components/site/newsletter-form";
import { StatusFilter } from "@/components/site/status-filter";
import { StatusLegend } from "@/components/site/status-legend";
import { StoryCard } from "@/components/site/story-card";
import { TopicRail } from "@/components/site/topic-rail";
import { getMessages, isLocale, localizedPath } from "@/i18n";
import { getCachedEntities, getCachedHomeFeed } from "@/lib/editorial-queries";
import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";
import { encodeArticleCursor } from "@atlasnews/core/editorial/application/public-feed";

export const revalidate = 60;

/** Stories after the lead that get a card; the rest go to the stream. */
const cardCount = 3;

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const [feed, entities] = await Promise.all([getCachedHomeFeed(locale), getCachedEntities(locale)]);
  const following = feed.days.flatMap((day) => day.items);
  const cards = following.slice(0, cardCount);
  const stream = following.slice(cardCount);
  // A picture is shown once per page: a card whose cover already appeared higher gets a plate instead.
  const shownCovers = new Set(feed.lead ? [feed.lead.coverImage] : []);
  const cardImages = cards.map((article) => {
    const show = !shownCovers.has(article.coverImage);
    shownCovers.add(article.coverImage);
    return show;
  });

  const siteUrl = getPublicSiteUrl();
  const home = new URL(localizedPath("/", locale), siteUrl).toString();
  const publisher = { "@type": "Organization", name: messages.common.brandName, url: siteUrl.toString() };
  const siteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: messages.common.brandName,
    description: messages.metadata.siteDescription,
    url: home,
    inLanguage: locale,
    publisher,
    potentialAction: {
      "@type": "SearchAction",
      target: `${new URL(localizedPath("/search", locale), siteUrl)}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <main id="main-content" className="site-shell home-main">
      <JsonLd data={siteLd} />
      <header className="home-head">
        <div>
          <h1>{messages.feed.title}</h1>
          {feed.updatedAt ? (
            <p>
              {messages.feed.updated}{" "}
              <time dateTime={feed.updatedAt}>{formatTime(feed.updatedAt, locale)} UTC</time>
            </p>
          ) : null}
        </div>
        <StatusFilter locale={locale} />
      </header>

      {feed.lead ? (
        <>
          <FeedLead article={feed.lead} locale={locale} statusLabels={messages.story.claimStatus} />
          {cards.length ? (
            <div className="story-cards">
              {cards.map((article, index) => (
                <StoryCard
                  article={article}
                  key={article.id}
                  locale={locale}
                  showImage={cardImages[index]}
                  statusLabels={messages.story.claimStatus}
                />
              ))}
            </div>
          ) : null}
          <StatusLegend band locale={locale} />
          <div className="feed-layout">
            <section className="feed" aria-label={messages.latest.title}>
              <InfiniteArticleList
                initialItems={stream.map(toFeedItem)}
                initialNextCursor={encodeArticleCursor(feed.nextCursor)}
                locale={locale}
                copy={messages.latest}
                dayCopy={messages.feed.day}
                statusLabels={messages.story.claimStatus}
              />
            </section>
            <aside className="feed-aside">
              <EntityLeaderboard entities={entities.slice(0, 6)} locale={locale} />
            </aside>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h2>{messages.feed.emptyTitle}</h2>
          <p>{messages.feed.emptyDescription}</p>
          <Link className="button" href={localizedPath("/search", locale)}>{messages.navigation.search}</Link>
        </div>
      )}

      <NewsletterForm locale={locale} copy={messages.newsletter} source={`home-${locale}`} />
      <TopicRail categories={feed.categories} locale={locale} />
    </main>
  );
}
