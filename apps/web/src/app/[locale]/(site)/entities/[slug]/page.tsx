import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { toFeedItem } from "@/components/site/feed-item";
import { InfiniteArticleList } from "@/components/site/infinite-article-list";
import { Timeline } from "@/components/site/timeline";
import { getAlternates, getMessages, isLocale, locales, localizedPath } from "@/i18n";
import {
  getCachedEntities,
  getCachedEntityPage,
  searchPublishedArticles,
} from "@/lib/editorial-queries";
import { encodeArticleCursor } from "@atlasnews/core/editorial/application/public-feed";
import { feedPageSize } from "@atlasnews/core/editorial/domain/editorial-service";

export const revalidate = 60;

export async function generateStaticParams() {
  const groups = await Promise.all(
    locales.map(async (locale) =>
      (await getCachedEntities(locale)).map((entity) => ({ locale, slug: entity.slug })),
    ),
  );
  return groups.flat();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const data = await getCachedEntityPage(slug, locale);
  if (!data) return { title: getMessages(locale).errors.notFoundTitle };
  return {
    title: data.entity.name,
    description: data.entity.description || getMessages(locale).entities.metadataFallback,
    alternates: getAlternates(`/entities/${slug}`, locale),
  };
}

export default async function EntityPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const data = await getCachedEntityPage(slug, locale);
  if (!data) notFound();

  const { entity, timeline } = data;
  const messages = getMessages(locale);
  const copy = messages.entities;
  const page = await searchPublishedArticles({ locale, entity: slug, limit: feedPageSize });

  return (
    <main id="main-content" className="site-shell entity-page">
      <header className="page-head">
        <p className="page-head__kicker">
          {messages.story.entityKind[entity.kind]}
          {entity.parent ? (
            <>
              {" · "}
              {copy.madeBy}{" "}
              <Link href={localizedPath(`/entities/${entity.parent.slug}`, locale)} prefetch={false}>
                {entity.parent.name}
              </Link>
            </>
          ) : null}
        </p>
        <h1>{entity.name}</h1>
        {entity.description ? <p>{entity.description}</p> : null}
        {entity.officialUrl ? (
          <a className="page-head__link" href={entity.officialUrl} rel="noopener noreferrer" target="_blank">
            {copy.officialSite}
            <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </header>

      <section className="entity-section" aria-labelledby="timeline-title">
        <h2 id="timeline-title">{copy.timelineTitle}</h2>
        {timeline.length ? (
          <>
            <p className="entity-section__note">{copy.timelineDescription}</p>
            <Timeline items={timeline} locale={locale} statusLabels={messages.story.claimStatus} />
          </>
        ) : (
          <p className="entity-section__note">{copy.timelineEmpty}</p>
        )}
      </section>

      <section className="entity-section" aria-labelledby="stories-title">
        <h2 id="stories-title">{copy.storiesTitle}</h2>
        {page.items.length ? (
          <InfiniteArticleList
            initialItems={page.items.map(toFeedItem)}
            initialNextCursor={encodeArticleCursor(page.nextCursor)}
            locale={locale}
            filters={{ entity: slug }}
            copy={messages.latest}
            dayCopy={messages.feed.day}
            statusLabels={messages.story.claimStatus}
          />
        ) : (
          <div className="empty-state">
            <h3>{copy.storiesEmptyTitle}</h3>
            <p>{copy.storiesEmptyDescription}</p>
            <Link className="button" href={localizedPath("/latest", locale)}>{copy.seeLatest}</Link>
          </div>
        )}
      </section>
    </main>
  );
}
