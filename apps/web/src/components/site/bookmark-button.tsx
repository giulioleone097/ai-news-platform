"use client";

import { useSyncExternalStore } from "react";
import { Bookmark } from "lucide-react";
import type { Messages } from "@/i18n";
import { parseBookmarks, readBookmarksSnapshot, saveBookmarks, subscribeBookmarks } from "./bookmarks";

export function BookmarkButton({
  articleId,
  copy,
  compact = false,
}: {
  articleId: string;
  copy: Messages["bookmark"];
  compact?: boolean;
}) {
  const snapshot = useSyncExternalStore(subscribeBookmarks, readBookmarksSnapshot, () => "[]");
  const savedArticles = parseBookmarks(snapshot);
  const saved = savedArticles.includes(articleId);

  function toggle() {
    saveBookmarks(saved ? savedArticles.filter((id) => id !== articleId) : [...savedArticles, articleId]);
  }

  return (
    <button
      className={compact ? "icon-action" : "text-action"}
      type="button"
      aria-pressed={saved}
      aria-label={saved ? copy.removeLabel : copy.saveLabel}
      onClick={toggle}
    >
      <Bookmark aria-hidden="true" fill={saved ? "currentColor" : "none"} />
      {!compact && <span>{saved ? copy.saved : copy.save}</span>}
    </button>
  );
}
