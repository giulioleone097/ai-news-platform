import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { LazyCommentsWidget } from "@/components/site/comments/lazy-comments-widget";
import { BookmarkButton } from "@/components/site/bookmark-button";
import { ClaimChip } from "@/components/site/claim-chip";
import { EditorialCover } from "@/components/site/editorial-cover";
import { toFeedItem } from "@/components/site/feed-item";
import { FeedRow } from "@/components/site/feed-row";
import { NewsletterForm } from "@/components/site/newsletter-form";
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

export const revalidate = 300;

export async function generateStaticParams() {
  const groups = await Promise.all(
    locales.map(async (locale) => {
      const page = await searchPublishedArticles({ locale, limit: 100 });
      return page.items.map((article) => ({ locale, slug: article.slug }));
    }),
  );
  return groups.flat();
}

/** The slug of this story in each language where a published translation exists. */
async function getTranslationSlugs(article: Article) {
  const entries = await Promise.all(
    locales.map(async (locale) => {
      if (locale === article.locale) return [locale, article.slug] as const;
      const page = await searchPublishedArticles({ locale, limit: 100 });
      const peer = page.items.find((item) => item.translationKey === article.translationKey);
      return [locale, peer?.slug] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<Locale, string | undefined>;
}

async function getArticleAlternates(article: Article, currentLocale: Locale) {
  const slugs = await getTranslationSlugs(article);
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
    alternates,
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
      const localizedArticles = await searchPublishedArticles({ locale, limit: 100 });
      const peer = localizedArticles.items.find(
        (item) => item.translationKey === source.translationKey,
      );
      if (peer) redirect(localizedPath(`/articles/${peer.slug}`, locale));
    }
    notFound();
  }

  const headings = extractMarkdownHeadings(article.content);
  const articlePath = localizedPath(`/articles/${article.slug}`, locale);
  const url = new URL(articlePath, getPublicSiteUrl()).toString();
  const [related, translationSlugs, entityDirectory, primaryTimeline] = await Promise.all([
    getRelatedStories(article, locale),
    getTranslationSlugs(article),
    getCachedEntities(locale),
    article.entities[0] ? getCachedEntityPage(article.entities[0].slug, locale) : null,
  ]);
  const primaryEntity = article.entities[0];
  const storySoFar = primaryTimeline && primaryTimeline.timeline.length > 1 ? primaryTimeline.timeline : [];
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
    mainEntityOfPage: url,
    ...(primaryEntity ? { about: entityLd(primaryEntity) } : {}),
    ...(article.entities.length > 1 ? { mentions: article.entities.slice(1).map(entityLd) } : {}),
    ...(article.sources.length
      ? { citation: article.sources.map((source) => ({ "@type": "CreativeWork", name: source.title, url: source.url })) }
      : {}),
  };

  return (
    <main id="main-content" className="site-shell article-page">
      <article
        data-article-id={article.id}
        data-article-slug={article.slug}
        data-claim-status={article.claimStatus}
      >
        <Link
          className="article-back"
          href={localizedPath(`/categories/${article.category.slug}`, locale)}
          prefetch={false}
        >
          <ArrowLeft aria-hidden="true" /> {article.category.name}
        </Link>

        <header className="article-hero">
          <div className="article-hero__copy">
            <div className="article-tags">
              <ClaimChip status={article.claimStatus} label={messages.story.claimStatus[article.claimStatus]} />
              {article.entities.length ? (
                <nav className="chip-row" aria-label={messages.article.entitiesLabel}>
                  {article.entities.map((entity) => (
                    <Link
                      className="chip chip--entity"
                      href={localizedPath(`/entities/${entity.slug}`, locale)}
                      key={entity.slug}
                      prefetch={false}
                    >
                      {entity.name}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>
            <h1>{article.title}</h1>
            <p className="article-deck">{article.excerpt}</p>
            <div className="article-meta">
              <time dateTime={article.publishedAt ?? undefined}>
                {formatArticleDate(article.publishedAt, locale)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{article.readingMinutes} {messages.article.minuteRead}</span>
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
            <div className="article-byline">
              <span className="avatar" aria-hidden="true">{article.author.initials}</span>
              <span>{article.author.name}</span>
              <div className="article-byline__actions">
                <BookmarkButton articleId={article.id} copy={messages.bookmark} />
                <ShareActions url={url} title={article.title} labels={messages.share} />
              </div>
            </div>
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
          </div>

          <div className="article-hero__image">
            <EditorialCover
              src={article.coverImage}
              alt={article.coverAlt}
              sizes="(max-width: 900px) 100vw, 58vw"
              quality={88}
            />
          </div>

          {headings.length ? (
            <aside className="article-toc" aria-labelledby="toc-title">
              <h2 id="toc-title">{messages.article.tableOfContents}</h2>
              <ol>
                {headings.map((heading) => (
                  <li className={heading.depth === 3 ? "article-toc__subheading" : undefined} key={heading.id}>
                    <a href={`#${heading.id}`}>{heading.text}</a>
                  </li>
                ))}
              </ol>
            </aside>
          ) : null}
        </header>

        <div className="article-reading-layout">
          <aside className="article-share-rail">
            <span>{messages.share.action}</span>
            <ShareActions url={url} title={article.title} labels={messages.share} />
          </aside>
          <MarkdownRenderer
            className="article-body markdown-content"
            content={article.content}
            imageUnavailableLabel={messages.errors.imageUnavailable}
          />
        </div>

        {article.sources.length ? (
          <section className="article-extra" aria-labelledby="sources-title">
            <h2 id="sources-title">{messages.article.sourcesTitle}</h2>
            <ol className="source-list">
              {article.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} rel="noopener noreferrer" target="_blank">
                    {source.title}
                    <ExternalLink aria-hidden="true" />
                  </a>
                  <span>{messages.article.sourceBacks} {source.supports}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {primaryEntity && storySoFar.length ? (
          <section className="article-extra" aria-labelledby="story-so-far-title">
            <h2 id="story-so-far-title">{messages.article.storySoFarTitle}</h2>
            <Timeline
              items={storySoFar}
              locale={locale}
              statusLabels={messages.story.claimStatus}
              currentSlug={article.slug}
              currentLabel={messages.article.thisStory}
            />
            <Link className="article-extra__link" href={localizedPath(`/entities/${primaryEntity.slug}`, locale)} prefetch={false}>
              {messages.article.fullTimeline} {primaryEntity.name}
            </Link>
          </section>
        ) : null}
      </article>

      <LazyCommentsWidget articleId={article.id} locale={locale} />

      {related.length ? (
        <section className="related" aria-labelledby="related-title">
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
      <NewsletterForm
        locale={locale}
        copy={messages.newsletter}
        source={`article-${article.translationKey}-${locale}`}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}
