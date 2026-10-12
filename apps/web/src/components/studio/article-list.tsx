"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import type { Locale, Messages } from "@/i18n";
import { ClaimChip } from "@/components/site/claim-chip";
import {
  formatArticleStatus,
  type Article,
  type ArticleStatus,
} from "@atlasnews/core/editorial/domain/article";
import {
  deleteArticlesAction,
  publishArticlesAction,
  unpublishArticlesAction,
} from "@/app/[locale]/(studio)/studio/articles/bulk/actions";
import { Badge, type BadgeTone } from "./badge";
import { BulkActionBar } from "./article-bulk/bulk-action-bar";
import { bulkCopy } from "./article-bulk/copy";
import { Note } from "./note";
import { pageSelectionState, selectedOnPage, setPageSelection, toggleArticle } from "./article-bulk/selection";
import type { BulkAction, BulkActionResult } from "./article-bulk/types";
import { studioSupplementalCopy } from "./studio-copy";
import { whenLabel } from "./studio-format";

const statusTone: Record<ArticleStatus, BadgeTone> = {
  draft: "neutral",
  review: "warning",
  scheduled: "info",
  published: "success",
};

const bulkActions = {
  publish: publishArticlesAction,
  unpublish: unpublishArticlesAction,
  delete: deleteArticlesAction,
} satisfies Record<BulkAction, (locale: Locale, ids: string[]) => Promise<BulkActionResult>>;

/**
 * `bulk` is the full list: select-all in the header, row checkboxes, the bulk action bar, and the claim and
 * author columns. `now` is the server's clock, so the relative dates match between server and browser.
 */
export function ArticleList({
  articles,
  locale,
  messages,
  now,
  limit,
  bulk = false,
  sort,
}: {
  articles: Article[];
  locale: Locale;
  messages: Messages;
  now: number;
  limit?: number;
  bulk?: boolean;
  /** The "Last updated" header links to `href`, which flips the order. */
  sort?: { order: "asc" | "desc"; href: string };
}) {
  const visibleArticles = typeof limit === "number" ? articles.slice(0, limit) : articles;
  const copy = studioSupplementalCopy[locale];
  const bulkText = bulkCopy[locale];
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [feedback, setFeedback] = useState<BulkActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!visibleArticles.length) {
    return (
      <div className="empty-state">
        <h2>{messages.studio.emptyTitle}</h2>
        <p>{messages.studio.emptyDescription}</p>
        <Link className="button button--primary" href={`/${locale}/studio/articles/new`}>
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

  const SortArrow = sort?.order === "asc" ? ArrowUp : ArrowDown;

  return (
    <>
      {bulk ? (
        <>
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
            {feedback ? <Note tone={feedback.status === "success" ? "success" : "error"}>{feedback.message}</Note> : null}
          </div>
        </>
      ) : null}
      <div className="studio-table-wrap">
        <table className={`studio-table studio-table--articles${bulk ? " studio-table--select" : ""}`}>
          <thead>
            <tr>
              <th>
                {bulk ? (
                  <label className="studio-title-cell">
                    <span className="studio-check-cell">
                      <input
                        aria-label={bulkText.selectAllOnPage}
                        checked={selectAll === "all"}
                        className="studio-check"
                        disabled={isPending}
                        onChange={(event) => setSelected(setPageSelection(selected, pageIds, event.target.checked))}
                        ref={(element) => {
                          if (element) element.indeterminate = selectAll === "some";
                        }}
                        type="checkbox"
                      />
                    </span>
                    {messages.studio.titleLabel}
                  </label>
                ) : (
                  messages.studio.titleLabel
                )}
              </th>
              <th>{copy.publicationLabel}</th>
              {bulk ? <th>{messages.studio.claimColumn}</th> : null}
              <th className={bulk ? "studio-wide-only" : undefined}>{messages.studio.categoryLabel}</th>
              {bulk ? <th className="studio-wide-only">{messages.studio.authorLabel}</th> : null}
              <th aria-sort={sort ? (sort.order === "asc" ? "ascending" : "descending") : undefined}>
                {sort ? (
                  <Link className="studio-sort" href={sort.href}>
                    {messages.studio.lastUpdatedLabel}
                    <SortArrow aria-hidden="true" />
                  </Link>
                ) : (
                  messages.studio.lastUpdatedLabel
                )}
              </th>
              <th>
                <span className="sr-only">{messages.studio.actionsLabel}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleArticles.map((article) => {
              const updated = whenLabel(article.updatedAt, locale, now);
              const status = formatArticleStatus(article.status, locale);
              return (
                <tr key={article.id}>
                  <td className="studio-table__main">
                    <div className="studio-title-cell">
                      {bulk ? (
                        <label className="studio-check-cell">
                          <input
                            aria-label={bulkText.selectArticle(article.title)}
                            checked={selected.has(article.id)}
                            className="studio-check"
                            disabled={isPending}
                            onChange={() => setSelected(toggleArticle(selected, article.id))}
                            type="checkbox"
                          />
                        </label>
                      ) : null}
                      <Link className="studio-cell" href={`/${locale}/studio/articles/${article.id}`}>
                        <strong>{article.title}</strong>
                        <small>/{article.slug}</small>
                        {bulk ? <small className="studio-cell__where">{article.category.name} · {article.author.name}</small> : null}
                        <small className="studio-cell__meta">
                          {[
                            status,
                            bulk ? messages.story.claimStatus[article.claimStatus] : null,
                            article.category.name,
                            bulk ? article.author.name : null,
                            updated.text,
                          ].map((part, index) => (part ? <span key={index}>{part}</span> : null))}
                        </small>
                      </Link>
                    </div>
                  </td>
                  <td data-label={copy.publicationLabel}>
                    <Badge tone={statusTone[article.status]}>{status}</Badge>
                  </td>
                  {bulk ? (
                    <td data-label={messages.studio.claimColumn}>
                      <ClaimChip label={messages.story.claimStatus[article.claimStatus]} status={article.claimStatus} />
                    </td>
                  ) : null}
                  <td className={bulk ? "studio-wide-only" : undefined} data-label={messages.studio.categoryLabel}>
                    {article.category.name}
                  </td>
                  {bulk ? (
                    <td className="studio-nowrap studio-wide-only" data-label={messages.studio.authorLabel}>
                      {article.author.name}
                    </td>
                  ) : null}
                  <td data-label={messages.studio.lastUpdatedLabel}>
                    <time dateTime={article.updatedAt} title={updated.title}>{updated.text}</time>
                  </td>
                  <td className="studio-table__actions">
                    {article.status === "published" ? (
                      <Link
                        aria-label={`${copy.viewStory}: ${article.title}`}
                        className="studio-icon-button"
                        href={`/${locale}/articles/${article.slug}`}
                        target="_blank"
                      >
                        <ArrowUpRight aria-hidden="true" />
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
