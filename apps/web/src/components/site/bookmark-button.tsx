"use client";

import { useSyncExternalStore } from "react";
import { Bookmark } from "lucide-react";
import type { Messages } from "@/i18n";

export function BookmarkButton({
  articleId,
  copy,
  compact = false,
}: {
  articleId: string;
  copy: Messages["bookmark"];
  compact?: boolean;
}) {
  const snapshot = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener("neura:saved", onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener("neura:saved", onChange);
      };
    },
    () => localStorage.getItem("neura:saved") || "[]",
    () => "[]",
  );
  let savedArticles: string[] = [];
  try {
    const parsed = JSON.parse(snapshot) as unknown;
    savedArticles = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    savedArticles = [];
  }
  const saved = savedArticles.includes(articleId);

  function toggle() {
    const nextSavedArticles = new Set(savedArticles);
    if (saved) nextSavedArticles.delete(articleId);
    else nextSavedArticles.add(articleId);
    localStorage.setItem("neura:saved", JSON.stringify([...nextSavedArticles]));
    window.dispatchEvent(new Event("neura:saved"));
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
