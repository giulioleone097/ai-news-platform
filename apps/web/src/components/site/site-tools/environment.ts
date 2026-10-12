import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { parseBookmarks, readBookmarksSnapshot, saveBookmarks } from "../bookmarks";
import { createNavigator } from "./navigate";
import { ToolFailure, type OpenArticle, type SiteToolsEnvironment } from "./tools";

/** The same store as `BookmarkButton`. */
function addBookmark(id: string) {
  try {
    const saved = parseBookmarks(readBookmarksSnapshot());
    if (saved.includes(id)) return { added: false, count: saved.length };
    saveBookmarks([...saved, id]);
    return { added: true, count: saved.length + 1 };
  } catch {
    throw new ToolFailure("Bookmarks are not available in this browser.");
  }
}

/** The entities of the story, from the JSON-LD that the story page already carries. */
function entitiesFromJsonLd() {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent ?? "") as {
        "@type"?: string;
        headline?: string;
        about?: { name: string; url: string };
        mentions?: { name: string; url: string }[];
      };
      if (data["@type"] !== "NewsArticle") continue;
      const entities = [data.about, ...(data.mentions ?? [])]
        .filter((entity): entity is { name: string; url: string } => Boolean(entity))
        .map((entity) => ({ name: entity.name, slug: new URL(entity.url).pathname.split("/").pop() ?? "" }));
      return { title: data.headline, entities };
    } catch {
      // A script that is not valid JSON is not the one we want.
    }
  }
  return { title: undefined, entities: [] };
}

function openArticle(): OpenArticle | null {
  const node = document.querySelector<HTMLElement>("article[data-article-id]");
  if (!node) return null;
  const path = location.pathname.replace(/\/$/, "");
  const match = /^\/([^/]+)\/articles\/([^/]+)$/.exec(path);
  const { articleId, articleSlug, claimStatus } = node.dataset;
  if (!match || !articleId || !claimStatus || decodeURIComponent(match[2]) !== articleSlug) return null;
  const { title, entities } = entitiesFromJsonLd();
  return {
    id: articleId,
    slug: match[2],
    locale: match[1],
    claimStatus: claimStatus as ClaimStatus,
    title: title ?? node.querySelector("h1")?.textContent?.trim() ?? document.title,
    entities,
    path,
    url: `${location.origin}${path}`,
  };
}

export function createBrowserEnvironment(push: (path: string) => void): SiteToolsEnvironment {
  return {
    fetch: (input, init) => fetch(input, init),
    navigate: createNavigator(push),
    openArticle,
    addBookmark,
  };
}
