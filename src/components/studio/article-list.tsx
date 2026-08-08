import Link from "next/link";
import { ArrowUpRight, Pencil } from "lucide-react";
import type { Locale, Messages } from "@/i18n";
import { formatArticleDate } from "@/lib/format";
import {
  formatArticleStatus,
  type Article,
} from "@/modules/editorial/domain/article";
import { studioSupplementalCopy } from "./studio-copy";

export function ArticleList({
  articles,
  locale,
  messages,
  limit,
}: {
  articles: Article[];
  locale: Locale;
  messages: Messages;
  limit?: number;
}) {
  const visibleArticles = typeof limit === "number" ? articles.slice(0, limit) : articles;
  const copy = studioSupplementalCopy[locale];

  if (!visibleArticles.length) {
    return (
      <div className="studio-empty-state">
        <span>00</span>
        <h2>{messages.studio.emptyTitle}</h2>
        <p>{messages.studio.emptyDescription}</p>
        <Link className="studio-button studio-button--primary" href={`/${locale}/studio/articles/new`}>
          {messages.studio.createArticle}
        </Link>
      </div>
    );
  }

  return (
    <div className="studio-table-wrap">
      <table className="studio-table">
        <thead>
          <tr>
            <th>{messages.studio.titleLabel}</th>
            <th>{messages.studio.statusLabel}</th>
            <th>{messages.studio.categoryLabel}</th>
            <th>{messages.studio.lastUpdatedLabel}</th>
            <th>
              <span className="sr-only">{messages.studio.actionsLabel}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleArticles.map((article) => (
            <tr key={article.id}>
              <td>
                <Link className="studio-table__title" href={`/${locale}/studio/articles/${article.id}`}>
                  <strong>{article.title}</strong>
                  <span>/{article.slug}</span>
                </Link>
              </td>
              <td data-label={messages.studio.statusLabel}>
                <span className={`studio-status studio-status--${article.status}`}>
                  {formatArticleStatus(article.status, locale)}
                </span>
              </td>
              <td data-label={messages.studio.categoryLabel}>{article.category.name}</td>
              <td data-label={messages.studio.lastUpdatedLabel}>
                {formatArticleDate(article.updatedAt, locale)}
              </td>
              <td>
                <span className="studio-row-actions">
                  <Link aria-label={`${copy.editStory}: ${article.title}`} href={`/${locale}/studio/articles/${article.id}`}>
                    <Pencil aria-hidden="true" size={16} />
                  </Link>
                  {article.status === "published" ? (
                    <Link
                      aria-label={`${copy.viewStory}: ${article.title}`}
                      href={`/${locale}/articles/${article.slug}`}
                      target="_blank"
                    >
                      <ArrowUpRight aria-hidden="true" size={17} />
                    </Link>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
