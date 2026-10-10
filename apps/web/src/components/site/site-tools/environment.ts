import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";
import { ToolFailure, type OpenArticle, type SiteToolsEnvironment } from "./tools";

const bookmarkKey = "neura:saved";
const bookmarkEvent = "neura:saved";
const navigationTimeoutMs = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The same store as `BookmarkButton`: a JSON array of story ids in `localStorage`. */
function addBookmark(id: string) {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(bookmarkKey) || "[]");
    const saved = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    if (saved.includes(id)) return { added: false, count: saved.length };
    saved.push(id);
    localStorage.setItem(bookmarkKey, JSON.stringify(saved));
    window.dispatchEvent(new Event(bookmarkEvent));
    return { added: true, count: saved.length };
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

/** `push` is the app router's client-side navigation, so the agent's tools survive it. */
export function createBrowserEnvironment(push: (path: string) => void): SiteToolsEnvironment {
  return {
    fetch: (input, init) => fetch(input, init),
    async navigate(path) {
      const target = new URL(path, location.origin);
      if (target.origin !== location.origin) return false;
      const here = () => location.pathname + location.search;
      const wanted = target.pathname + target.search;
      if (here() !== wanted) {
        push(wanted);
        const deadline = Date.now() + navigationTimeoutMs;
        while (here() !== wanted) {
          if (Date.now() > deadline) return false;
          await sleep(50);
        }
      }
      // Let React finish painting the page the address bar already shows.
      await sleep(0);
      return true;
    },
    openArticle,
    addBookmark,
  };
}
