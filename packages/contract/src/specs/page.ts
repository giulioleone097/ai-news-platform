import * as z from "zod/v4";

import { pageState, readOnly } from "../annotations";
import { defineSpec } from "../capability";
import { searchArticles } from "./search-articles";
import { articleSlugSchema, claimStatusSchema, entitySlugSchema, localeSchema } from "./shared";

/**
 * Work that needs the open page: no server handler exists for these. The site registers them
 * as page tools and runs them against the reader's browser. Every tool answers with the fields
 * of its `output`; when it cannot do the work it answers `{ error }` instead, never throws.
 */
const storyRef = z.object({
  slug: z.string(),
  title: z.string(),
  path: z.string(),
  claimStatus: claimStatusSchema,
  publishedAt: z.string().nullable(),
  category: z.object({ slug: z.string(), name: z.string() }),
  entity: z.object({ slug: z.string(), name: z.string() }).nullable(),
});

export const filterFeed = defineSpec({
  name: "filter_feed",
  title: "Filter the feed",
  description:
    "Show the feed of one entity or one claim status on the page, or the main feed when neither is set. "
    + "Returns the page path and the stories shown. The page has no feed for both filters at once: "
    + "the entity feed is shown and the stories returned still match both.",
  input: z.object({
    locale: localeSchema,
    entity: entitySlugSchema.optional().describe("Entity slug to follow."),
    claimStatus: claimStatusSchema.optional(),
  }),
  output: z.object({
    path: z.string(),
    count: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    stories: z.array(storyRef),
    notShownOnPage: z.array(z.enum(["claimStatus"])).optional(),
  }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

export const openArticle = defineSpec({
  name: "open_article",
  title: "Open an article",
  description: "Open one published story on this site. Returns the page path and the title once it is open.",
  input: z.object({ locale: localeSchema, slug: articleSlugSchema }),
  output: z.object({ opened: z.boolean(), path: z.string(), title: z.string() }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

export const readOpenArticle = defineSpec({
  name: "read_open_article",
  title: "Read the open article",
  description:
    "Read the story that the reader sees now. Returns its title, URL, claim status and entities, "
    + "and its text as Markdown with the key points and the sources. Returns an error when no story is open.",
  input: z.object({}),
  output: z.object({
    title: z.string(),
    url: z.string(),
    locale: z.string(),
    slug: z.string(),
    claimStatus: claimStatusSchema,
    entities: z.array(z.object({ slug: z.string(), name: z.string() })),
    text: z.string(),
  }),
  annotations: readOnly,
  scopes: [],
  surfaces: ["page"],
});

export const saveArticle = defineSpec({
  name: "save_article",
  title: "Save an article",
  description:
    "Save one story in the bookmarks of this browser. Returns whether it was already saved and how many stories are saved.",
  input: z.object({ locale: localeSchema, slug: articleSlugSchema }),
  output: z.object({ saved: z.boolean(), alreadySaved: z.boolean(), count: z.number().int().positive() }),
  annotations: pageState,
  scopes: [],
  surfaces: ["page"],
});

/** The reader tools of the page, in the order the site registers them. */
export const pageSpecs = [searchArticles, filterFeed, openArticle, readOpenArticle, saveArticle] as const;
