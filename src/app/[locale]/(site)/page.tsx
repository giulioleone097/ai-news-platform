import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { BookmarkButton } from "@/components/site/bookmark-button";
import { NewsletterForm } from "@/components/site/newsletter-form";
import { SectionHeader } from "@/components/site/section-header";
import { ShareActions } from "@/components/site/share-actions";
import { StoryRow } from "@/components/site/story-row";
import { TopicRail } from "@/components/site/topic-rail";
import { getPublicSiteUrl } from "@/config/env";
import { getMessages, isLocale, localizedPath } from "@/i18n";
import { formatArticleTime } from "@/lib/format";
import { getCachedHomeFeed } from "@/lib/editorial-queries";

export const revalidate = 60;

const bundledHero = "/media/neura-agents-hero.webp";

function FeatureCover({ src, alt }: { src: string; alt: string }) {
  if (src !== bundledHero) {
    return (
      <Image
        src={src}
        alt={alt}
        width={1536}
        height={1024}
        sizes="(max-width: 900px) 100vw, 48vw"
        fetchPriority="high"
        loading="eager"
        quality={75}
      />
    );
  }

  return (
    <picture>
      <source
        type="image/webp"
        srcSet={[
          "/media/neura-agents-hero-480.webp 480w",
          "/media/neura-agents-hero-750.webp 750w",
          "/media/neura-agents-hero-1200.webp 1200w",
          "/media/neura-agents-hero-1536.webp 1536w",
        ].join(", ")}
        sizes="(max-width: 900px) 100vw, 48vw"
      />
      <img
        src="/media/neura-agents-hero-750.webp"
        alt={alt}
        width={1536}
        height={1024}
        fetchPriority="high"
        loading="eager"
        decoding="async"
      />
    </picture>
  );
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = getMessages(locale);
  const feed = await getCachedHomeFeed(locale);
  const featurePath = localizedPath(`/articles/${feed.feature.slug}`, locale);
  const featureUrl = new URL(featurePath, getPublicSiteUrl()).toString();

  return (
    <main id="main-content" className="site-shell home-main">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-statement">
          <h1 id="home-title">{messages.home.heroTitle}</h1>
          <p>{messages.home.heroDescription}</p>
        </div>

        <article className="feature-story">
          <Link className="feature-story__image" href={featurePath}>
            <FeatureCover src={feed.feature.coverImage} alt={feed.feature.coverAlt} />
          </Link>
          <Link
            className="category-label"
            href={localizedPath(`/categories/${feed.feature.category.slug}`, locale)}
          >
            {feed.feature.category.name}
          </Link>
          <h2><Link href={featurePath}>{feed.feature.title}</Link></h2>
          <p>{feed.feature.excerpt}</p>
          <div className="feature-story__actions">
            <Link className="button button--primary" href={featurePath}>
              {messages.home.readAnalysis}
            </Link>
            <BookmarkButton articleId={feed.feature.id} copy={messages.bookmark} />
            <ShareActions
              url={featureUrl}
              title={feed.feature.title}
              labels={messages.share}
            />
          </div>
        </article>

        <aside className="latest-rail" aria-labelledby="latest-title">
          <SectionHeader
            id="latest-title"
            title={messages.home.latestEyebrow}
            href={localizedPath("/latest", locale)}
            linkLabel={messages.common.viewAll}
            accent
          />
          <div className="latest-rail__items">
            {feed.latest.map((article) => (
              <article key={article.id}>
                <time dateTime={article.publishedAt ?? undefined}>
                  {formatArticleTime(article.publishedAt, locale)}
                </time>
                <h3>
                  <Link href={localizedPath(`/articles/${article.slug}`, locale)}>
                    {article.title}
                  </Link>
                </h3>
                <BookmarkButton articleId={article.id} copy={messages.bookmark} compact />
              </article>
            ))}
          </div>
          <Link className="rail-link" href={localizedPath("/latest", locale)}>
            {messages.home.viewAllLatest} <ArrowRight aria-hidden="true" />
          </Link>
        </aside>
      </section>

      <section className="spotlight" aria-labelledby="spotlight-title">
        <SectionHeader
          id="spotlight-title"
          title={messages.home.featuredTitle}
          href={localizedPath("/latest", locale)}
          linkLabel={messages.home.allArticles}
        />
        <div className="spotlight__grid">
          {feed.spotlight.map((article, index) => (
            <StoryRow article={article} locale={locale} index={index} key={article.id} />
          ))}
        </div>
      </section>

      <NewsletterForm locale={locale} copy={messages.newsletter} source={`home-${locale}`} />
      <TopicRail categories={feed.categories} locale={locale} />
    </main>
  );
}
