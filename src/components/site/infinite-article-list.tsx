"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Messages, Locale } from "@/i18n";
import type { ArticleListItem } from "@/modules/editorial/application/public-feed";
import { StoryRow } from "./story-row";

interface FeedResponse {
  items: ArticleListItem[];
  nextCursor: string | null;
}

export function InfiniteArticleList({
  initialArticles,
  initialNextCursor,
  locale,
  category,
  query,
  copy,
}: {
  initialArticles: ArticleListItem[];
  initialNextCursor: string | null;
  locale: Locale;
  category?: string;
  query?: string;
  copy: Messages["latest"];
}) {
  const [articles, setArticles] = useState(initialArticles);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [hasLoaded, setHasLoaded] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingRef.current) return;

    loadingRef.current = true;
    setStatus("loading");
    const controller = new AbortController();
    controllerRef.current = controller;
    const params = new URLSearchParams({ locale, cursor });
    if (category) params.set("category", category);
    if (query) params.set("q", query);

    try {
      const response = await fetch(`/api/articles?${params}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Article feed returned ${response.status}`);
      const data = (await response.json()) as FeedResponse;
      if (
        !Array.isArray(data.items) ||
        !(typeof data.nextCursor === "string" || data.nextCursor === null)
      ) {
        throw new Error("Article feed returned an invalid payload");
      }

      setArticles((current) => {
        const existingIds = new Set(current.map((article) => article.id));
        return [
          ...current,
          ...data.items.filter((article) => !existingIds.has(article.id)),
        ];
      });
      setCursor(data.nextCursor);
      setHasLoaded(true);
      setStatus("idle");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setStatus("error");
      }
    } finally {
      loadingRef.current = false;
      controllerRef.current = null;
    }
  }, [category, cursor, locale, query]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "800px 0px", threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return (
    <>
      <div aria-busy={status === "loading"} data-infinite-feed="true">
        {articles.map((article, index) => (
          <StoryRow article={article} locale={locale} index={index} key={article.id} />
        ))}
      </div>
      <div
        className="infinite-scroll"
        data-state={status}
        ref={sentinelRef}
      >
        {cursor ? (
          <button
            className="button button--quiet"
            disabled={status === "loading"}
            onClick={() => void loadMore()}
            type="button"
          >
            {status === "loading"
              ? copy.loadingMore
              : status === "error"
                ? copy.retry
                : copy.loadMore}
          </button>
        ) : hasLoaded ? (
          <p aria-hidden="true">{copy.endOfResults}</p>
        ) : null}
        <span className="sr-only" aria-live="polite" role="status">
          {status === "loading"
            ? copy.loadingMore
            : status === "error"
              ? copy.loadError
              : !cursor && hasLoaded
                ? copy.endOfResults
                : ""}
        </span>
      </div>
    </>
  );
}
