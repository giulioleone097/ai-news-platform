"use client";

import { useSyncExternalStore } from "react";
import { Bookmark } from "lucide-react";
import type { Messages } from "@/i18n";
import { parseBookmarks, readBookmarksSnapshot, saveBookmarks, subscribeBookmarks } from "./bookmarks";

/** Save for later: a quiet icon button that fills when the story is saved in this browser. */
export function BookmarkButton({
  articleId,
  copy,
}: {
  articleId: string;
  copy: Messages["bookmark"];
}) {
  const snapshot = useSyncExternalStore(subscribeBookmarks, readBookmarksSnapshot, () => "[]");
  const savedArticles = parseBookmarks(snapshot);
  const saved = savedArticles.includes(articleId);
  const label = saved ? copy.removeLabel : copy.saveLabel;

  function toggle() {
    saveBookmarks(saved ? savedArticles.filter((id) => id !== articleId) : [...savedArticles, articleId]);
  }

  return (
    <button className="article-action" type="button" aria-pressed={saved} aria-label={label} title={label} onClick={toggle}>
      <Bookmark aria-hidden="true" fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
