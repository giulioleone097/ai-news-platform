import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CommentCapability,
  CommentLocale,
  OwnComment,
  PublicComment,
} from "@atlasnews/core/comments/domain/comment";

export type LoadStatus = "idle" | "loading" | "error";

type CommentPageResponse<Item> = {
  items: Item[];
  nextCursor: string | null;
  capability: CommentCapability;
};

function isCommentPage<Item>(value: unknown): value is CommentPageResponse<Item> {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<CommentPageResponse<Item>>;
  return Array.isArray(page.items)
    && (typeof page.nextCursor === "string" || page.nextCursor === null)
    && Boolean(page.capability && typeof page.capability.mutations === "boolean");
}

/** One page of comments, then the next on demand: the public ones or the reader's own, of an article or of one comment's replies. */
export function useCommentPage<Item extends PublicComment | OwnComment>({
  articleId,
  locale,
  parentId,
  enabled,
  scope,
}: {
  articleId: string;
  locale: CommentLocale;
  parentId: string | null;
  enabled: boolean;
  scope: "public" | "own";
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [capability, setCapability] = useState<CommentCapability | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const loadingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const loadMore = useCallback(async () => {
    if (!enabled || loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    setStatus("loading");
    const controller = new AbortController();
    controllerRef.current = controller;
    const params = new URLSearchParams({ articleId, locale });
    params.set("scope", scope);
    if (parentId) params.set("parentId", parentId);
    if (cursor) params.set("cursor", cursor);

    try {
      const response = await fetch(`/api/comments?${params}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const value = (await response.json()) as unknown;
      if (!response.ok || !isCommentPage<Item>(value)) {
        throw new Error(`Comment feed returned ${response.status}`);
      }
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...value.items.filter((item) => !known.has(item.id))];
      });
      setCapability(value.capability);
      setCursor(value.nextCursor);
      setStatus("idle");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setStatus("error");
      }
    } finally {
      loadingRef.current = false;
      controllerRef.current = null;
    }
  }, [articleId, cursor, enabled, locale, parentId, scope]);

  useEffect(() => {
    if (!enabled || cursor !== undefined) return;
    const timer = window.setTimeout(() => void loadMore(), 0);
    return () => window.clearTimeout(timer);
  }, [cursor, enabled, loadMore]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { capability, cursor, items, loadMore, status };
}
