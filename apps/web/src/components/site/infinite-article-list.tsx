"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Locale } from "@atlasnews/core/locale";
import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { groupByDay } from "@atlasnews/core/editorial/domain/editorial-service";
import type { Messages } from "@/i18n";
import type { FeedItem } from "./feed-item";
import { formatDay } from "./feed-format";
import { FeedRow, type StatusLabels } from "./feed-row";

interface FeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
}

export interface FeedFilters {
  category?: string;
  entity?: string;
  status?: ClaimStatus;
  query?: string;
}

const noSubscription = () => () => {};
const utcToday = () => new Date().toISOString().slice(0, 10);

/** Stories grouped by UTC day, newest first; older pages load as the end of the list nears. */
export function InfiniteArticleList({
  initialItems,
  initialNextCursor,
  locale,
  filters = {},
  copy,
  dayCopy,
  statusLabels,
}: {
  initialItems: FeedItem[];
  initialNextCursor: string | null;
  locale: Locale;
  filters?: FeedFilters;
  copy: Messages["latest"];
  dayCopy: Messages["feed"]["day"];
  statusLabels: StatusLabels;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialNextCursor);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [hasLoaded, setHasLoaded] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  // "Today" and "Yesterday" need the reader's clock, so they appear after hydration only.
  const today = useSyncExternalStore(noSubscription, utcToday, () => "");
  const { category, entity, status: claimStatus, query } = filters;

  const loadMore = useCallback(async () => {
    if (!cursor || loadingRef.current) return;

    loadingRef.current = true;
    setStatus("loading");
    const controller = new AbortController();
    controllerRef.current = controller;
    const params = new URLSearchParams({ locale, cursor });
    if (category) params.set("category", category);
    if (entity) params.set("entity", entity);
    if (claimStatus) params.set("status", claimStatus);
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

      setItems((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...data.items.filter((item) => !existingIds.has(item.id))];
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
  }, [category, claimStatus, cursor, entity, locale, query]);

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

  const yesterday = today
    ? new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    : "";
  const dayLabel = (date: string) => {
    const label = formatDay(date, locale);
    if (date === today) return `${dayCopy.today} · ${label}`;
    return date === yesterday ? `${dayCopy.yesterday} · ${label}` : label;
  };

  return (
    <>
      <div aria-busy={status === "loading"} data-infinite-feed="true">
        {groupByDay(items).map((group) => (
          <section className="feed-day" aria-labelledby={`feed-day-${group.date}`} key={group.date}>
            <h2 className="feed-day__heading" id={`feed-day-${group.date}`}>{dayLabel(group.date)}</h2>
            <ul className="feed-list">
              {group.items.map((item) => (
                <FeedRow item={item} locale={locale} statusLabels={statusLabels} key={item.id} />
              ))}
            </ul>
          </section>
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
