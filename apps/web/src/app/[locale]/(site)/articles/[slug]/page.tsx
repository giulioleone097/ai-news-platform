import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import "@/styles/site/article.css";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { LazyCommentsWidget } from "@/components/site/comments/lazy-comments-widget";
import { BookmarkButton } from "@/components/site/bookmark-button";
import { ClaimChip } from "@/components/site/claim-chip";
import { EditorialCover } from "@/components/site/editorial-cover";
import { toFeedItem } from "@/components/site/feed-item";
import { formatShortDate } from "@/components/site/feed-format";
import { FeedRow } from "@/components/site/feed-row";
import { SectionHeader } from "@/components/site/section-header";
import { ShareActions } from "@/components/site/share-actions";
import { Timeline } from "@/components/site/timeline";
import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";
import {
  getMessages,
  isLocale,
  locales,
  localizedPath,
  type Locale,
} from "@/i18n";
import { formatArticleDate } from "@/lib/format";
import { extractMarkdownHeadings } from "@/lib/markdown";
import {
  getCachedArticle,
  getCachedEntities,
  getCachedEntityPage,
  searchPublishedArticles,
} from "@/lib/editorial-queries";
import type { Article } from "@atlasnews/core/editorial/domain/article";
import { agentAlternateTypes } from "@/lib/alternates";
import { findTranslationSlug } from "@/lib/feeds/data";
import { JsonLd } from "@/components/site/json-ld";

export const revalidate = 300;

export async function generateStaticParams() {
  const groups = await Promise.all(
    locales.map(async (locale) => {
      // The newest page; older stories render on their first visit.
      const page = await searchPublishedArticles({ locale, limit: 50 });
      return page.items.map((article) => ({ locale, slug: article.slug }));
    }),
  );
  return groups.flat();
}

/** The slug of this story in each language where a published translation exists. Once per render, for the metadata and the page. */
const getTranslationSlugs = cache(async (locale: Locale, slug: string, translationKey: string) => {
  const entries = await Promise.all(
    locales.map(async (candidate) => [
      candidate,
      candidate === locale ? slug : await findTranslationSlug(translationKey, candidate),
    ] as const),
  );
  return Object.fromEntries(entries) as Record<Locale, string | undefined>;
});

async function getArticleAlternates(article: Article, currentLocale: Locale) {
  const slugs = await getTranslationSlugs(article.locale, article.slug, article.translationKey);
  const entries = locales.map(
    (locale) => [locale, localizedPath(`/articles/${slugs[locale] ?? article.slug}`, locale)] as const,
  );
  const languages = Object.fromEntries(entries) as Record<Locale | "x-default", string>;
  languages["x-default"] = entries.find(([locale]) => locale === "en")?.[1] ?? entries[0][1];

  return {
    canonical: localizedPath(`/articles/${article.slug}`, currentLocale),
    languages,
  };
}

/** Stories that share an entity with this one, then stories of its category, up to three. */
async function getRelatedStories(article: Article, locale: Locale) {
  const related: Article[] = [];
  const seen = new Set([article.id]);
  const take = (items: Article[]) => {
    for (const item of items) {
      if (related.length === 3) return;
      if (!seen.has(item.id)) {
        seen.add(item.id);
        related.push(item);
      }
    }
  };

  const byEntity = await Promise.all(
    article.entities.map((entity) => searchPublishedArticles({ locale, entity: entity.slug, limit: 4 })),
  );
  byEntity.forEach((page) => take(page.items));
  if (related.length < 3) {
    take((await searchPublishedArticles({ locale, category: article.category.slug, limit: 6 })).items);
  }
  return related;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};

  const messages = getMessages(locale);
  const article = await getCachedArticle(slug, locale);
  if (!article) return { title: messages.metadata.articleNotFoundTitle };
  const alternates = await getArticleAlternates(article, locale);

  return {
    title: article.title,
    description: article.excerpt,
    alternates: { ...alternates, types: agentAlternateTypes(locale, `/articles/${article.slug}`) },
    openGraph: {
      type: "article",
      url: alternates.canonical,
      locale: messages.metadata.openGraphLocale,
      alternateLocale: locale === "en" ? ["it_IT"] : ["en_US"],
      siteName: messages.common.brandName,
      title: article.title,
      description: article.excerpt,
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt,
      authors: [article.author.name],
      section: article.category.name,
      images: [{ url: article.coverImage, alt: article.coverAlt, width: 1536, height: 1024 }],
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const article = await getCachedArticle(slug, locale);
  if (!article) {
    const sourceArticles = await Promise.all(
      locales.filter((candidate) => candidate !== locale).map(
        (candidate) => getCachedArticle(slug, candidate),
      ),
    );
    const source = sourceArticles.find(Boolean);
    if (source) {
      const peerSlug = await findTranslationSlug(source.translationKey, locale);
      if (peerSlug) redirect(localizedPath(`/articles/${peerSlug}`, locale));
    }
    notFound();
  }

  const headings = extractMarkdownHeadings(article.content);
  const showContents = headings.length > 3;
  const contents = (
    <ul>
      {headings.map((heading) => (
        <li className={heading.depth === 3 ? "article-toc__sub" : undefined} key={heading.id}>
          <a href={`#${heading.id}`}>{heading.text}</a>
        </li>
      ))}
    </ul>
  );
  const articlePath = localizedPath(`/articles/${article.slug}`, locale);
  const url = new URL(articlePath, getPublicSiteUrl()).toString();
  const [related, translationSlugs, entityDirectory, primaryTimeline] = await Promise.all([
    getRelatedStories(article, locale),
    getTranslationSlugs(article.locale, article.slug, article.translationKey),
    getCachedEntities(locale),
    article.entities[0] ? getCachedEntityPage(article.entities[0].slug, locale) : null,
  ]);
  const primaryEntity = article.entities[0];
  const storySoFar = primaryTimeline && primaryTimeline.timeline.length > 1 ? primaryTimeline.timeline : [];
  const updatedLater = Boolean(article.publishedAt) && article.updatedAt.slice(0, 10) > (article.publishedAt ?? "").slice(0, 10);
  const otherLocale = locales.find((candidate) => candidate !== locale);
  const translationSlug = otherLocale ? translationSlugs[otherLocale] : undefined;
  const siteUrl = getPublicSiteUrl();
  const entityLd = (entity: Article["entities"][number]) => {
    const official = entityDirectory.find((item) => item.slug === entity.slug)?.officialUrl;
    return {
      "@type": entity.kind === "company" ? "Organization" : "SoftwareApplication",
      name: entity.name,
      url: new URL(localizedPath(`/entities/${entity.slug}`, locale), siteUrl).toString(),
      ...(official ? { sameAs: [official] } : {}),
    };
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt,
    image: [new URL(article.coverImage, siteUrl).toString()],
    inLanguage: locale,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: { "@type": "Person", name: article.author.name },
    publisher: {
      "@type": "Organization",
      name: messages.common.brandName,
      url: siteUrl.toString(),
    },
    url,
    mainEntityOfPage: url,
    articleSection: article.category.name,
    isAccessibleForFree: true,
    ...(primaryEntity ? { about: entityLd(primaryEntity) } : {}),
    ...(article.entities.length > 1 ? { mentions: article.entities.slice(1).map(entityLd) } : {}),
    ...(article.sources.length
      ? { citation: article.sources.map((source) => ({ "@type": "CreativeWork", name: source.title, url: source.url })) }
      : {}),
  };
  const absolute = (path: string) => new URL(localizedPath(path, locale), siteUrl).toString();
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: messages.common.brandName, item: absolute("/") },
      { name: article.category.name, item: absolute(`/categories/${article.category.slug}`) },
      { name: article.title, item: url },
    ].map((entry, index) => ({ "@type": "ListItem", position: index + 1, ...entry })),
  };

  return (
    <main id="main-content" className="site-shell article-page">
      <div className={showContents ? "article-frame" : "article-frame article-frame--single"}>
        <article
          className="article"
          data-article-id={article.id}
          data-article-slug={article.slug}
          data-claim-status={article.claimStatus}
        >
          <header className="article-head">
            <div className="article-nav">
              <Link
                className="article-back"
                href={localizedPath(`/categories/${article.category.slug}`, locale)}
                prefetch={false}
              >
                <ChevronLeft aria-hidden="true" />
                {article.category.name}
              </Link>
              {otherLocale && translationSlug ? (
                <a
                  className="article-language"
                  href={localizedPath(`/articles/${translationSlug}`, otherLocale)}
                  hrefLang={otherLocale}
                  lang={otherLocale}
                >
                  {messages.article.languageLink[otherLocale]}
                </a>
              ) : null}
            </div>
            <p className="story-meta">
              <Link href={localizedPath(`/status/${article.claimStatus}`, locale)} prefetch={false}>
                <ClaimChip
                  size="lead"
                  status={article.claimStatus}
                  label={messages.story.claimStatus[article.claimStatus]}
                />
              </Link>
              {primaryEntity ? (
                <Link href={localizedPath(`/entities/${primaryEntity.slug}`, locale)} prefetch={false}>
                  {primaryEntity.name}
                </Link>
              ) : null}
              {updatedLater ? (
                <span>
                  {messages.article.updatedLabel}{" "}
                  <time dateTime={article.updatedAt}>{formatShortDate(article.updatedAt, locale)}</time>
                </span>
              ) : null}
            </p>
            <h1>{article.title}</h1>
            <p className="article-deck">{article.excerpt}</p>
            <div className="article-byline">
              <p className="article-byline__text">
                <span className="article-byline__author">{article.author.name}</span>
                <time dateTime={article.publishedAt ?? undefined}>
                  {formatArticleDate(article.publishedAt, locale)}
                </time>
                <span>{article.readingMinutes} {messages.article.minuteRead}</span>
              </p>
              <div className="article-actions">
                <BookmarkButton articleId={article.id} copy={messages.bookmark} />
                <ShareActions url={url} title={article.title} labels={messages.share} />
              </div>
            </div>
          </header>

          <figure className="article-cover">
            <EditorialCover
              src={article.coverImage}
              alt={article.coverAlt}
              sizes="(max-width: 68rem) 100vw, 60rem"
              quality={88}
            />
          </figure>

          {article.keyPoints.length ? (
            <section className="key-points" aria-labelledby="key-points-title">
              <h2 id="key-points-title">{messages.story.keyPoints}</h2>
              <ul>
                {article.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {primaryEntity && storySoFar.length ? (
            <section className="story-so-far" aria-labelledby="story-so-far-title">
              <div className="story-so-far__head">
                <h2 id="story-so-far-title">{messages.article.storySoFarTitle}</h2>
                <Link href={localizedPath(`/entities/${primaryEntity.slug}`, locale)} prefetch={false}>
                  {messages.article.fullTimeline} {primaryEntity.name}
                </Link>
              </div>
              <Timeline
                compact
                items={storySoFar}
                locale={locale}
                statusLabels={messages.story.claimStatus}
                currentSlug={article.slug}
              />
            </section>
          ) : null}

          {showContents ? (
            <>
              <details className="article-toc article-toc--fold">
                <summary>{messages.article.tableOfContents}</summary>
                {contents}
              </details>
              <aside className="article-toc article-toc--side" aria-labelledby="toc-title">
                <h2 id="toc-title">{messages.article.tableOfContents}</h2>
                {contents}
              </aside>
            </>
          ) : null}

          <div className="article-main">
            <MarkdownRenderer
              className="article-body"
              content={article.content}
              imageUnavailableLabel={messages.errors.imageUnavailable}
              labels={messages.markdown}
            />

            {article.sources.length ? (
              <section aria-labelledby="sources-title">
                <SectionHeader id="sources-title" title={messages.article.sourcesTitle} />
                <ul className="source-list">
                  {article.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} rel="noopener noreferrer" target="_blank">
                        {source.title}
                        <ExternalLink aria-hidden="true" />
                      </a>
                      <span>{messages.article.sourceBacks} {source.supports}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {article.entities.length ? (
              <nav aria-labelledby="entities-title">
                <SectionHeader id="entities-title" title={messages.article.entitiesLabel} />
                <ul className="entity-links">
                  {article.entities.map((entity) => (
                    <li key={entity.slug}>
                      <Link href={localizedPath(`/entities/${entity.slug}`, locale)} prefetch={false}>
                        {entity.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
        </article>

        <div className="article-tail">
          <LazyCommentsWidget articleId={article.id} locale={locale} />

          {related.length ? (
            <section className="article-related" aria-labelledby="related-title">
              <SectionHeader
                id="related-title"
                title={messages.article.continueReading}
                href={localizedPath("/latest", locale)}
                linkLabel={messages.article.allArticles}
              />
              <ul className="feed-list">
                {related.map((item) => (
                  <FeedRow
                    item={toFeedItem(item)}
                    locale={locale}
                    statusLabels={messages.story.claimStatus}
                    stamp="date"
                    key={item.id}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbLd} />
    </main>
  );
}
