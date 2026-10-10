"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, Pencil } from "lucide-react";
import type { Locale, Messages } from "@/i18n";
import { formatArticleDate } from "@/lib/format";
import {
  formatArticleStatus,
  type Article,
} from "@atlasnews/core/editorial/domain/article";
import {
  deleteArticlesAction,
  publishArticlesAction,
  unpublishArticlesAction,
} from "@/app/[locale]/(studio)/studio/articles/bulk/actions";
import { BulkActionBar } from "./article-bulk/bulk-action-bar";
import { bulkCopy } from "./article-bulk/copy";
import styles from "./article-bulk/bulk.module.css";
import { pageSelectionState, selectedOnPage, setPageSelection, toggleArticle } from "./article-bulk/selection";
import type { BulkAction, BulkActionResult } from "./article-bulk/types";
import { studioSupplementalCopy } from "./studio-copy";

const bulkActions = {
  publish: publishArticlesAction,
  unpublish: unpublishArticlesAction,
  delete: deleteArticlesAction,
} satisfies Record<BulkAction, (locale: Locale, ids: string[]) => Promise<BulkActionResult>>;

/** `bulk` adds row checkboxes, a select-all control and the bulk action bar. */
export function ArticleList({
  articles,
  locale,
  messages,
  limit,
  bulk = false,
}: {
  articles: Article[];
  locale: Locale;
  messages: Messages;
  limit?: number;
  bulk?: boolean;
}) {
  const visibleArticles = typeof limit === "number" ? articles.slice(0, limit) : articles;
  const copy = studioSupplementalCopy[locale];
  const bulkText = bulkCopy[locale];
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [feedback, setFeedback] = useState<BulkActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const pageIds = visibleArticles.map((article) => article.id);
  const chosen = selectedOnPage(selected, pageIds);
  const selectAll = pageSelectionState(chosen.length, pageIds.length);

  function runBulk(action: BulkAction) {
    startTransition(async () => {
      const result = await bulkActions[action](locale, chosen);
      setFeedback(result);
      // A refusal keeps the selection so the person can adjust it and try again.
      if (result.status === "success") setSelected(new Set());
    });
  }

  return (
    <>
      {bulk ? (
        <>
          <div className={styles.toolbar}>
            <label className={styles.selectAll}>
              <input
                checked={selectAll === "all"}
                className={styles.checkbox}
                disabled={isPending}
                onChange={(event) => setSelected(setPageSelection(selected, pageIds, event.target.checked))}
                ref={(element) => {
                  if (element) element.indeterminate = selectAll === "some";
                }}
                type="checkbox"
              />
              {bulkText.selectAllOnPage}
            </label>
          </div>
          <p className="sr-only" role="status">
            {chosen.length ? bulkText.selectedCount(chosen.length) : ""}
          </p>
          {chosen.length ? (
            <BulkActionBar
              count={chosen.length}
              disabled={isPending}
              locale={locale}
              onRun={runBulk}
            />
          ) : null}
          <div aria-live="polite">
            {feedback ? (
              <p className={`studio-alert studio-alert--${feedback.status === "success" ? "success" : "error"}`}>
                {feedback.message}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
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
                  <div className={styles.titleCell}>
                    {bulk ? (
                      <label className={styles.checkCell}>
                        <input
                          aria-label={bulkText.selectArticle(article.title)}
                          checked={selected.has(article.id)}
                          className={styles.checkbox}
                          disabled={isPending}
                          onChange={() => setSelected(toggleArticle(selected, article.id))}
                          type="checkbox"
                        />
                      </label>
                    ) : null}
                    <Link
                      className={`studio-table__title ${styles.titleLink}`}
                      href={`/${locale}/studio/articles/${article.id}`}
                    >
                      <strong>{article.title}</strong>
                      <span>/{article.slug}</span>
                    </Link>
                  </div>
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
    </>
  );
}
