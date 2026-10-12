import Link from "next/link";
import { Search } from "lucide-react";
import type { Article, ArticleCursor, Category } from "@atlasnews/core/editorial/domain/article";
import { encodeArticleCursor } from "@atlasnews/core/editorial/application/public-feed";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import "@/styles/site/lists.css";
import { FeedAside } from "./feed-aside";
import { toFeedItem } from "./feed-item";
import { InfiniteArticleList } from "./infinite-article-list";
import { TopicRail } from "./topic-rail";

/**
 * Latest, a topic and search share one page: heading, search field and topic filter, then the
 * stream, with the most covered products in a side column that starts level with the stream.
 * `searchPage` makes the field the point of the page and lets the topic filter keep the query.
 */
export function ArticleArchive({
  title,
  description,
  articles,
  categories,
  query = "",
  activeCategory,
  locale,
  nextCursor,
  searchPage = false,
}: {
  title: string;
  description: string;
  articles: Article[];
  categories: Category[];
  query?: string;
  activeCategory?: string;
  locale: Locale;
  nextCursor: ArticleCursor | null;
  searchPage?: boolean;
}) {
  const messages = getMessages(locale);
  // A search with nothing typed yet has no results to show: offer the topics and the products instead.
  const idle = searchPage && !query;
  const keepQuery = searchPage && Boolean(query);
  const topicHref = (slug?: string) => {
    if (!keepQuery) return localizedPath(slug ? `/categories/${slug}` : "/latest", locale);
    const params = new URLSearchParams({ q: query });
    if (slug) params.set("category", slug);
    return `${localizedPath("/search", locale)}?${params}`;
  };

  return (
    <div className="archive">
      <header className="page-head">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <div className="archive__tools">
        <form
          className={searchPage ? "archive-search archive-search--large" : "archive-search"}
          action={localizedPath("/search", locale)}
          role="search"
        >
          <label className="sr-only" htmlFor="archive-search">{messages.search.label}</label>
          <input
            className="input"
            id="archive-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder={messages.search.placeholder}
          />
          {keepQuery && activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
          <button className="button" type="submit">
            <Search aria-hidden="true" />
            {messages.search.submit}
          </button>
        </form>

        <nav className="status-filter" aria-label={messages.search.filterLabel}>
          <Link aria-current={activeCategory ? undefined : "page"} href={topicHref()} prefetch={false}>
            {messages.search.allCategories}
          </Link>
          {categories.map((category) => (
            <Link
              aria-current={activeCategory === category.slug ? "page" : undefined}
              key={category.id}
              href={topicHref(category.slug)}
              prefetch={false}
            >
              {category.name}
            </Link>
          ))}
        </nav>

        {keepQuery && articles.length ? (
          <p className="archive__count" role="status">
            {articles.length}{nextCursor ? "+" : ""} {articles.length === 1 && !nextCursor ? messages.search.resultOne : messages.search.resultMany}
          </p>
        ) : null}
      </div>

      <section className="feed" aria-label={title}>
        {articles.length ? (
          <InfiniteArticleList
            initialItems={articles.map(toFeedItem)}
            initialNextCursor={encodeArticleCursor(nextCursor)}
            locale={locale}
            filters={{ category: activeCategory, query: query || undefined }}
            copy={messages.latest}
            feedCopy={messages.feed}
            statusLabels={messages.story.claimStatus}
          />
        ) : (
          <>
            {idle ? null : (
              <div className="empty-state">
                <h2>{messages.search.noResultsTitle}</h2>
                <p>{messages.search.noResultsDescription}</p>
                <Link className="button" href={localizedPath("/latest", locale)}>{messages.search.viewLatest}</Link>
              </div>
            )}
            <TopicRail categories={categories} locale={locale} />
          </>
        )}
      </section>

      <FeedAside locale={locale} />
    </div>
  );
}
