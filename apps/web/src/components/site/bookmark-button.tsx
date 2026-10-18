"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import type { Messages } from "@/i18n";
import { parseBookmarks, readBookmarksSnapshot, saveBookmarks, subscribeBookmarks } from "./bookmarks";

/**
 * Save for later: a quiet icon button that fills when the story is saved in this browser.
 * Both icon states are server-rendered nodes so the icon library stays out of the client bundle.
 */
export function BookmarkButton({
  articleId,
  copy,
  icons,
}: {
  articleId: string;
  copy: Messages["bookmark"];
  icons: { idle: ReactNode; saved: ReactNode };
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
      {saved ? icons.saved : icons.idle}
    </button>
  );
}
