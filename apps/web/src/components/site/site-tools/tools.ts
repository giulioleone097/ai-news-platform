import {
  parsePageInput,
  type PageToolInput,
  type PageToolName,
} from "@atlasnews/contract/page";
import type { ClaimStatus } from "@atlasnews/core/editorial/domain/article";

/** What the tools need from the browser; the real one is `environment.ts`, tests pass a fake. */
export interface SiteToolsEnvironment {
  fetch: typeof fetch;
  /** Moves the visible page and resolves `true` once the address bar shows `path`. */
  navigate(path: string): Promise<boolean>;
  /** The story on screen now, or null when the page is not a story. */
  openArticle(): OpenArticle | null;
  /** Adds a story to the reader's bookmarks, the store the bookmark button uses. */
  addBookmark(id: string): { added: boolean; count: number };
}

export interface OpenArticle {
  id: string;
  slug: string;
  locale: string;
  claimStatus: ClaimStatus;
  title: string;
  entities: { slug: string; name: string }[];
  path: string;
  url: string;
}

export type ToolResult = Record<string, unknown>;
export type SiteTool = (input: unknown, signal?: AbortSignal) => Promise<ToolResult>;

/** An anticipated failure whose message is safe to hand to the agent. */
export class ToolFailure extends Error {
  override readonly name = "ToolFailure";
}

interface ListedStory {
  id: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  claimStatus: ClaimStatus;
  category: { slug: string; name: string };
  entity: { slug: string; name: string } | null;
}

/** The `data-*` attributes that the story page puts on its `<article>` element. */
export function parseArticleAttributes(html: string) {
  const tag = /<article\b[^>]*\bdata-article-id=[^>]*>/.exec(html)?.[0];
  const read = (name: string) => new RegExp(`\\bdata-${name}="([^"]*)"`).exec(tag ?? "")?.[1];
  const id = read("article-id");
  const slug = read("article-slug");
  return id && slug ? { id, slug } : null;
}

function story(item: ListedStory, locale: string) {
  return {
    slug: item.slug,
    title: item.title,
    path: `/${locale}/articles/${item.slug}`,
    claimStatus: item.claimStatus,
    publishedAt: item.publishedAt,
    category: item.category,
    entity: item.entity,
  };
}

export function createSiteTools(env: SiteToolsEnvironment): Record<PageToolName, SiteTool> {
  async function listStories(
    filters: { locale: string; q?: string; entity?: string; status?: string },
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({ locale: filters.locale });
    for (const key of ["q", "entity", "status"] as const) {
      if (filters[key]) params.set(key, filters[key]);
    }
    const response = await env.fetch(`/api/articles?${params}`, { signal });
    if (!response.ok) throw new ToolFailure("The site could not list the stories right now.");
    const body = (await response.json()) as { items: ListedStory[]; nextCursor: string | null };
    return {
      stories: body.items.map((item) => story(item, filters.locale)),
      hasMore: Boolean(body.nextCursor),
    };
  }

  async function showPage(path: string) {
    if (!(await env.navigate(path))) {
      throw new ToolFailure(`The page did not finish opening ${path}.`);
    }
  }

  /** The id and address of a published story, from the open page when it is that story. */
  async function findArticle(locale: string, slug: string, signal?: AbortSignal) {
    const open = env.openArticle();
    if (open?.locale === locale && open.slug === slug) return { id: open.id, path: open.path };
    const response = await env.fetch(`/${locale}/articles/${slug}`, { signal });
    if (response.status === 404) throw new ToolFailure(`No published article "${slug}" in locale ${locale}.`);
    if (!response.ok) throw new ToolFailure("The site could not load that article right now.");
    const attributes = parseArticleAttributes(await response.text());
    if (!attributes) throw new ToolFailure(`"${slug}" is not an article page.`);
    const path = response.url ? new URL(response.url, "http://site.invalid").pathname : `/${locale}/articles/${slug}`;
    return { id: attributes.id, path };
  }

  const run = {
    async search_articles({ locale, query, entity, claimStatus, limit }: PageToolInput<"search_articles">, signal) {
      // The search page and the API accept 120 characters, the catalogue 160.
      const q = query.slice(0, 120).trim();
      const path = `/${locale}/search?${new URLSearchParams({ q })}`;
      const [list] = await Promise.all([
        listStories({ locale, q, entity, status: claimStatus }, signal),
        showPage(path),
      ]);
      const notShown = [entity ? "entity" : null, claimStatus ? "claimStatus" : null].filter((filter) => filter);
      return {
        query: q,
        path,
        count: Math.min(list.stories.length, limit),
        hasMore: list.hasMore || list.stories.length > limit,
        items: list.stories.slice(0, limit),
        ...(notShown.length ? { notShownOnPage: notShown } : {}),
      };
    },

    async filter_feed({ locale, entity, claimStatus }: PageToolInput<"filter_feed">, signal) {
      // The site has an entity feed and a status feed, not one for both: the entity wins.
      const path = entity
        ? `/${locale}/entities/${entity}`
        : claimStatus
          ? `/${locale}/status/${claimStatus}`
          : `/${locale}`;
      if (entity && (await env.fetch(path, { method: "HEAD", signal })).status === 404) {
        throw new ToolFailure(`No entity "${entity}" in locale ${locale}.`);
      }
      const [list] = await Promise.all([
        listStories({ locale, entity, status: claimStatus }, signal),
        showPage(path),
      ]);
      return {
        path,
        count: list.stories.length,
        hasMore: list.hasMore,
        stories: list.stories,
        ...(entity && claimStatus ? { notShownOnPage: ["claimStatus"] } : {}),
      };
    },

    async open_article({ locale, slug }: PageToolInput<"open_article">, signal) {
      const target = await findArticle(locale, slug, signal);
      await showPage(target.path);
      const open = env.openArticle();
      if (!open) throw new ToolFailure("The page opened, but it is not showing the article.");
      return { opened: true, path: target.path, title: open.title };
    },

    async read_open_article(_input: PageToolInput<"read_open_article">, signal) {
      const open = env.openArticle();
      if (!open) throw new ToolFailure("No article is open. Open one with open_article first.");
      const response = await env.fetch(`${open.path}.md`, { signal });
      if (!response.ok) throw new ToolFailure("The site could not load the text of this article right now.");
      return {
        title: open.title,
        url: open.url,
        locale: open.locale,
        slug: open.slug,
        claimStatus: open.claimStatus,
        entities: open.entities,
        text: await response.text(),
      };
    },

    async save_article({ locale, slug }: PageToolInput<"save_article">, signal) {
      const target = await findArticle(locale, slug, signal);
      const { added, count } = env.addBookmark(target.id);
      return { saved: true, alreadySaved: !added, count };
    },
  } satisfies {
    [N in PageToolName]: (input: PageToolInput<N>, signal?: AbortSignal) => Promise<ToolResult>;
  };

  /** Checks the arguments, runs the tool and turns every failure into an `{ error }` result. */
  function guard<N extends PageToolName>(name: N): SiteTool {
    return async (raw, signal) => {
      const parsed = parsePageInput(name, raw);
      if (!parsed.ok) return { error: parsed.error };
      try {
        return await (run[name] as (input: PageToolInput<N>, signal?: AbortSignal) => Promise<ToolResult>)(parsed.input, signal);
      } catch (error) {
        if (error instanceof ToolFailure) return { error: error.message };
        return { error: signal?.aborted ? `${name} was cancelled.` : `${name} failed unexpectedly.` };
      }
    };
  }

  return {
    search_articles: guard("search_articles"),
    filter_feed: guard("filter_feed"),
    open_article: guard("open_article"),
    read_open_article: guard("read_open_article"),
    save_article: guard("save_article"),
  };
}
