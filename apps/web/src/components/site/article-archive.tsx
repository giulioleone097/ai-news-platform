import Link from "next/link";
import { Search } from "lucide-react";
import type { Article, ArticleCursor, Category } from "@atlasnews/core/editorial/domain/article";
import { encodeArticleCursor } from "@atlasnews/core/editorial/application/public-feed";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import "@/styles/site/lists.css";
import { FeedAside } from "./feed-aside";
import { toFeedItem } from "./feed-item";
import { InfiniteArticleList } from "./infinite-article-list";

/**
 * Latest, a topic and search share one page: heading, search field, category filter, then the
 * stream beside the status legend. `searchPage` makes the field the point of the page.
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
  // Search with nothing typed yet has no results to show: offer the other ways in.
  const idle = searchPage && !query;

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
          <button className={searchPage ? "button button--primary" : "button"} type="submit">
            <Search aria-hidden="true" />
            {messages.search.submit}
          </button>
        </form>

        <nav className="status-filter" aria-label={messages.search.filterLabel}>
          <Link
            aria-current={!activeCategory && !searchPage ? "page" : undefined}
            href={localizedPath("/latest", locale)}
            prefetch={false}
          >
            {messages.search.allCategories}
          </Link>
          {categories.map((category) => (
            <Link
              aria-current={activeCategory === category.slug ? "page" : undefined}
              key={category.id}
              href={localizedPath(`/categories/${category.slug}`, locale)}
              prefetch={false}
            >
              {category.name}
            </Link>
          ))}
        </nav>
      </div>

      {idle ? (
        <FeedAside className="archive-suggest" locale={locale} />
      ) : (
        <div className="feed-layout">
          <section className="feed" aria-label={title}>
            {articles.length ? (
              <InfiniteArticleList
                initialItems={articles.map(toFeedItem)}
                initialNextCursor={encodeArticleCursor(nextCursor)}
                locale={locale}
                filters={{ category: activeCategory, query: query || undefined }}
                copy={messages.latest}
                dayCopy={messages.feed.day}
                statusLabels={messages.story.claimStatus}
              />
            ) : (
              <div className="empty-state">
                <h2>{messages.search.noResultsTitle}</h2>
                <p>{messages.search.noResultsDescription}</p>
                <Link className="button" href={localizedPath("/latest", locale)}>{messages.search.viewLatest}</Link>
              </div>
            )}
          </section>
          <FeedAside locale={locale} />
        </div>
      )}
    </div>
  );
}
