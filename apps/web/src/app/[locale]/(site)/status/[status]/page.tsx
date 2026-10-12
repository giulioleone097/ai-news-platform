import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/styles/site/lists.css";
import { FeedAside } from "@/components/site/feed-aside";
import { toFeedItem } from "@/components/site/feed-item";
import { InfiniteArticleList } from "@/components/site/infinite-article-list";
import { StatusFilter } from "@/components/site/status-filter";
import { getAlternates, getMessages, isLocale, locales, localizedPath } from "@/i18n";
import { searchPublishedArticles } from "@/lib/editorial-queries";
import { encodeArticleCursor } from "@atlasnews/core/editorial/application/public-feed";
import { claimStatuses, type ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { feedPageSize } from "@atlasnews/core/editorial/domain/editorial-service";
import { agentAlternateTypes } from "@/lib/alternates";

export const revalidate = 60;

const isClaimStatus = (value: string): value is ClaimStatus =>
  (claimStatuses as readonly string[]).includes(value);

export function generateStaticParams() {
  return locales.flatMap((locale) => claimStatuses.map((status) => ({ locale, status })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; status: string }>;
}): Promise<Metadata> {
  const { locale, status } = await params;
  if (!isLocale(locale) || !isClaimStatus(status)) return {};
  const messages = getMessages(locale);
  return {
    title: messages.feed.statusPageTitle[status],
    description: messages.feed.statusIntro[status],
    alternates: { ...getAlternates(`/status/${status}`, locale), types: agentAlternateTypes(locale) },
  };
}

export default async function StatusPage({
  params,
}: {
  params: Promise<{ locale: string; status: string }>;
}) {
  const { locale, status } = await params;
  if (!isLocale(locale) || !isClaimStatus(status)) notFound();

  const messages = getMessages(locale);
  const page = await searchPublishedArticles({ locale, claimStatus: status, limit: feedPageSize });

  return (
    <main id="main-content" className="site-shell list-main">
      <div className="archive">
        <header className="page-head">
          <h1>{messages.feed.statusPageTitle[status]}</h1>
          <p>{messages.feed.statusIntro[status]}</p>
        </header>
        <div className="archive__tools">
          <StatusFilter locale={locale} active={status} />
        </div>

        <section className="feed" aria-label={messages.feed.statusPageTitle[status]}>
          {page.items.length ? (
            <InfiniteArticleList
              initialItems={page.items.map(toFeedItem)}
              initialNextCursor={encodeArticleCursor(page.nextCursor)}
              locale={locale}
              filters={{ status }}
              copy={messages.latest}
              feedCopy={messages.feed}
              statusLabels={messages.story.claimStatus}
            />
          ) : (
            <div className="empty-state">
              <h2>{messages.feed.statusEmptyTitle}</h2>
              <p>{messages.feed.statusEmptyDescription}</p>
              <Link className="button" href={localizedPath("/", locale)}>{messages.feed.seeAll}</Link>
            </div>
          )}
        </section>
        <FeedAside locale={locale} legend />
      </div>
    </main>
  );
}
