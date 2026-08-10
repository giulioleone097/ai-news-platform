import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { LazyCommentsWidget } from "@/components/site/comments/lazy-comments-widget";
import { BookmarkButton } from "@/components/site/bookmark-button";
import { EditorialCover } from "@/components/site/editorial-cover";
import { NewsletterForm } from "@/components/site/newsletter-form";
import { SectionHeader } from "@/components/site/section-header";
import { ShareActions } from "@/components/site/share-actions";
import { StoryRow } from "@/components/site/story-row";
import { getPublicSiteUrl } from "@/config/env";
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
  searchPublishedArticles,
} from "@/lib/editorial-queries";
import type { Article } from "@/modules/editorial/domain/article";

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

async function getArticleAlternates(article: Article, currentLocale: Locale) {
  const entries = await Promise.all(
    locales.map(async (locale) => {
      const page = await searchPublishedArticles({ locale, limit: 100 });
      const peer = page.items.find((item) => item.translationKey === article.translationKey);
      return [
        locale,
        localizedPath(`/articles/${peer?.slug ?? article.slug}`, locale),
      ] as const;
    }),
  );
  const languages = Object.fromEntries(entries) as Record<Locale | "x-default", string>;
  languages["x-default"] = entries.find(([locale]) => locale === "en")?.[1] ?? entries[0][1];

  return {
    canonical: localizedPath(`/articles/${article.slug}`, currentLocale),
    languages,
  };
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
  const related = (
    await searchPublishedArticles({
      locale,
      category: article.category.slug,
      limit: 4,
    })
  ).items.filter((item) => item.id !== article.id).slice(0, 3);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt,
    image: [new URL(article.coverImage, getPublicSiteUrl()).toString()],
    inLanguage: locale,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: { "@type": "Person", name: article.author.name },
    publisher: {
      "@type": "Organization",
      name: messages.common.brandName,
      url: getPublicSiteUrl().toString(),
    },
    mainEntityOfPage: url,
  };

  return (
    <main id="main-content" className="site-shell article-page">
      <article>
        <Link
          className="article-back"
          href={localizedPath(`/categories/${article.category.slug}`, locale)}
          prefetch={false}
        >
          <ArrowLeft aria-hidden="true" /> {article.category.name}
        </Link>

        <header className="article-hero">
          <div className="article-hero__copy">
            <h1>{article.title}</h1>
            <p className="article-deck">{article.excerpt}</p>
            <div className="article-meta">
              <time dateTime={article.publishedAt ?? undefined}>
                {formatArticleDate(article.publishedAt, locale)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{article.readingMinutes} {messages.article.minuteRead}</span>
            </div>
            <div className="article-byline">
              <span className="avatar" aria-hidden="true">{article.author.initials}</span>
              <span>{article.author.name}</span>
              <div className="article-byline__actions">
                <BookmarkButton articleId={article.id} copy={messages.bookmark} />
                <ShareActions url={url} title={article.title} labels={messages.share} />
              </div>
            </div>
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
          <div className="spotlight__grid">
            {related.map((item, index) => (
              <StoryRow article={item} locale={locale} index={index} key={item.id} />
            ))}
          </div>
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
