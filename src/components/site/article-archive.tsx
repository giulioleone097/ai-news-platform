import Link from "next/link";
import { Search } from "lucide-react";
import type { Article, Category } from "@/modules/editorial/domain/article";
import { getMessages, localizedPath, type Locale } from "@/i18n";
import {
  encodeArticleCursor,
  toArticleListItem,
} from "@/modules/editorial/application/public-feed";
import type { ArticleCursor } from "@/modules/editorial/domain/article";
import { InfiniteArticleList } from "./infinite-article-list";

export function ArticleArchive({
  title,
  description,
  articles,
  categories,
  query = "",
  activeCategory,
  locale,
  nextCursor,
}: {
  title: string;
  description: string;
  articles: Article[];
  categories: Category[];
  query?: string;
  activeCategory?: string;
  locale: Locale;
  nextCursor: ArticleCursor | null;
}) {
  const messages = getMessages(locale);

  return (
    <div className="archive">
      <header className="archive__header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <form className="archive-search" action={localizedPath("/search", locale)} role="search">
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="archive-search">{messages.search.label}</label>
        <input
          id="archive-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={messages.search.placeholder}
        />
        <button type="submit">{messages.search.submit}</button>
      </form>

      <nav className="category-filter" aria-label={messages.search.filterLabel}>
        <Link className={!activeCategory ? "is-active" : ""} href={localizedPath("/latest", locale)}>
          {messages.search.allCategories}
        </Link>
        {categories.map((category) => (
          <Link
            className={activeCategory === category.slug ? "is-active" : ""}
            key={category.id}
            href={localizedPath(`/categories/${category.slug}`, locale)}
          >
            {category.name}
          </Link>
        ))}
      </nav>

      <div className="archive-list">
        {articles.length ? (
          <InfiniteArticleList
            initialArticles={articles.map(toArticleListItem)}
            initialNextCursor={encodeArticleCursor(nextCursor)}
            locale={locale}
            category={activeCategory}
            query={query || undefined}
            copy={messages.latest}
          />
        ) : (
          <div className="empty-state">
            <h2>{messages.search.noResultsTitle}</h2>
            <p>{messages.search.noResultsDescription}</p>
            <Link className="button" href={localizedPath("/latest", locale)}>{messages.search.viewLatest}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
